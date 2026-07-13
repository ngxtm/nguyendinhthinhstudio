import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';

const CLEANUP_GRACE_MS = 60 * 60 * 1000;
const CONSUMED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

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
  ) {}

  async cleanupExpired(albumId?: string) {
    const now = new Date();
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
    let failed = 0;
    for (const session of [...expired, ...staleFinalizing]) {
      try {
        if (await this.deleteObjectIfPresent(session.uploadObjectKey)) {
          objectsDeleted++;
        }
        if (
          (await (this.prisma as any).image.count({
            where: { r2ObjectKey: session.finalObjectKey },
          })) === 0
        ) {
          if (await this.deleteObjectIfPresent(session.finalObjectKey)) {
            objectsDeleted++;
          }
        }
        const eligibility =
          session.status === 'finalizing'
            ? { finalizationStartedAt: { lt: graceCutoff } }
            : { expiresAt: { lt: graceCutoff } };
        const result = await (this.prisma as any).imageUpload.deleteMany({
          where: { id: session.id, status: session.status, ...eligibility },
        });
        sessionsDeleted += result.count;
      } catch {
        failed++;
      }
    }
    for (const session of consumed) {
      try {
        if (await this.deleteObjectIfPresent(session.uploadObjectKey)) {
          objectsDeleted++;
        }
        const result = await (this.prisma as any).imageUpload.deleteMany({
          where: {
            id: session.id,
            status: 'consumed',
            consumedAt: { lt: consumedCutoff },
          },
        });
        sessionsDeleted += result.count;
      } catch {
        failed++;
      }
    }
    return {
      scanned: expired.length + staleFinalizing.length + consumed.length,
      objectsDeleted,
      sessionsDeleted,
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
}
