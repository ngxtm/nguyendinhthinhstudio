import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ImageUploadPromotionRepository } from './image-upload-promotion.repository';
import {
  type ImageUploadPromotionCopyFacts,
  StorageService,
  type R2ObjectIdentity,
} from './storage.service';

const RETRY_BACKOFF_MS = 30_000;
const RECONCILE_GRACE_MS = 30_000;
const RESULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const TEMPORARY_CLEANUP_SKEW_MS = 5 * 60 * 1000;

type PromotionRow = ImageUploadPromotionCopyFacts & {
  id: string;
  uploadId: string;
  albumId: string;
  finalizationLeaseToken: string;
  copyState: string;
  disposition: string;
  nextReconcileAt: Date;
  firstDestinationAbsentAt: Date | null;
  inspectedByteSize: number;
};

type RecoveryCounts = {
  scanned: number;
  redispatched: number;
  committed: number;
  conflicts: number;
  rejected: number;
  retried: number;
  casLost: number;
};

function metadataSha256(identity: R2ObjectIdentity): string {
  const metadata = identity.metadata;
  return createHash('sha256')
    .update(
      JSON.stringify({
        bytes: metadata.bytes ?? '',
        height: metadata.height ?? '',
        'promotion-id': metadata['promotion-id'] ?? '',
        sha256: metadata.sha256 ?? '',
        width: metadata.width ?? '',
      }),
    )
    .digest('hex');
}

function exactDestination(
  row: PromotionRow,
  identity: R2ObjectIdentity,
): boolean {
  return (
    identity.etag === row.sourceEtag &&
    identity.contentLength === row.inspectedByteSize &&
    identity.contentType === row.canonicalMime &&
    identity.metadata['promotion-id'] === row.promotionId &&
    identity.metadata.sha256 === row.inspectedSha256 &&
    identity.metadata.width === String(row.inspectedWidth) &&
    identity.metadata.height === String(row.inspectedHeight) &&
    metadataSha256(identity) ===
      createHash('sha256')
        .update(
          JSON.stringify({
            bytes: String(row.inspectedByteSize),
            height: String(row.inspectedHeight),
            'promotion-id': row.promotionId,
            sha256: row.inspectedSha256,
            width: String(row.inspectedWidth),
          }),
        )
        .digest('hex')
  );
}

function requirePromotionFacts(row: Record<string, unknown>): PromotionRow {
  for (const key of [
    'id',
    'uploadId',
    'albumId',
    'finalizationLeaseToken',
    'sourceObjectKey',
    'sourceEtag',
    'destinationObjectKey',
    'inspectedSha256',
    'canonicalMime',
  ]) {
    if (typeof row[key] !== 'string' || row[key] === '') {
      throw new Error(`promotion ${key} invariant is invalid`);
    }
  }
  for (const key of [
    'inspectedByteSize',
    'inspectedWidth',
    'inspectedHeight',
  ]) {
    if (!Number.isSafeInteger(row[key]) || Number(row[key]) <= 0) {
      throw new Error(`promotion ${key} invariant is invalid`);
    }
  }
  if (!(row.nextReconcileAt instanceof Date)) {
    throw new Error('promotion nextReconcileAt invariant is invalid');
  }
  return {
    ...(row as unknown as PromotionRow),
    promotionId: String(row.promotionId ?? row.id),
  };
}

function isPreconditionFailed(error: unknown): boolean {
  const providerError = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    providerError.$metadata?.httpStatusCode === 412 ||
    providerError.name === 'PreconditionFailed'
  );
}

@Injectable()
export class ImageUploadPromotionRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly promotions: ImageUploadPromotionRepository,
  ) {}

  async recoverDue(
    limit = 100,
    now = new Date(),
    signal?: AbortSignal,
  ): Promise<RecoveryCounts> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw new RangeError('promotion recovery limit must be 1..1000');
    }
    const invalid = await this.prisma.imageUploadPromotion.count({
      where: {
        origin: 'current',
        copyState: 'dispatched',
        OR: [
          { nextReconcileAt: null },
          { sourceEtag: null },
          { inspectedSha256: null },
          { inspectedByteSize: null },
          { canonicalMime: null },
          { inspectedWidth: null },
          { inspectedHeight: null },
        ],
      },
    });
    if (invalid !== 0) {
      throw new Error(
        `promotion scheduling invariant failed for ${invalid} current rows`,
      );
    }
    const openConflicts =
      await this.prisma.imageUploadPromotionConflict.findMany({
        where: { state: 'open' },
        select: { promotionId: true },
      });
    const blockedPromotionIds = openConflicts.map(
      ({ promotionId }) => promotionId,
    );
    const rows = await this.prisma.imageUploadPromotion.findMany({
      where: {
        origin: 'current',
        copyState: 'dispatched',
        nextReconcileAt: { lte: now },
        ...(blockedPromotionIds.length > 0
          ? { id: { notIn: blockedPromotionIds } }
          : {}),
      },
      orderBy: [{ nextReconcileAt: 'asc' }, { uploadId: 'asc' }],
      take: limit,
    });
    const counts: RecoveryCounts = {
      scanned: rows.length,
      redispatched: 0,
      committed: 0,
      conflicts: 0,
      rejected: 0,
      retried: 0,
      casLost: 0,
    };
    for (const raw of rows) {
      if (signal?.aborted) {
        const error = new Error('promotion recovery aborted');
        error.name = 'AbortError';
        throw error;
      }
      await this.recoverOne(
        requirePromotionFacts(raw as Record<string, unknown>),
        now,
        counts,
        signal,
      );
    }
    return counts;
  }

  private async recoverOne(
    row: PromotionRow,
    now: Date,
    counts: RecoveryCounts,
    signal?: AbortSignal,
  ): Promise<void> {
    const destination = await this.storage.headObjectIdentity(
      row.destinationObjectKey,
      {
        parentSignal: signal,
      },
    );
    if (destination !== null) {
      if (!exactDestination(row, destination)) {
        await this.promotions.openDestinationConflict({
          promotionId: row.promotionId,
          accountId: (row as any).accountId,
          bucket: (row as any).bucket,
          sourceObjectKeyHash: sha256(row.sourceObjectKey),
          destinationObjectKeyHash: sha256(row.destinationObjectKey),
          expectedDestinationEtag: row.sourceEtag,
          observedDestinationEtag: destination.etag,
          observedDestinationBytes: destination.contentLength ?? null,
          observedDestinationMime: destination.contentType ?? null,
          destinationMetadataSha256: metadataSha256(destination),
          mismatchReason:
            destination.etag !== row.sourceEtag
              ? 'destination_etag_mismatch'
              : 'destination_metadata_mismatch',
          observedAt: now,
        });
        counts.conflicts += 1;
        await this.scheduleNext(row, now, 60 * 60 * 1000);
        return;
      }
      const upload = await this.prisma.imageUpload.findUnique({
        where: { id: row.uploadId },
      });
      if (!upload?.createdByAdminId)
        throw new Error('promotion recovery upload authority is invalid');
      await this.promotions.settleDestinationHeadAndCommit({
        uploadId: row.uploadId,
        createdByAdminId: upload.createdByAdminId,
        finalizationLeaseToken: row.finalizationLeaseToken,
        destinationHeadEtag: destination.etag,
        destinationHeadBytes:
          destination.contentLength ?? row.inspectedByteSize,
        destinationHeadMime: (destination.contentType ??
          row.canonicalMime) as any,
        destinationHeadMetadataSha256: metadataSha256(destination),
        observedAt: now,
        image: {
          id: randomUUID(),
          albumId: row.albumId,
          filename: upload.filename,
          r2ObjectKey: row.destinationObjectKey,
          width: row.inspectedWidth,
          height: row.inspectedHeight,
          fileSizeBytes: row.inspectedByteSize,
          thumbnailUrl: '',
          smallUrl: '',
          mediumUrl: '',
          largeUrl: '',
          xlargeUrl: '',
        },
        resultRetentionExpiresAt: new Date(now.getTime() + RESULT_RETENTION_MS),
        temporaryCleanupNextAttemptAt: new Date(
          Math.max(
            now.getTime(),
            (upload.presignExpiresAt ?? upload.expiresAt).getTime() +
              TEMPORARY_CLEANUP_SKEW_MS,
          ),
        ),
      });
      counts.committed += 1;
      return;
    }

    const source = await this.storage.headObjectIdentity(row.sourceObjectKey, {
      parentSignal: signal,
    });
    if (source === null || source.etag !== row.sourceEtag) {
      await this.handleMissingOrChangedSource(
        row,
        source?.etag ?? null,
        now,
        counts,
      );
      return;
    }
    const claimed = await this.prisma.imageUploadPromotion.updateMany({
      where: {
        uploadId: row.uploadId,
        finalizationLeaseToken: row.finalizationLeaseToken,
        copyState: 'dispatched',
        nextReconcileAt: { lte: now },
        providerSettlementObservedAt: null,
      },
      data: {
        dispatchAttempts: { increment: 1 },
        reconcileAttempts: { increment: 1 },
        lastDispatchAttemptAt: now,
        lastReconciledAt: now,
        nextReconcileAt: new Date(now.getTime() + RETRY_BACKOFF_MS),
      },
    });
    if (claimed.count !== 1) {
      counts.casLost += 1;
      return;
    }
    try {
      const copyResponseEtag = await this.storage.promoteObject(row, {
        deadlines: [new Date(now.getTime() + RETRY_BACKOFF_MS)],
        now,
        parentSignal: signal,
      });
      counts.redispatched += 1;
      const upload = await this.prisma.imageUpload.findUnique({
        where: { id: row.uploadId },
      });
      if (!upload?.createdByAdminId)
        throw new Error('promotion recovery upload authority is invalid');
      await this.promotions.settleCopyResponseAndCommit({
        uploadId: row.uploadId,
        createdByAdminId: upload.createdByAdminId,
        finalizationLeaseToken: row.finalizationLeaseToken,
        copyResponseEtag,
        observedAt: now,
        image: {
          id: randomUUID(),
          albumId: row.albumId,
          filename: upload.filename,
          r2ObjectKey: row.destinationObjectKey,
          width: row.inspectedWidth,
          height: row.inspectedHeight,
          fileSizeBytes: row.inspectedByteSize,
          thumbnailUrl: '',
          smallUrl: '',
          mediumUrl: '',
          largeUrl: '',
          xlargeUrl: '',
        },
        resultRetentionExpiresAt: new Date(now.getTime() + RESULT_RETENTION_MS),
        temporaryCleanupNextAttemptAt: new Date(
          Math.max(
            now.getTime(),
            (upload.presignExpiresAt ?? upload.expiresAt).getTime() +
              TEMPORARY_CLEANUP_SKEW_MS,
          ),
        ),
      });
      counts.committed += 1;
    } catch (error) {
      if (
        signal?.aborted ||
        (error as { name?: string })?.name === 'AbortError'
      )
        throw error;
      if (isPreconditionFailed(error)) {
        counts.retried += 1;
        return;
      }
      counts.retried += 1;
    }
  }

  private async handleMissingOrChangedSource(
    row: PromotionRow,
    observedSourceEtag: string | null,
    now: Date,
    counts: RecoveryCounts,
  ): Promise<void> {
    if (
      row.firstDestinationAbsentAt &&
      now.getTime() - row.firstDestinationAbsentAt.getTime() >=
        RECONCILE_GRACE_MS
    ) {
      const upload = await this.prisma.imageUpload.findUnique({
        where: { id: row.uploadId },
      });
      if (!upload?.createdByAdminId)
        throw new Error('dispatch rejection upload authority is missing');
      const changed = await this.promotions.markDispatchRejectedNotCreated({
        uploadId: row.uploadId,
        createdByAdminId: upload.createdByAdminId,
        finalizationLeaseToken: row.finalizationLeaseToken,
        sourceEtag: row.sourceEtag,
        observedSourceEtag,
        reason:
          observedSourceEtag === null
            ? 'source_missing'
            : 'source_etag_mismatch',
        firstDestinationAbsentAt: row.firstDestinationAbsentAt,
        destinationAbsentVerifiedAt: now,
        reconcileBarrierMs: RECONCILE_GRACE_MS,
        now,
      });
      if (changed) counts.rejected += 1;
      else counts.casLost += 1;
      return;
    }
    await this.prisma.imageUploadPromotion.updateMany({
      where: {
        uploadId: row.uploadId,
        finalizationLeaseToken: row.finalizationLeaseToken,
        copyState: 'dispatched',
        providerSettlementObservedAt: null,
      },
      data: {
        firstDestinationAbsentAt: row.firstDestinationAbsentAt ?? now,
        lastReconciledAt: now,
        reconcileAttempts: { increment: 1 },
        nextReconcileAt: new Date(now.getTime() + RECONCILE_GRACE_MS),
      },
    });
    counts.retried += 1;
  }

  private async scheduleNext(
    row: PromotionRow,
    now: Date,
    delayMs = RETRY_BACKOFF_MS,
  ): Promise<void> {
    await this.prisma.imageUploadPromotion.updateMany({
      where: {
        uploadId: row.uploadId,
        finalizationLeaseToken: row.finalizationLeaseToken,
        copyState: 'dispatched',
      },
      data: {
        reconcileAttempts: { increment: 1 },
        lastReconciledAt: now,
        nextReconcileAt: new Date(now.getTime() + delayMs),
      },
    });
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
