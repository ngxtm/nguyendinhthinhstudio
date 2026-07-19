import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type PromotionRecord = Record<string, unknown>;
export type PromotionConflictRecord = Record<string, unknown>;
export type ProviderEventQuarantineRecord = Record<string, unknown>;

type CanonicalMime = 'image/jpeg' | 'image/png' | 'image/webp';

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
  policyVersion: string;
  now: Date;
  eventGraceMs: number;
};

export type CopyResponseCommitInput = {
  uploadId: string;
  createdByAdminId: string;
  finalizationLeaseToken: string;
  copyResponseEtag: string;
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

export type ProviderSettlementInput = {
  uploadId: string;
  finalizationLeaseToken: string;
  providerEventId: string;
  providerEventObservedAt: Date;
  providerSettlementObservedAt: Date;
  settlementSource: string;
  providerObjectEtag: string;
  eventEnvelopeSha256?: string;
  eventTime?: Date;
  sourceObjectKeyHash?: string;
  destinationObjectKeyHash?: string;
};

export type LateEventConflictInput = ProviderSettlementInput & {
  accountId: string;
  bucket: string;
  eventTime: Date;
  eventEnvelopeSha256: string;
  sourceObjectKeyHash: string;
  destinationObjectKeyHash: string;
};

export type ResolveLateEventConflictInput = {
  id: string;
  expectedState: 'open';
  resolution:
    | 'confirmed_absent_ack'
    | 'cleanup_authorized'
    | 'committed_authorized';
  operatorIdentityFingerprint: string;
  approvalDigest: string;
  observedDestinationEtag?: string;
  finalAbsentVerifiedAt?: Date;
  resolvedAt: Date;
};

export type OpenProviderEventQuarantineInput = {
  providerEventId: string | null;
  messageId: string;
  sourceQueueId: string;
  currentQueueId: string;
  leaseId: string;
  leaseDeadline: Date;
  attempts: number;
  rawBody: string;
  eventEnvelope: unknown | null;
  reason: 'malformed_event' | 'unmatched_event';
  observedAt: Date;
  replayRequestId?: string | null;
};

export type BeginProviderEventQuarantineResolutionInput = {
  id: string;
  resolutionAttemptId: string;
  resolution: 'quarantined_ack' | 'replay_requested';
  operatorIdentityFingerprint: string;
  approvalDigest: string;
  resolutionStartedAt: Date;
};

export type FinalizeProviderEventQuarantineResolutionInput = {
  id: string;
  resolutionAttemptId: string;
  resolution: 'quarantined_ack' | 'replay_requested';
  acknowledgedLocationCount: number;
  resolutionScanCompletedAt: Date;
  acknowledgedAt: Date;
  resolvedAt: Date;
  resolutionEvidenceSha256: string;
  replayQueueId?: string;
  replayRequestId?: string;
  replayMessageId?: string;
  replayRequestedAt?: Date;
};

export type ReopenProviderEventQuarantineAfterReplayInput = {
  id: string;
  resolutionAttemptId: string;
  resolutionEvidenceSha256: string;
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

export type VerifiedDeletionInput = CleanupAuthorityInput;

export type DispatchRejectedNotCreatedInput = {
  uploadId: string;
  createdByAdminId: string;
  finalizationLeaseToken: string;
  sourceEtag: string;
  observedSourceEtag: string | null;
  reason: 'source_missing' | 'source_etag_mismatch';
  firstDestinationAbsentAt: Date;
  destinationAbsentVerifiedAt: Date;
  visibilityTimeoutMs: number;
  now: Date;
};

type TransactionClient = Prisma.TransactionClient & Record<string, any>;

const SERIALIZABLE = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
} as const;

function requireNonEmpty(
  value: string | null | undefined,
  name: string,
): string {
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

function canonicalize(value: unknown): string {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('canonical JSON rejects non-finite numbers');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(',')}}`;
  }
  throw new Error(`canonical JSON rejects ${typeof value}`);
}

function canonicalJson(value: Record<string, string>): string {
  return canonicalize(value);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function conflictEvidenceHash(data: {
  accountId: string;
  bucket: string;
  sourceObjectKeyHash: string;
  destinationObjectKeyHash: string;
  eventTime: Date;
  eventEnvelopeSha256: string;
  providerObjectEtag: string;
  rejectionDispatchRejectedAt: Date;
  rejectionReason: string;
  rejectionObservedSourceEtag: string | null;
  rejectionFirstDestinationAbsentAt: Date;
  rejectionDestinationAbsentVerifiedAt: Date;
}): string {
  return sha256(
    canonicalJson({
      accountId: data.accountId,
      bucket: data.bucket,
      destinationObjectKeyHash: data.destinationObjectKeyHash,
      eventEnvelopeSha256: data.eventEnvelopeSha256,
      eventTime: data.eventTime.toISOString(),
      providerObjectEtag: data.providerObjectEtag,
      rejectionDestinationAbsentVerifiedAt:
        data.rejectionDestinationAbsentVerifiedAt.toISOString(),
      rejectionDispatchRejectedAt:
        data.rejectionDispatchRejectedAt.toISOString(),
      rejectionFirstDestinationAbsentAt:
        data.rejectionFirstDestinationAbsentAt.toISOString(),
      rejectionObservedSourceEtag: data.rejectionObservedSourceEtag ?? '',
      rejectionReason: data.rejectionReason,
      sourceObjectKeyHash: data.sourceObjectKeyHash,
    }),
  );
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
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(input.canonicalMime)
  ) {
    throw new Error('canonicalMime is invalid');
  }
  requirePositive(input.inspectedWidth, 'inspectedWidth');
  requirePositive(input.inspectedHeight, 'inspectedHeight');
  requireNonEmpty(input.policyVersion, 'policyVersion');
  requirePositive(input.eventGraceMs, 'eventGraceMs');
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

@Injectable()
export class ImageUploadPromotionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createDispatchedPromotion(
    input: CreateDispatchedPromotionInput,
  ): Promise<PromotionRecord> {
    assertCurrentDispatch(input);
    const nextReconcileAt = new Date(input.now.getTime() + input.eventGraceMs);
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
            policyVersion: input.policyVersion,
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
    return this.prisma.$transaction(async (rawTransaction) => {
      const transaction = rawTransaction as TransactionClient;
      const promotion = await transaction.imageUploadPromotion.findUnique({
        where: { uploadId: input.uploadId },
      });
      if (
        !promotion ||
        promotion.finalizationLeaseToken !== input.finalizationLeaseToken ||
        !['dispatched', 'provider_settled'].includes(promotion.copyState) ||
        (promotion.providerObjectEtag &&
          promotion.providerObjectEtag !== input.copyResponseEtag)
      ) {
        throw new Error('copy response does not match promotion authority');
      }

      const image = await transaction.image.create({ data: input.image });
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
      await transaction.imageUploadIdempotency.updateMany({
        where: { uploadId: input.uploadId },
        data: {
          terminalOutcome: 'consumed',
          resultImageId: image.id,
          terminalAt: input.observedAt,
          resultRetentionExpiresAt: input.resultRetentionExpiresAt,
        },
      });
      await transaction.imageUploadPromotion.updateMany({
        where: {
          uploadId: input.uploadId,
          finalizationLeaseToken: input.finalizationLeaseToken,
          copyState: { in: ['dispatched', 'provider_settled'] },
        },
        data: {
          copyState: 'provider_settled',
          disposition: 'committed',
          committedResultImageId: image.id,
          copyResponseObservedAt: input.observedAt,
          copyResponseEtag: input.copyResponseEtag,
          providerSettlementObservedAt: input.observedAt,
        },
      });
      return rereadPromotion(transaction, input.uploadId);
    }, SERIALIZABLE) as Promise<PromotionRecord>;
  }

  async recordProviderSettlement(
    input: ProviderSettlementInput,
  ): Promise<PromotionRecord> {
    requireCanonicalEtag(input.providerObjectEtag, 'providerObjectEtag');
    return this.prisma.$transaction(async (rawTransaction) => {
      const transaction = rawTransaction as TransactionClient;
      const current = await transaction.imageUploadPromotion.findUnique({
        where: { uploadId: input.uploadId },
      });
      if (!current) throw new Error('promotion not found');
      if (
        current.copyState === 'dispatch_rejected' &&
        current.disposition === 'not_created'
      ) {
        if (
          !input.eventEnvelopeSha256 ||
          !input.eventTime ||
          !input.sourceObjectKeyHash ||
          !input.destinationObjectKeyHash
        ) {
          throw new Error('late rejection conflict evidence is incomplete');
        }
        const conflict = {
          promotionId: current.id,
          providerEventId: input.providerEventId,
          accountId: current.accountId,
          bucket: current.bucket,
          sourceObjectKeyHash: input.sourceObjectKeyHash,
          destinationObjectKeyHash: input.destinationObjectKeyHash,
          eventTime: input.eventTime,
          eventEnvelopeSha256: input.eventEnvelopeSha256,
          providerObjectEtag: input.providerObjectEtag,
          rejectionDispatchRejectedAt: current.dispatchRejectedAt,
          rejectionReason: current.dispatchRejectionReason,
          rejectionObservedSourceEtag:
            current.dispatchRejectionObservedSourceEtag,
          rejectionFirstDestinationAbsentAt: current.firstDestinationAbsentAt,
          rejectionDestinationAbsentVerifiedAt:
            current.destinationAbsentVerifiedAt,
        };
        await transaction.imageUploadPromotionConflict.upsert({
          where: {
            promotionId_providerEventId: {
              promotionId: current.id,
              providerEventId: input.providerEventId,
            },
          },
          create: {
            id: randomUUID(),
            ...conflict,
            rejectionEvidenceSha256: conflictEvidenceHash(conflict),
            state: 'open',
            updatedAt: input.providerEventObservedAt,
          },
          update: {},
        });
        return current;
      }
      if (current.finalizationLeaseToken !== input.finalizationLeaseToken) {
        throw new Error('provider settlement lease mismatch');
      }
      if (
        current.copyResponseEtag &&
        current.copyResponseEtag !== input.providerObjectEtag
      ) {
        throw new Error('provider settlement ETag mismatch');
      }
      const updated = await transaction.imageUploadPromotion.updateMany({
        where: {
          uploadId: input.uploadId,
          finalizationLeaseToken: input.finalizationLeaseToken,
          copyState: { in: ['dispatched', 'provider_settled'] },
        },
        data: {
          copyState: 'provider_settled',
          providerSettlementObservedAt: input.providerSettlementObservedAt,
          providerEventId: input.providerEventId,
          providerEventObservedAt: input.providerEventObservedAt,
          settlementSource: input.settlementSource,
          providerObjectEtag: input.providerObjectEtag,
        },
      });
      if (updated.count === 0) {
        return rereadPromotion(transaction, input.uploadId);
      }
      return rereadPromotion(transaction, input.uploadId);
    }, SERIALIZABLE) as Promise<PromotionRecord>;
  }

  async openLateEventConflict(
    input: LateEventConflictInput,
  ): Promise<PromotionConflictRecord> {
    return this.prisma.$transaction(async (rawTransaction) => {
      const transaction = rawTransaction as TransactionClient;
      const promotion = await transaction.imageUploadPromotion.findUnique({
        where: { uploadId: input.uploadId },
      });
      if (
        !promotion ||
        promotion.copyState !== 'dispatch_rejected' ||
        promotion.disposition !== 'not_created'
      ) {
        throw new Error('late conflict requires rejected/not-created state');
      }
      const snapshot = {
        accountId: input.accountId,
        bucket: input.bucket,
        sourceObjectKeyHash: input.sourceObjectKeyHash,
        destinationObjectKeyHash: input.destinationObjectKeyHash,
        eventTime: input.eventTime,
        eventEnvelopeSha256: input.eventEnvelopeSha256,
        providerObjectEtag: input.providerObjectEtag,
        rejectionDispatchRejectedAt: promotion.dispatchRejectedAt,
        rejectionReason: promotion.dispatchRejectionReason,
        rejectionObservedSourceEtag:
          promotion.dispatchRejectionObservedSourceEtag,
        rejectionFirstDestinationAbsentAt: promotion.firstDestinationAbsentAt,
        rejectionDestinationAbsentVerifiedAt:
          promotion.destinationAbsentVerifiedAt,
      };
      return transaction.imageUploadPromotionConflict.upsert({
        where: {
          promotionId_providerEventId: {
            promotionId: promotion.id,
            providerEventId: input.providerEventId,
          },
        },
        create: {
          id: randomUUID(),
          promotionId: promotion.id,
          providerEventId: input.providerEventId,
          ...snapshot,
          rejectionEvidenceSha256: conflictEvidenceHash(snapshot),
          state: 'open',
          updatedAt: input.providerEventObservedAt,
        },
        update: {},
      });
    }, SERIALIZABLE) as Promise<PromotionConflictRecord>;
  }

  async resolveLateEventConflict(
    input: ResolveLateEventConflictInput,
  ): Promise<PromotionConflictRecord> {
    return this.prisma.$transaction(async (rawTransaction) => {
      const transaction = rawTransaction as TransactionClient;
      const conflict =
        await transaction.imageUploadPromotionConflict.findUnique({
          where: { id: input.id },
        });
      if (!conflict || conflict.state !== input.expectedState) {
        throw new Error('late conflict is not open');
      }
      const actualEvidenceSha256 = conflictEvidenceHash({
        accountId: conflict.accountId,
        bucket: conflict.bucket,
        sourceObjectKeyHash: conflict.sourceObjectKeyHash,
        destinationObjectKeyHash: conflict.destinationObjectKeyHash,
        eventTime: conflict.eventTime,
        eventEnvelopeSha256: conflict.eventEnvelopeSha256,
        providerObjectEtag: conflict.providerObjectEtag,
        rejectionDispatchRejectedAt: conflict.rejectionDispatchRejectedAt,
        rejectionReason: conflict.rejectionReason,
        rejectionObservedSourceEtag: conflict.rejectionObservedSourceEtag,
        rejectionFirstDestinationAbsentAt:
          conflict.rejectionFirstDestinationAbsentAt,
        rejectionDestinationAbsentVerifiedAt:
          conflict.rejectionDestinationAbsentVerifiedAt,
      });
      if (actualEvidenceSha256 !== conflict.rejectionEvidenceSha256) {
        throw new Error('late conflict snapshot hash drift');
      }
      const updated = await transaction.imageUploadPromotionConflict.updateMany(
        {
          where: {
            id: input.id,
            state: input.expectedState,
            rejectionEvidenceSha256: actualEvidenceSha256,
          },
          data: {
            state: 'resolved',
            resolution: input.resolution,
            operatorIdentityFingerprint: input.operatorIdentityFingerprint,
            approvalDigest: input.approvalDigest,
            observedDestinationEtag: input.observedDestinationEtag,
            finalAbsentVerifiedAt: input.finalAbsentVerifiedAt,
            resolvedAt: input.resolvedAt,
          },
        },
      );
      if (updated.count === 0) {
        const winner =
          await transaction.imageUploadPromotionConflict.findUnique({
            where: { id: input.id },
          });
        if (!winner) throw new Error('conflict resolution CAS lost');
        return winner;
      }
      return transaction.imageUploadPromotionConflict.findUnique({
        where: { id: input.id },
      });
    }, SERIALIZABLE) as Promise<PromotionConflictRecord>;
  }

  async openProviderEventQuarantine(
    input: OpenProviderEventQuarantineInput,
  ): Promise<ProviderEventQuarantineRecord> {
    if (
      (input.reason === 'malformed_event' &&
        (input.providerEventId !== null || input.eventEnvelope !== null)) ||
      (input.reason === 'unmatched_event' &&
        (input.providerEventId === null || input.eventEnvelope === null))
    ) {
      throw new Error('quarantine reason/evidence mismatch');
    }
    requirePositive(input.attempts, 'attempts');
    const bodySha256 = sha256(input.rawBody);
    const eventEnvelopeSha256 =
      input.eventEnvelope === null
        ? null
        : sha256(canonicalize(input.eventEnvelope));
    const identity =
      input.providerEventId === null
        ? {
            sourceQueueId: input.sourceQueueId,
            bodySha256,
          }
        : { providerEventId: input.providerEventId };
    const quarantineFingerprintSha256 = sha256(canonicalJson(identity));

    return this.prisma.$transaction(async (rawTransaction) => {
      const transaction = rawTransaction as TransactionClient;
      const quarantine =
        await transaction.imageUploadProviderEventQuarantine.upsert({
          where: { quarantineFingerprintSha256 },
          create: {
            id: randomUUID(),
            providerEventId: input.providerEventId,
            messageId: input.messageId,
            sourceQueueId: input.sourceQueueId,
            currentQueueId: input.currentQueueId,
            leaseId: input.leaseId,
            leaseDeadline: input.leaseDeadline,
            attempts: input.attempts,
            bodySha256,
            eventEnvelopeSha256,
            quarantineFingerprintSha256,
            reason: input.reason,
            firstObservedAt: input.observedAt,
            lastObservedAt: input.observedAt,
            state: 'open',
            replayRequestId: input.replayRequestId ?? null,
          },
          update: {
            currentQueueId: input.currentQueueId,
            messageId: input.messageId,
            leaseId: input.leaseId,
            leaseDeadline: input.leaseDeadline,
            attempts: input.attempts,
            lastObservedAt: input.observedAt,
          },
        });
      const locationObservationSha256 = sha256(
        canonicalJson({
          attempts: String(input.attempts),
          currentQueueId: input.currentQueueId,
          leaseDeadline: input.leaseDeadline.toISOString(),
          leaseId: input.leaseId,
          messageId: input.messageId,
          quarantineFingerprintSha256,
          replayRequestId: input.replayRequestId ?? '',
        }),
      );
      if (transaction.imageUploadProviderEventQuarantineLocation) {
        try {
          await transaction.imageUploadProviderEventQuarantineLocation.create({
            data: {
              id: randomUUID(),
              quarantineId: quarantine.id,
              queueKind:
                input.currentQueueId === input.sourceQueueId ? 'source' : 'dlq',
              queueId: input.currentQueueId,
              messageId: input.messageId,
              replayRequestId: input.replayRequestId ?? null,
              leaseId: input.leaseId,
              leaseDeadline: input.leaseDeadline,
              attempts: input.attempts,
              observedAt: input.observedAt,
              locationObservationSha256,
            },
          });
        } catch (error) {
          if (
            !(
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === 'P2002'
            )
          ) {
            throw error;
          }
        }
      }
      const pointer =
        await transaction.imageUploadProviderEventQuarantine.updateMany({
          where: { id: quarantine.id },
          data: { latestLocationObservationSha256: locationObservationSha256 },
        });
      if (pointer.count !== 1) {
        throw new Error('quarantine location pointer CAS lost');
      }
      return quarantine;
    }, SERIALIZABLE) as Promise<ProviderEventQuarantineRecord>;
  }

  async beginProviderEventQuarantineResolution(
    input: BeginProviderEventQuarantineResolutionInput,
  ): Promise<ProviderEventQuarantineRecord> {
    return this.prisma.$transaction(async (rawTransaction) => {
      const transaction = rawTransaction as TransactionClient;
      const result =
        await transaction.imageUploadProviderEventQuarantine.updateMany({
          where: { id: input.id, state: 'open' },
          data: {
            state: 'resolving',
            resolutionAttemptId: input.resolutionAttemptId,
            resolution: input.resolution,
            operatorIdentityFingerprint: input.operatorIdentityFingerprint,
            approvalDigest: input.approvalDigest,
            resolutionStartedAt: input.resolutionStartedAt,
          },
        });
      if (result.count === 0) {
        const winner =
          await transaction.imageUploadProviderEventQuarantine.findUnique({
            where: { id: input.id },
          });
        if (!winner) throw new Error('quarantine resolution CAS lost');
        return winner;
      }
      return transaction.imageUploadProviderEventQuarantine.findUnique({
        where: { id: input.id },
      });
    }, SERIALIZABLE) as Promise<ProviderEventQuarantineRecord>;
  }

  async finalizeProviderEventQuarantineResolution(
    input: FinalizeProviderEventQuarantineResolutionInput,
  ): Promise<ProviderEventQuarantineRecord> {
    if (input.acknowledgedLocationCount < 0) {
      throw new Error('acknowledgedLocationCount is invalid');
    }
    if (
      input.resolution === 'replay_requested' &&
      (!input.replayQueueId ||
        !input.replayRequestId ||
        !input.replayMessageId ||
        !input.replayRequestedAt)
    ) {
      throw new Error('replay evidence is incomplete');
    }
    return this.prisma.$transaction(async (rawTransaction) => {
      const transaction = rawTransaction as TransactionClient;
      const current =
        await transaction.imageUploadProviderEventQuarantine.findUnique({
          where: { id: input.id },
        });
      if (
        !current ||
        current.state !== 'resolving' ||
        current.resolutionAttemptId !== input.resolutionAttemptId ||
        current.resolution !== input.resolution ||
        !current.resolutionStartedAt ||
        !current.operatorIdentityFingerprint ||
        !current.approvalDigest
      ) {
        throw new Error('durable quarantine resolution intent mismatch');
      }
      const [requested, succeeded] = await Promise.all([
        transaction.imageUploadProviderEventQuarantineAction.count({
          where: {
            quarantineId: input.id,
            resolutionAttemptId: input.resolutionAttemptId,
            action: 'ack_requested',
          },
        }),
        transaction.imageUploadProviderEventQuarantineAction.count({
          where: {
            quarantineId: input.id,
            resolutionAttemptId: input.resolutionAttemptId,
            action: 'ack_succeeded',
          },
        }),
      ]);
      if (
        requested !== input.acknowledgedLocationCount ||
        succeeded !== input.acknowledgedLocationCount
      ) {
        throw new Error('not every observed location is acknowledged');
      }
      if (input.resolution === 'replay_requested') {
        const [publishRequested, published] = await Promise.all([
          transaction.imageUploadProviderEventQuarantineAction.count({
            where: {
              quarantineId: input.id,
              resolutionAttemptId: input.resolutionAttemptId,
              action: 'replay_publish_requested',
              replayRequestId: input.replayRequestId,
            },
          }),
          transaction.imageUploadProviderEventQuarantineAction.count({
            where: {
              quarantineId: input.id,
              resolutionAttemptId: input.resolutionAttemptId,
              action: 'replay_published',
              replayRequestId: input.replayRequestId,
            },
          }),
        ]);
        if (publishRequested !== 1 || published !== 1) {
          throw new Error('replay publish evidence is incomplete');
        }
      }
      await transaction.imageUploadProviderEventQuarantineResolution.create({
        data: {
          id: input.resolutionAttemptId,
          quarantineId: input.id,
          resolution: input.resolution,
          operatorIdentityFingerprint: current.operatorIdentityFingerprint,
          approvalDigest: current.approvalDigest,
          resolutionStartedAt: current.resolutionStartedAt,
          acknowledgedLocationCount: input.acknowledgedLocationCount,
          resolutionScanCompletedAt: input.resolutionScanCompletedAt,
          replayQueueId: input.replayQueueId,
          replayRequestId: input.replayRequestId,
          replayMessageId: input.replayMessageId,
          replayRequestedAt: input.replayRequestedAt,
          acknowledgedAt: input.acknowledgedAt,
          resolvedAt: input.resolvedAt,
          resolutionEvidenceSha256: input.resolutionEvidenceSha256,
        },
      });
      const updated =
        await transaction.imageUploadProviderEventQuarantine.updateMany({
          where: {
            id: input.id,
            state: 'resolving',
            resolutionAttemptId: input.resolutionAttemptId,
            resolution: input.resolution,
          },
          data: {
            state: 'resolved',
            latestResolutionAttemptId: input.resolutionAttemptId,
            latestResolutionEvidenceSha256: input.resolutionEvidenceSha256,
            acknowledgedLocationCount: input.acknowledgedLocationCount,
            resolutionScanCompletedAt: input.resolutionScanCompletedAt,
            replayQueueId: input.replayQueueId,
            replayRequestId: input.replayRequestId,
            replayMessageId: input.replayMessageId,
            replayRequestedAt: input.replayRequestedAt,
            acknowledgedAt: input.acknowledgedAt,
            resolvedAt: input.resolvedAt,
          },
        });
      if (updated.count !== 1) {
        throw new Error('quarantine finalization CAS lost');
      }
      return transaction.imageUploadProviderEventQuarantine.findUnique({
        where: { id: input.id },
      });
    }, SERIALIZABLE) as Promise<ProviderEventQuarantineRecord>;
  }

  async reopenProviderEventQuarantineAfterReplay(
    input: ReopenProviderEventQuarantineAfterReplayInput,
  ): Promise<ProviderEventQuarantineRecord> {
    return this.prisma.$transaction(async (rawTransaction) => {
      const transaction = rawTransaction as TransactionClient;
      const snapshot =
        await transaction.imageUploadProviderEventQuarantineResolution.findUnique(
          {
            where: { id: input.resolutionAttemptId },
          },
        );
      if (
        !snapshot ||
        snapshot.quarantineId !== input.id ||
        snapshot.resolution !== 'replay_requested' ||
        snapshot.resolutionEvidenceSha256 !== input.resolutionEvidenceSha256
      ) {
        throw new Error('completed replay snapshot mismatch');
      }
      const updated =
        await transaction.imageUploadProviderEventQuarantine.updateMany({
          where: {
            id: input.id,
            state: 'resolved',
            resolution: 'replay_requested',
            latestResolutionAttemptId: input.resolutionAttemptId,
            latestResolutionEvidenceSha256: input.resolutionEvidenceSha256,
          },
          data: {
            state: 'open',
            resolutionAttemptId: null,
            resolution: null,
            resolutionStartedAt: null,
            acknowledgedLocationCount: null,
            resolutionScanCompletedAt: null,
            operatorIdentityFingerprint: null,
            approvalDigest: null,
            replayQueueId: null,
            replayRequestId: null,
            replayMessageId: null,
            replayRequestedAt: null,
            acknowledgedAt: null,
            resolvedAt: null,
          },
        });
      if (updated.count !== 1) throw new Error('quarantine reopen CAS lost');
      return transaction.imageUploadProviderEventQuarantine.findUnique({
        where: { id: input.id },
      });
    }, SERIALIZABLE) as Promise<ProviderEventQuarantineRecord>;
  }

  async markCommitted(input: CommitPromotionInput): Promise<boolean> {
    return this.prisma.$transaction(async (rawTransaction) => {
      const transaction = rawTransaction as TransactionClient;
      const image = await transaction.image.findFirst({
        where: {
          id: input.imageId,
          r2ObjectKey: input.destinationObjectKey,
        },
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

  async markVerifiedDeleted(input: VerifiedDeletionInput): Promise<boolean> {
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
      input.visibilityTimeoutMs <= 0 ||
      input.destinationAbsentVerifiedAt.getTime() -
        input.firstDestinationAbsentAt.getTime() <
        input.visibilityTimeoutMs ||
      input.now.getTime() < input.destinationAbsentVerifiedAt.getTime()
    ) {
      throw new Error('destination absence evidence is incomplete');
    }
    if (
      (input.reason === 'source_missing' &&
        input.observedSourceEtag !== null) ||
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
        promotion.providerEventId ||
        promotion.copyResponseObservedAt
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
          providerEventId: null,
          copyResponseObservedAt: null,
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
        input.now.getTime() + 30 * 24 * 60 * 60 * 1000,
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
