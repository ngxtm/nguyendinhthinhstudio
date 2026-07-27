import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type PromotionRecord = Record<string, unknown>;
export type PromotionConflictRecord = Record<string, unknown>;

type CanonicalMime = 'image/webp';
type TransactionClient = Prisma.TransactionClient & Record<string, any>;

const SERIALIZABLE = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
} as const;
const RESULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type CreateDispatchedPromotionInput = {
  uploadId: string;
  albumId: string;
  finalizationLeaseToken: string;
  accountId: string;
  bucket: string;
  sourceObjectKey: string;
  sourceEtag: string;
  destinationObjectKey: string;
  inspectedSha256: string;
  inspectedByteSize: number;
  canonicalMime: CanonicalMime;
  inspectedWidth: number;
  inspectedHeight: number;
  now: Date;
  reconcileGraceMs: number;
};

type ImageCommitInput = {
  uploadId: string;
  createdByAdminId: string;
  finalizationLeaseToken: string;
  observedAt: Date;
  image: {
    id: string;
    albumId: string;
    filename: string;
    r2ObjectKey: string;
    width: number;
    height: number;
    fileSizeBytes: number;
    thumbnailUrl: string;
    smallUrl: string;
    mediumUrl: string;
    largeUrl: string;
    xlargeUrl: string;
    orderIndex: number;
  };
  resultRetentionExpiresAt: Date;
  temporaryCleanupNextAttemptAt: Date;
};

export type CopyResponseCommitInput = ImageCommitInput & {
  copyResponseEtag: string;
};

export type DestinationHeadCommitInput = ImageCommitInput & {
  destinationHeadEtag: string;
  destinationHeadBytes: number;
  destinationHeadMime: CanonicalMime;
  destinationHeadMetadataSha256: string;
};

export type OpenDestinationConflictInput = {
  promotionId: string;
  accountId: string;
  bucket: string;
  sourceObjectKeyHash: string;
  destinationObjectKeyHash: string;
  expectedDestinationEtag: string;
  observedDestinationEtag: string | null;
  observedDestinationBytes: number | null;
  observedDestinationMime: string | null;
  destinationMetadataSha256: string;
  mismatchReason:
    | 'destination_etag_mismatch'
    | 'destination_metadata_mismatch';
  observedAt: Date;
};

export type ResolveDestinationConflictInput = {
  id: string;
  expectedState: 'open';
  resolution:
    | 'confirmed_absent'
    | 'cleanup_authorized'
    | 'committed_authorized';
  operatorIdentityFingerprint: string;
  approvalDigest: string;
  finalAbsentVerifiedAt?: Date;
  resolvedAt: Date;
};

export type CommitPromotionInput = {
  uploadId: string;
  finalizationLeaseToken: string;
  imageId: string;
  destinationObjectKey: string;
};

export type CleanupAuthorityInput = {
  uploadId: string;
  finalizationLeaseToken: string;
};

export type DispatchRejectedNotCreatedInput = {
  uploadId: string;
  createdByAdminId: string;
  finalizationLeaseToken: string;
  sourceEtag: string;
  observedSourceEtag: string | null;
  reason: 'source_missing' | 'source_etag_mismatch';
  firstDestinationAbsentAt: Date;
  destinationAbsentVerifiedAt: Date;
  reconcileBarrierMs: number;
  now: Date;
};

function requireNonEmpty(value: string | null | undefined, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function requirePositive(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return value;
}

function requireCanonicalEtag(value: string, name: string): string {
  requireNonEmpty(value, name);
  if (
    value.startsWith('W/') ||
    value.startsWith('"') ||
    value.endsWith('"') ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`${name} must be canonical, unquoted, and non-weak`);
  }
  return value;
}

function requireSha256(value: string, name: string): string {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${name} must be lowercase SHA-256`);
  }
  return value;
}

function canonicalConflict(input: OpenDestinationConflictInput): string {
  return JSON.stringify({
    accountId: input.accountId,
    bucket: input.bucket,
    destinationMetadataSha256: input.destinationMetadataSha256,
    destinationObjectKeyHash: input.destinationObjectKeyHash,
    expectedDestinationEtag: input.expectedDestinationEtag,
    mismatchReason: input.mismatchReason,
    observedDestinationBytes: input.observedDestinationBytes,
    observedDestinationEtag: input.observedDestinationEtag,
    observedDestinationMime: input.observedDestinationMime,
    promotionId: input.promotionId,
    sourceObjectKeyHash: input.sourceObjectKeyHash,
  });
}

function conflictEvidenceSha256(input: OpenDestinationConflictInput): string {
  return createHash('sha256').update(canonicalConflict(input)).digest('hex');
}

function assertCurrentDispatch(input: CreateDispatchedPromotionInput): void {
  requireNonEmpty(input.uploadId, 'uploadId');
  requireNonEmpty(input.albumId, 'albumId');
  requireNonEmpty(input.finalizationLeaseToken, 'finalizationLeaseToken');
  requireNonEmpty(input.accountId, 'accountId');
  requireNonEmpty(input.bucket, 'bucket');
  requireNonEmpty(input.sourceObjectKey, 'sourceObjectKey');
  requireCanonicalEtag(input.sourceEtag, 'sourceEtag');
  requireNonEmpty(input.destinationObjectKey, 'destinationObjectKey');
  requireSha256(input.inspectedSha256, 'inspectedSha256');
  requirePositive(input.inspectedByteSize, 'inspectedByteSize');
  if (input.canonicalMime !== 'image/webp') {
    throw new Error('canonicalMime is invalid');
  }
  requirePositive(input.inspectedWidth, 'inspectedWidth');
  requirePositive(input.inspectedHeight, 'inspectedHeight');
  requirePositive(input.reconcileGraceMs, 'reconcileGraceMs');
  if (!Number.isFinite(input.now.getTime())) throw new Error('now is invalid');
}

async function rereadPromotion(
  transaction: TransactionClient,
  uploadId: string,
): Promise<PromotionRecord> {
  const winner = await transaction.imageUploadPromotion.findUnique({
    where: { uploadId },
  });
  if (!winner) throw new Error('promotion CAS lost without a winner');
  return winner;
}

async function settleAndCommit(
  prisma: PrismaService,
  input: ImageCommitInput,
  evidence: {
    etag: string;
    data: Record<string, unknown>;
  },
): Promise<PromotionRecord> {
  return prisma.$transaction(async (rawTransaction) => {
    const transaction = rawTransaction as TransactionClient;
    const promotion = await transaction.imageUploadPromotion.findUnique({
      where: { uploadId: input.uploadId },
    });
    if (
      !promotion ||
      promotion.finalizationLeaseToken !== input.finalizationLeaseToken ||
      !['dispatched', 'provider_settled'].includes(promotion.copyState) ||
      (promotion.copyResponseEtag && promotion.copyResponseEtag !== evidence.etag) ||
      (promotion.destinationHeadEtag &&
        promotion.destinationHeadEtag !== evidence.etag)
    ) {
      throw new Error('settlement evidence does not match promotion authority');
    }
    if (
      promotion.disposition === 'committed' &&
      promotion.committedResultImageId
    ) {
      return promotion;
    }

    // Promotion-committed images are fully materialized in R2 with variants,
    // so they must be visible to public reads (which filter uploadStatus =
    // 'completed'). The legacy default 'pending' would hide them, so force it.
    const image = await transaction.image.create({
      data: { ...input.image, uploadStatus: 'completed' },
    });
    await transaction.album.updateMany({
      where: { id: input.image.albumId },
      data: { imageCount: { increment: 1 } },
    });
    const upload = await transaction.imageUpload.updateMany({
      where: {
        id: input.uploadId,
        createdByAdminId: input.createdByAdminId,
        status: 'finalizing',
        finalizationLeaseToken: input.finalizationLeaseToken,
      },
      data: {
        status: 'consumed',
        consumedAt: input.observedAt,
        terminalAt: input.observedAt,
        resultImageId: image.id,
        resultRetentionExpiresAt: input.resultRetentionExpiresAt,
        temporaryCleanupState: 'pending',
        temporaryCleanupNextAttemptAt: input.temporaryCleanupNextAttemptAt,
      },
    });
    if (upload.count !== 1) throw new Error('upload terminal CAS lost');
    const idempotency = await transaction.imageUploadIdempotency.updateMany({
      where: { uploadId: input.uploadId },
      data: {
        terminalOutcome: 'consumed',
        resultImageId: image.id,
        terminalAt: input.observedAt,
        resultRetentionExpiresAt: input.resultRetentionExpiresAt,
      },
    });
    if (idempotency.count !== 1) {
      throw new Error('idempotency terminal CAS lost');
    }
    const settled = await transaction.imageUploadPromotion.updateMany({
      where: {
        uploadId: input.uploadId,
        finalizationLeaseToken: input.finalizationLeaseToken,
        copyState: { in: ['dispatched', 'provider_settled'] },
      },
      data: {
        copyState: 'provider_settled',
        disposition: 'committed',
        committedResultImageId: image.id,
        providerSettlementObservedAt: input.observedAt,
        ...evidence.data,
      },
    });
    if (settled.count !== 1) throw new Error('promotion settlement CAS lost');
    return rereadPromotion(transaction, input.uploadId);
  }, SERIALIZABLE) as Promise<PromotionRecord>;
}

@Injectable()
export class ImageUploadPromotionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createDispatchedPromotion(
    input: CreateDispatchedPromotionInput,
  ): Promise<PromotionRecord> {
    assertCurrentDispatch(input);
    const nextReconcileAt = new Date(
      input.now.getTime() + input.reconcileGraceMs,
    );
    return this.prisma.$transaction(
      (transaction) =>
        (transaction as TransactionClient).imageUploadPromotion.create({
          data: {
            id: randomUUID(),
            uploadId: input.uploadId,
            origin: 'current',
            albumId: input.albumId,
            finalizationLeaseToken: input.finalizationLeaseToken,
            accountId: input.accountId,
            bucket: input.bucket,
            sourceObjectKey: input.sourceObjectKey,
            sourceEtag: input.sourceEtag,
            destinationObjectKey: input.destinationObjectKey,
            inspectedSha256: input.inspectedSha256,
            inspectedByteSize: input.inspectedByteSize,
            canonicalMime: input.canonicalMime,
            inspectedWidth: input.inspectedWidth,
            inspectedHeight: input.inspectedHeight,
            copyState: 'dispatched',
            disposition: 'pending',
            copyDispatchedAt: input.now,
            dispatchAttempts: 1,
            lastDispatchAttemptAt: input.now,
            nextReconcileAt,
            reconcileAttempts: 0,
            updatedAt: input.now,
          },
        }),
      SERIALIZABLE,
    ) as Promise<PromotionRecord>;
  }

  async settleCopyResponseAndCommit(
    input: CopyResponseCommitInput,
  ): Promise<PromotionRecord> {
    requireCanonicalEtag(input.copyResponseEtag, 'copyResponseEtag');
    return settleAndCommit(this.prisma, input, {
      etag: input.copyResponseEtag,
      data: {
        copyResponseObservedAt: input.observedAt,
        copyResponseEtag: input.copyResponseEtag,
      },
    });
  }

  async settleDestinationHeadAndCommit(
    input: DestinationHeadCommitInput,
  ): Promise<PromotionRecord> {
    requireCanonicalEtag(input.destinationHeadEtag, 'destinationHeadEtag');
    requirePositive(input.destinationHeadBytes, 'destinationHeadBytes');
    requireSha256(
      input.destinationHeadMetadataSha256,
      'destinationHeadMetadataSha256',
    );
    if (input.destinationHeadMime !== 'image/webp') {
      throw new Error('destinationHeadMime is invalid');
    }
    return settleAndCommit(this.prisma, input, {
      etag: input.destinationHeadEtag,
      data: {
        destinationHeadObservedAt: input.observedAt,
        destinationHeadEtag: input.destinationHeadEtag,
        destinationHeadBytes: input.destinationHeadBytes,
        destinationHeadMime: input.destinationHeadMime,
        destinationHeadMetadataSha256:
          input.destinationHeadMetadataSha256,
      },
    });
  }

  async openDestinationConflict(
    input: OpenDestinationConflictInput,
  ): Promise<PromotionConflictRecord> {
    requireCanonicalEtag(input.expectedDestinationEtag, 'expectedDestinationEtag');
    if (input.observedDestinationEtag) {
      requireCanonicalEtag(input.observedDestinationEtag, 'observedDestinationEtag');
    }
    requireSha256(input.sourceObjectKeyHash, 'sourceObjectKeyHash');
    requireSha256(input.destinationObjectKeyHash, 'destinationObjectKeyHash');
    requireSha256(input.destinationMetadataSha256, 'destinationMetadataSha256');
    const evidenceHash = conflictEvidenceSha256(input);
    return this.prisma.$transaction(
      (rawTransaction) =>
        (rawTransaction as TransactionClient).imageUploadPromotionConflict.upsert({
          where: { promotionId: input.promotionId },
          create: {
            id: randomUUID(),
            promotionId: input.promotionId,
            accountId: input.accountId,
            bucket: input.bucket,
            sourceObjectKeyHash: input.sourceObjectKeyHash,
            destinationObjectKeyHash: input.destinationObjectKeyHash,
            expectedDestinationEtag: input.expectedDestinationEtag,
            observedDestinationEtag: input.observedDestinationEtag,
            observedDestinationBytes: input.observedDestinationBytes,
            observedDestinationMime: input.observedDestinationMime,
            destinationMetadataSha256: input.destinationMetadataSha256,
            mismatchReason: input.mismatchReason,
            conflictEvidenceSha256: evidenceHash,
            state: 'open',
            updatedAt: input.observedAt,
          },
          update: {},
        }),
      SERIALIZABLE,
    ) as Promise<PromotionConflictRecord>;
  }

  async resolveDestinationConflict(
    input: ResolveDestinationConflictInput,
  ): Promise<PromotionConflictRecord> {
    return this.prisma.$transaction(async (rawTransaction) => {
      const transaction = rawTransaction as TransactionClient;
      const conflict = await transaction.imageUploadPromotionConflict.findUnique({
        where: { id: input.id },
      });
      if (!conflict || conflict.state !== input.expectedState) {
        throw new Error('promotion conflict is not open');
      }
      const snapshot: OpenDestinationConflictInput = {
        promotionId: conflict.promotionId,
        accountId: conflict.accountId,
        bucket: conflict.bucket,
        sourceObjectKeyHash: conflict.sourceObjectKeyHash,
        destinationObjectKeyHash: conflict.destinationObjectKeyHash,
        expectedDestinationEtag: conflict.expectedDestinationEtag,
        observedDestinationEtag: conflict.observedDestinationEtag,
        observedDestinationBytes: conflict.observedDestinationBytes,
        observedDestinationMime: conflict.observedDestinationMime,
        destinationMetadataSha256: conflict.destinationMetadataSha256,
        mismatchReason: conflict.mismatchReason as
          | 'destination_etag_mismatch'
          | 'destination_metadata_mismatch',
        observedAt: conflict.openedAt,
      };
      if (conflictEvidenceSha256(snapshot) !== conflict.conflictEvidenceSha256) {
        throw new Error('promotion conflict snapshot hash mismatch');
      }
      const updated = await transaction.imageUploadPromotionConflict.updateMany({
        where: {
          id: input.id,
          state: input.expectedState,
          conflictEvidenceSha256: conflict.conflictEvidenceSha256,
        },
        data: {
          state: 'resolved',
          resolution: input.resolution,
          operatorIdentityFingerprint: input.operatorIdentityFingerprint,
          approvalDigest: input.approvalDigest,
          finalAbsentVerifiedAt: input.finalAbsentVerifiedAt,
          resolvedAt: input.resolvedAt,
        },
      });
      if (updated.count !== 1) throw new Error('conflict resolution CAS lost');
      return transaction.imageUploadPromotionConflict.findUnique({
        where: { id: input.id },
      });
    }, SERIALIZABLE) as Promise<PromotionConflictRecord>;
  }

  async markCommitted(input: CommitPromotionInput): Promise<boolean> {
    return this.prisma.$transaction(async (rawTransaction) => {
      const transaction = rawTransaction as TransactionClient;
      const image = await transaction.image.findFirst({
        where: { id: input.imageId, r2ObjectKey: input.destinationObjectKey },
      });
      if (!image) throw new Error('committed image authority is missing');
      const result = await transaction.imageUploadPromotion.updateMany({
        where: {
          uploadId: input.uploadId,
          finalizationLeaseToken: input.finalizationLeaseToken,
          copyState: 'provider_settled',
          disposition: 'pending',
        },
        data: {
          disposition: 'committed',
          committedResultImageId: input.imageId,
        },
      });
      return result.count === 1;
    }, SERIALIZABLE);
  }

  async requireCleanup(input: CleanupAuthorityInput): Promise<boolean> {
    return this.prisma.$transaction(async (rawTransaction) => {
      const transaction = rawTransaction as TransactionClient;
      const promotion = await transaction.imageUploadPromotion.findUnique({
        where: { uploadId: input.uploadId },
      });
      if (
        !promotion ||
        promotion.finalizationLeaseToken !== input.finalizationLeaseToken ||
        promotion.disposition === 'committed' ||
        promotion.committedResultImageId !== null
      ) {
        throw new Error('cleanup authority is invalid');
      }
      const image = await transaction.image.findFirst({
        where: { r2ObjectKey: promotion.destinationObjectKey },
      });
      if (image) throw new Error('cleanup cannot delete a referenced image');
      const result = await transaction.imageUploadPromotion.updateMany({
        where: {
          uploadId: input.uploadId,
          finalizationLeaseToken: input.finalizationLeaseToken,
          copyState: 'provider_settled',
          disposition: 'pending',
          committedResultImageId: null,
        },
        data: { disposition: 'cleanup_required' },
      });
      return result.count === 1;
    }, SERIALIZABLE);
  }

  async markVerifiedDeleted(input: CleanupAuthorityInput): Promise<boolean> {
    return this.prisma.$transaction(async (rawTransaction) => {
      const transaction = rawTransaction as TransactionClient;
      const promotion = await transaction.imageUploadPromotion.findUnique({
        where: { uploadId: input.uploadId },
      });
      if (!promotion) throw new Error('promotion not found');
      const image = await transaction.image.findFirst({
        where: { r2ObjectKey: promotion.destinationObjectKey },
      });
      if (image) throw new Error('verified deletion still has an image');
      const result = await transaction.imageUploadPromotion.updateMany({
        where: {
          uploadId: input.uploadId,
          finalizationLeaseToken: input.finalizationLeaseToken,
          copyState: 'provider_settled',
          disposition: 'cleanup_required',
        },
        data: { disposition: 'verified_deleted' },
      });
      return result.count === 1;
    }, SERIALIZABLE);
  }

  async markDispatchRejectedNotCreated(
    input: DispatchRejectedNotCreatedInput,
  ): Promise<boolean> {
    if (
      input.reconcileBarrierMs <= 0 ||
      input.destinationAbsentVerifiedAt.getTime() -
        input.firstDestinationAbsentAt.getTime() <
        input.reconcileBarrierMs ||
      input.now.getTime() < input.destinationAbsentVerifiedAt.getTime()
    ) {
      throw new Error('destination absence evidence is incomplete');
    }
    if (
      (input.reason === 'source_missing' && input.observedSourceEtag !== null) ||
      (input.reason === 'source_etag_mismatch' &&
        (input.observedSourceEtag === null ||
          input.observedSourceEtag === input.sourceEtag))
    ) {
      throw new Error('source rejection evidence is invalid');
    }
    if (input.observedSourceEtag !== null) {
      requireCanonicalEtag(input.observedSourceEtag, 'observedSourceEtag');
    }

    return this.prisma.$transaction(async (rawTransaction) => {
      const transaction = rawTransaction as TransactionClient;
      const promotion = await transaction.imageUploadPromotion.findUnique({
        where: { uploadId: input.uploadId },
      });
      if (
        !promotion ||
        promotion.finalizationLeaseToken !== input.finalizationLeaseToken ||
        promotion.sourceEtag !== input.sourceEtag ||
        promotion.copyState !== 'dispatched' ||
        promotion.providerSettlementObservedAt ||
        promotion.copyResponseObservedAt ||
        promotion.destinationHeadObservedAt
      ) {
        throw new Error('dispatch rejection authority is invalid');
      }
      const image = await transaction.image.findFirst({
        where: { r2ObjectKey: promotion.destinationObjectKey },
      });
      if (image) throw new Error('dispatch rejection has an Image reference');
      const result = await transaction.imageUploadPromotion.updateMany({
        where: {
          uploadId: input.uploadId,
          finalizationLeaseToken: input.finalizationLeaseToken,
          copyState: 'dispatched',
          providerSettlementObservedAt: null,
          copyResponseObservedAt: null,
          destinationHeadObservedAt: null,
        },
        data: {
          copyState: 'dispatch_rejected',
          disposition: 'not_created',
          firstDestinationAbsentAt: input.firstDestinationAbsentAt,
          destinationAbsentVerifiedAt: input.destinationAbsentVerifiedAt,
          dispatchRejectedAt: input.now,
          dispatchRejectionReason: input.reason,
          dispatchRejectionObservedSourceEtag: input.observedSourceEtag,
        },
      });
      if (result.count !== 1) return false;
      const resultRetentionExpiresAt = new Date(
        input.now.getTime() + RESULT_RETENTION_MS,
      );
      const terminalized = await transaction.imageUpload.updateMany({
        where: {
          id: input.uploadId,
          createdByAdminId: input.createdByAdminId,
          status: 'finalizing',
          finalizationLeaseToken: input.finalizationLeaseToken,
        },
        data: {
          status: 'failed',
          failureCode: 'upload_dispatch_rejected',
          terminalAt: input.now,
          resultRetentionExpiresAt,
          temporaryCleanupState: 'pending',
          temporaryCleanupNextAttemptAt: input.now,
        },
      });
      if (terminalized.count !== 1) {
        throw new Error('upload rejection terminal CAS lost');
      }
      const idempotency = await transaction.imageUploadIdempotency.updateMany({
        where: { uploadId: input.uploadId },
        data: {
          terminalOutcome: 'failed',
          failureCode: 'upload_dispatch_rejected',
          terminalAt: input.now,
          resultRetentionExpiresAt,
        },
      });
      if (idempotency.count !== 1) {
        throw new Error('idempotency rejection terminal CAS lost');
      }
      return true;
    }, SERIALIZABLE);
  }
}
