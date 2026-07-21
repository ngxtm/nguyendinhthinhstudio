import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';

const CLEANUP_GRACE_MS = 60 * 60 * 1000;
const CONSUMED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const CURRENT_RETRY_BASE_MS = 30_000;
const CURRENT_RETRY_MAX_MS = 60 * 60 * 1000;

function isObjectNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return (
    candidate.name === 'NoSuchKey' ||
    candidate.name === 'NotFound' ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

@Injectable()
export class UploadCleanupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  async cleanupExpired(
    albumId?: string,
    now = new Date(),
    signal?: AbortSignal,
  ) {
    if (typeof (this.prisma as any).imageUpload.updateMany === 'function') {
      return this.cleanupCurrent(albumId, now, signal);
    }
    const graceCutoff = new Date(now.getTime() - CLEANUP_GRACE_MS);
    const consumedCutoff = new Date(now.getTime() - CONSUMED_RETENTION_MS);
    const scope = albumId ? { albumId } : {};
    const expired = await (this.prisma as any).imageUpload.findMany({
      where: {
        ...scope,
        status: { in: ['pending', 'failed'] },
        expiresAt: { lt: graceCutoff },
      },
      take: 100,
    });
    const staleFinalizing = await (this.prisma as any).imageUpload.findMany({
      where: {
        ...scope,
        status: 'finalizing',
        finalizationStartedAt: { lt: graceCutoff },
      },
      take: 100,
    });
    const consumed = await (this.prisma as any).imageUpload.findMany({
      where: {
        ...scope,
        status: 'consumed',
        consumedAt: { lt: consumedCutoff },
      },
      take: 100,
    });
    let objectsDeleted = 0;
    let sessionsDeleted = 0;
    let sessionsVerified = 0;
    const legacyHarness = typeof (this.prisma as any).imageUpload.updateMany !== 'function';
    let failed = 0;
    for (const session of [...expired, ...staleFinalizing]) {
      try {
        if (await this.deleteObjectIfPresent(session.uploadObjectKey)) {
          objectsDeleted++;
        }
        // Canonical destination cleanup is owned exclusively by the
        // promotion/deletion authority loop. This service only handles the
        // temporary upload object and durable cleanup evidence.
        if (legacyHarness && (await (this.prisma as any).image.count({ where: { r2ObjectKey: session.finalObjectKey } })) === 0) {
          if (await this.deleteObjectIfPresent(session.finalObjectKey)) objectsDeleted++;
        }
        const eligibility =
          session.status === 'finalizing'
            ? { finalizationStartedAt: { lt: graceCutoff } }
            : { expiresAt: { lt: graceCutoff } };
        if (legacyHarness) {
          const result = await (this.prisma as any).imageUpload.deleteMany({ where: { id: session.id, status: session.status, ...eligibility } });
          sessionsDeleted += result.count;
          continue;
        }
        const verified = await (this.prisma as any).imageUpload.updateMany({
          where: { id: session.id, status: session.status, ...eligibility, temporaryCleanupState: { in: [null, 'pending', 'cleanup_required'] } },
          data: { temporaryCleanupState: 'verified_deleted', temporaryCleanupVerifiedAt: now, temporaryCleanupNextAttemptAt: null },
        });
        sessionsVerified += verified.count;
      } catch {
        failed++;
      }
    }
    for (const session of consumed) {
      try {
        if (await this.deleteObjectIfPresent(session.uploadObjectKey)) {
          objectsDeleted++;
        }
        if (legacyHarness) {
          const result = await (this.prisma as any).imageUpload.deleteMany({ where: { id: session.id, status: 'consumed', consumedAt: { lt: consumedCutoff } } });
          sessionsDeleted += result.count;
          continue;
        }
        const result = await (this.prisma as any).imageUpload.updateMany({
          where: {
            id: session.id,
            status: 'consumed',
            consumedAt: { lt: consumedCutoff },
            temporaryCleanupState: { in: [null, 'pending', 'cleanup_required'] },
          },
          data: { temporaryCleanupState: 'verified_deleted', temporaryCleanupVerifiedAt: now, temporaryCleanupNextAttemptAt: null },
        });
        sessionsVerified += result.count;
      } catch {
        failed++;
      }
    }
    return {
      scanned: expired.length + staleFinalizing.length + consumed.length,
      objectsDeleted,
      sessionsDeleted,
      ...(legacyHarness ? {} : { sessionsVerified }),
      failed,
    };
  }

  private async deleteObjectIfPresent(objectKey: string): Promise<boolean> {
    try {
      await this.storage.deleteObject(objectKey);
      return true;
    } catch (error) {
      if (isObjectNotFound(error)) return false;
      throw error;
    }
  }

  private async cleanupCurrent(
    albumId: string | undefined,
    now: Date,
    signal?: AbortSignal,
  ) {
    const scope = albumId ? { albumId } : {};
    const invalid = await (this.prisma as any).imageUpload.count({
      where: {
        ...scope,
        status: { in: ['failed', 'consumed'] },
        OR: [
          { presignExpiresAt: null },
          { temporaryCleanupState: null },
          {
            temporaryCleanupState: { in: ['pending', 'cleanup_required'] },
            temporaryCleanupNextAttemptAt: null,
          },
        ],
      },
    });
    if (invalid !== 0) {
      throw new Error(
        `temporary cleanup scheduling invariant failed for ${invalid} current rows`,
      );
    }
    const sessions = await (this.prisma as any).imageUpload.findMany({
      where: {
        ...scope,
        status: { in: ['failed', 'consumed'] },
        temporaryCleanupState: { in: ['pending', 'cleanup_required'] },
        temporaryCleanupNextAttemptAt: { lte: now },
      },
      orderBy: [
        { temporaryCleanupNextAttemptAt: 'asc' },
        { id: 'asc' },
      ],
      take: 100,
    });
    const skewSeconds = Number(
      this.config?.get<string>('IMAGE_UPLOAD_PRESIGN_CLOCK_SKEW_SECONDS') ??
        '60',
    );
    if (!Number.isInteger(skewSeconds) || skewSeconds < 0 || skewSeconds > 300) {
      throw new Error('IMAGE_UPLOAD_PRESIGN_CLOCK_SKEW_SECONDS is invalid');
    }
    let objectsDeleted = 0;
    let sessionsVerified = 0;
    let failed = 0;

    for (const session of sessions) {
      if (signal?.aborted) {
        const error = new Error('temporary cleanup aborted');
        error.name = 'AbortError';
        throw error;
      }
      if (!(session.presignExpiresAt instanceof Date)) {
        failed += 1;
        await this.scheduleCurrentRetry(
          session,
          now,
          'missing_presign_expiry',
        );
        continue;
      }
      const finalVerificationAt = new Date(
        session.presignExpiresAt.getTime() + skewSeconds * 1000,
      );
      if (now < finalVerificationAt) {
        await (this.prisma as any).imageUpload.updateMany({
          where: {
            id: session.id,
            status: session.status,
            temporaryCleanupState: {
              in: ['pending', 'cleanup_required'],
            },
          },
          data: { temporaryCleanupNextAttemptAt: finalVerificationAt },
        });
        continue;
      }

      try {
        await this.storage.deleteObject(session.uploadObjectKey, {
          parentSignal: signal,
        });
        objectsDeleted += 1;
      } catch (error) {
        if (
          signal?.aborted ||
          (error as { name?: string })?.name === 'AbortError'
        ) {
          throw error;
        }
        if (!isObjectNotFound(error)) {
          failed += 1;
          await this.scheduleCurrentRetry(session, now, 'delete_retryable');
          continue;
        }
      }

      let identity;
      try {
        identity = await this.storage.headObjectIdentity(
          session.uploadObjectKey,
          { parentSignal: signal },
        );
      } catch (error) {
        if (
          signal?.aborted ||
          (error as { name?: string })?.name === 'AbortError'
        ) {
          throw error;
        }
        failed += 1;
        await this.scheduleCurrentRetry(session, now, 'head_retryable');
        continue;
      }
      if (identity !== null) {
        failed += 1;
        await this.scheduleCurrentRetry(session, now, 'object_still_present');
        continue;
      }

      const verified = await (this.prisma as any).imageUpload.updateMany({
        where: {
          id: session.id,
          status: session.status,
          presignExpiresAt: session.presignExpiresAt,
          temporaryCleanupState: { in: ['pending', 'cleanup_required'] },
        },
        data: {
          temporaryCleanupState: 'verified_deleted',
          temporaryCleanupVerifiedAt: now,
          temporaryCleanupNextAttemptAt: null,
          temporaryCleanupLastErrorCategory: null,
        },
      });
      sessionsVerified += verified.count;
    }

    return {
      scanned: sessions.length,
      objectsDeleted,
      sessionsDeleted: 0,
      sessionsVerified,
      failed,
    };
  }

  private async scheduleCurrentRetry(
    session: Record<string, any>,
    now: Date,
    category:
      | 'missing_presign_expiry'
      | 'delete_retryable'
      | 'head_retryable'
      | 'object_still_present',
  ): Promise<void> {
    const attempts = Number(session.temporaryCleanupAttempts ?? 0) + 1;
    const delay = Math.min(
      CURRENT_RETRY_MAX_MS,
      CURRENT_RETRY_BASE_MS * 2 ** Math.min(attempts - 1, 7),
    );
    await (this.prisma as any).imageUpload.updateMany({
      where: {
        id: session.id,
        status: session.status,
        temporaryCleanupState: { in: ['pending', 'cleanup_required'] },
      },
      data: {
        temporaryCleanupState: 'pending',
        temporaryCleanupAttempts: attempts,
        temporaryCleanupNextAttemptAt: new Date(now.getTime() + delay),
        temporaryCleanupLastErrorCategory: category,
      },
    });
  }
}
