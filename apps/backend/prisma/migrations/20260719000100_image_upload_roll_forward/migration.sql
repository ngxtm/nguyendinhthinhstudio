CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "Image"
  ADD COLUMN "fileSizeBytes" INTEGER;

ALTER TABLE "ImageUpload"
  ADD COLUMN "clientRequestId" TEXT,
  ADD COLUMN "createdByAdminId" TEXT,
  ADD COLUMN "policyVersion" TEXT,
  ADD COLUMN "policySnapshot" JSONB,
  ADD COLUMN "processedSha256" TEXT,
  ADD COLUMN "presignExpiresAt" TIMESTAMP(3),
  ADD COLUMN "finalizationLeaseToken" TEXT,
  ADD COLUMN "resultImageId" TEXT,
  ADD COLUMN "resultDeletedAt" TIMESTAMP(3),
  ADD COLUMN "terminalAt" TIMESTAMP(3),
  ADD COLUMN "resultRetentionExpiresAt" TIMESTAMP(3),
  ADD COLUMN "failureCode" TEXT,
  ADD COLUMN "temporaryCleanupState" TEXT,
  ADD COLUMN "temporaryCleanupAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "temporaryCleanupNextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "temporaryCleanupVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "temporaryCleanupLastErrorCategory" TEXT;

CREATE UNIQUE INDEX "ImageUpload_clientRequestId_key"
  ON "ImageUpload"("clientRequestId");
CREATE INDEX "ImageUpload_createdByAdminId_createdAt_idx"
  ON "ImageUpload"("createdByAdminId", "createdAt");
CREATE INDEX "ImageUpload_temporaryCleanupState_temporaryCleanupNextAttemptAt_idx"
  ON "ImageUpload"("temporaryCleanupState", "temporaryCleanupNextAttemptAt");

CREATE TABLE "ImageUploadIdempotency" (
  "clientRequestId" TEXT NOT NULL,
  "createdByAdminId" TEXT NOT NULL,
  "uploadId" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "terminalOutcome" TEXT,
  "resultImageId" TEXT,
  "resultDeletedAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "terminalAt" TIMESTAMP(3),
  "resultRetentionExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "ImageUploadIdempotency_pkey" PRIMARY KEY ("clientRequestId")
);

CREATE UNIQUE INDEX "ImageUploadIdempotency_uploadId_key"
  ON "ImageUploadIdempotency"("uploadId");
CREATE INDEX "ImageUploadIdempotency_createdByAdminId_createdAt_idx"
  ON "ImageUploadIdempotency"("createdByAdminId", "createdAt");
CREATE INDEX "ImageUploadIdempotency_createdAt_idx"
  ON "ImageUploadIdempotency"("createdAt");

CREATE TABLE "ImageUploadPromotion" (
  "id" TEXT NOT NULL,
  "uploadId" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "albumId" TEXT NOT NULL,
  "finalizationLeaseToken" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "bucket" TEXT NOT NULL,
  "sourceObjectKey" TEXT NOT NULL,
  "sourceEtag" TEXT,
  "destinationObjectKey" TEXT NOT NULL,
  "inspectedSha256" TEXT,
  "inspectedByteSize" INTEGER,
  "canonicalMime" TEXT,
  "inspectedWidth" INTEGER,
  "inspectedHeight" INTEGER,
  "policyVersion" TEXT,
  "committedResultImageId" TEXT,
  "copyState" TEXT NOT NULL,
  "disposition" TEXT NOT NULL,
  "copyDispatchedAt" TIMESTAMP(3),
  "copyResponseObservedAt" TIMESTAMP(3),
  "copyResponseEtag" TEXT,
  "providerSettlementObservedAt" TIMESTAMP(3),
  "destinationHeadObservedAt" TIMESTAMP(3),
  "destinationHeadEtag" TEXT,
  "destinationHeadBytes" INTEGER,
  "destinationHeadMime" TEXT,
  "destinationHeadMetadataSha256" TEXT,
  "dispatchAttempts" INTEGER NOT NULL DEFAULT 0,
  "lastDispatchAttemptAt" TIMESTAMP(3),
  "nextReconcileAt" TIMESTAMP(3),
  "firstDestinationAbsentAt" TIMESTAMP(3),
  "destinationAbsentVerifiedAt" TIMESTAMP(3),
  "dispatchRejectedAt" TIMESTAMP(3),
  "dispatchRejectionReason" TEXT,
  "dispatchRejectionObservedSourceEtag" TEXT,
  "reconcileAttempts" INTEGER NOT NULL DEFAULT 0,
  "lastReconciledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImageUploadPromotion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ImageUploadPromotion_uploadId_key"
  ON "ImageUploadPromotion"("uploadId");
CREATE UNIQUE INDEX "ImageUploadPromotion_destinationObjectKey_key"
  ON "ImageUploadPromotion"("destinationObjectKey");
CREATE INDEX "ImageUploadPromotion_copyState_nextReconcileAt_idx"
  ON "ImageUploadPromotion"("copyState", "nextReconcileAt");
CREATE INDEX "ImageUploadPromotion_disposition_nextReconcileAt_idx"
  ON "ImageUploadPromotion"("disposition", "nextReconcileAt");
CREATE INDEX "ImageUploadPromotion_albumId_disposition_idx"
  ON "ImageUploadPromotion"("albumId", "disposition");

CREATE TABLE "ImageUploadPromotionConflict" (
  "id" TEXT NOT NULL,
  "promotionId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "bucket" TEXT NOT NULL,
  "sourceObjectKeyHash" TEXT NOT NULL,
  "destinationObjectKeyHash" TEXT NOT NULL,
  "expectedDestinationEtag" TEXT NOT NULL,
  "observedDestinationEtag" TEXT,
  "observedDestinationBytes" INTEGER,
  "observedDestinationMime" TEXT,
  "destinationMetadataSha256" TEXT NOT NULL,
  "mismatchReason" TEXT NOT NULL,
  "conflictEvidenceSha256" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "resolution" TEXT,
  "operatorIdentityFingerprint" TEXT,
  "approvalDigest" TEXT,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "finalAbsentVerifiedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImageUploadPromotionConflict_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ImageUploadPromotionConflict_promotionId_key"
  ON "ImageUploadPromotionConflict"("promotionId");
CREATE INDEX "ImageUploadPromotionConflict_state_openedAt_idx"
  ON "ImageUploadPromotionConflict"("state", "openedAt");

CREATE TABLE "ImageUploadRateLimitEvent" (
  "id" BIGSERIAL NOT NULL,
  "createdByAdminId" TEXT NOT NULL,
  "routeScope" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImageUploadRateLimitEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImageUploadRateLimitEvent_createdByAdminId_routeScope_occurredAt_idx"
  ON "ImageUploadRateLimitEvent"("createdByAdminId", "routeScope", "occurredAt");
CREATE INDEX "ImageUploadRateLimitEvent_occurredAt_idx"
  ON "ImageUploadRateLimitEvent"("occurredAt");

CREATE TABLE "ImageUploadReconcilerHeartbeat" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "buildFingerprint" TEXT NOT NULL,
  "lockAcquiredAt" TIMESTAMP(3) NOT NULL,
  "heartbeatAt" TIMESTAMP(3) NOT NULL,
  "pendingSessionExpiryCompletedAt" TIMESTAMP(3),
  "promotionRecoveryCompletedAt" TIMESTAMP(3),
  "temporaryCleanupCompletedAt" TIMESTAMP(3),
  "imageDeletionCompletedAt" TIMESTAMP(3),
  "rateLimitCleanupCompletedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImageUploadReconcilerHeartbeat_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ImageUploadReconcilerHeartbeat_singleton_check"
    CHECK ("id" = 'singleton')
);

ALTER TABLE "ImageUploadPromotion"
  ADD CONSTRAINT "ImageUploadPromotion_origin_check"
  CHECK ("origin" IN ('current', 'legacy_bridge')),
  ADD CONSTRAINT "ImageUploadPromotion_copyState_check"
  CHECK ("copyState" IN ('dispatched', 'provider_settled', 'dispatch_rejected')),
  ADD CONSTRAINT "ImageUploadPromotion_disposition_check"
  CHECK ("disposition" IN ('pending', 'committed', 'cleanup_required', 'verified_deleted', 'not_created')),
  ADD CONSTRAINT "ImageUploadPromotion_current_facts_check"
  CHECK (
    "origin" <> 'current' OR (
      "sourceEtag" IS NOT NULL AND
      "inspectedSha256" IS NOT NULL AND
      "inspectedByteSize" IS NOT NULL AND
      "canonicalMime" IS NOT NULL AND
      "inspectedWidth" IS NOT NULL AND
      "inspectedHeight" IS NOT NULL AND
      "policyVersion" IS NOT NULL AND
      "copyDispatchedAt" IS NOT NULL AND
      "lastDispatchAttemptAt" IS NOT NULL AND
      "nextReconcileAt" IS NOT NULL AND
      "dispatchAttempts" >= 1
    )
  ),
  ADD CONSTRAINT "ImageUploadPromotion_source_etag_check"
  CHECK (
    "sourceEtag" IS NOT NULL OR (
      "origin" = 'legacy_bridge' AND
      "disposition" = 'committed' AND
      "copyState" = 'provider_settled'
    )
  ),
  ADD CONSTRAINT "ImageUploadPromotion_committed_result_check"
  CHECK ("disposition" <> 'committed' OR "committedResultImageId" IS NOT NULL),
  ADD CONSTRAINT "ImageUploadPromotion_provider_evidence_check"
  CHECK (
    "copyState" <> 'provider_settled' OR (
      "providerSettlementObservedAt" IS NOT NULL AND
      (
        ("copyResponseObservedAt" IS NOT NULL AND "copyResponseEtag" IS NOT NULL) OR
        (
          "destinationHeadObservedAt" IS NOT NULL AND
          "destinationHeadEtag" IS NOT NULL AND
          "destinationHeadBytes" IS NOT NULL AND
          "destinationHeadMime" IS NOT NULL AND
          "destinationHeadMetadataSha256" IS NOT NULL
        )
      ) AND
      (
        "copyResponseEtag" IS NULL OR
        "destinationHeadEtag" IS NULL OR
        "copyResponseEtag" = "destinationHeadEtag"
      )
    )
  ),
  ADD CONSTRAINT "ImageUploadPromotion_response_pair_check"
  CHECK (
    (("copyResponseObservedAt" IS NULL) = ("copyResponseEtag" IS NULL)) AND
    ("copyResponseObservedAt" IS NULL OR "copyState" = 'provider_settled')
  ),
  ADD CONSTRAINT "ImageUploadPromotion_destination_head_pair_check"
  CHECK (
    (
      "destinationHeadObservedAt" IS NULL AND
      "destinationHeadEtag" IS NULL AND
      "destinationHeadBytes" IS NULL AND
      "destinationHeadMime" IS NULL AND
      "destinationHeadMetadataSha256" IS NULL
    ) OR (
      "destinationHeadObservedAt" IS NOT NULL AND
      "destinationHeadEtag" IS NOT NULL AND
      "destinationHeadBytes" IS NOT NULL AND
      "destinationHeadMime" IS NOT NULL AND
      "destinationHeadMetadataSha256" IS NOT NULL AND
      "copyState" = 'provider_settled'
    )
  ),
  ADD CONSTRAINT "ImageUploadPromotion_dispatch_rejected_check"
  CHECK (
    (
      "copyState" = 'dispatch_rejected' AND
      "disposition" = 'not_created' AND
      "dispatchRejectedAt" IS NOT NULL AND
      "providerSettlementObservedAt" IS NULL AND
      "copyResponseObservedAt" IS NULL AND
      "copyResponseEtag" IS NULL AND
      "destinationHeadObservedAt" IS NULL AND
      "destinationHeadEtag" IS NULL AND
      "destinationHeadBytes" IS NULL AND
      "destinationHeadMime" IS NULL AND
      "destinationHeadMetadataSha256" IS NULL AND
      "committedResultImageId" IS NULL AND
      "firstDestinationAbsentAt" IS NOT NULL AND
      "destinationAbsentVerifiedAt" IS NOT NULL AND
      "destinationAbsentVerifiedAt" > "firstDestinationAbsentAt" AND
      "dispatchRejectedAt" >= "destinationAbsentVerifiedAt" AND
      "dispatchRejectionReason" IN ('source_missing', 'source_etag_mismatch') AND
      (
        ("dispatchRejectionReason" = 'source_missing' AND "dispatchRejectionObservedSourceEtag" IS NULL) OR
        (
          "dispatchRejectionReason" = 'source_etag_mismatch' AND
          "dispatchRejectionObservedSourceEtag" IS NOT NULL AND
          "dispatchRejectionObservedSourceEtag" <> "sourceEtag"
        )
      )
    ) OR (
      "copyState" <> 'dispatch_rejected' AND
      "disposition" <> 'not_created' AND
      "dispatchRejectedAt" IS NULL AND
      "destinationAbsentVerifiedAt" IS NULL AND
      "dispatchRejectionReason" IS NULL AND
      "dispatchRejectionObservedSourceEtag" IS NULL
    )
  );

ALTER TABLE "ImageUpload"
  ADD CONSTRAINT "ImageUpload_temporary_cleanup_state_check"
  CHECK (
    "temporaryCleanupAttempts" >= 0 AND (
      (
        "temporaryCleanupState" IS NULL AND
        "temporaryCleanupVerifiedAt" IS NULL
      ) OR (
        "temporaryCleanupState" = 'pending' AND
        "temporaryCleanupNextAttemptAt" IS NOT NULL AND
        "temporaryCleanupVerifiedAt" IS NULL
      ) OR (
        "temporaryCleanupState" = 'verified_deleted' AND
        "presignExpiresAt" IS NOT NULL AND
        "temporaryCleanupVerifiedAt" IS NOT NULL AND
        "temporaryCleanupVerifiedAt" >= "presignExpiresAt"
      )
    )
  );

ALTER TABLE "ImageUploadRateLimitEvent"
  ADD CONSTRAINT "ImageUploadRateLimitEvent_route_scope_check"
  CHECK ("routeScope" IN ('upload_url', 'confirm_upload', 'upload_status', 'abandon_upload'));

ALTER TABLE "ImageObjectDeletion"
  ADD COLUMN "authority" TEXT NOT NULL DEFAULT 'current_result',
  ADD COLUMN "objectKeyHash" TEXT,
  ADD COLUMN "legacyImageSnapshotSha256" TEXT,
  ADD COLUMN "providerDisposition" TEXT;

UPDATE "ImageObjectDeletion"
SET
  "authority" = 'non_r2_deferred',
  "providerDisposition" = CASE
    WHEN "status" = 'deferred' THEN 'legacy_deferred'
    ELSE 'not_applicable'
  END
WHERE "provider" <> 'r2';

UPDATE "ImageObjectDeletion"
SET "objectKeyHash" = encode(digest("objectKey", 'sha256'), 'hex')
WHERE "provider" = 'r2' AND "objectKeyHash" IS NULL;

ALTER TABLE "ImageObjectDeletion"
  ADD CONSTRAINT "ImageObjectDeletion_authority_check"
  CHECK ("authority" IN ('current_result', 'legacy_image', 'non_r2_deferred')),
  ADD CONSTRAINT "ImageObjectDeletion_provider_disposition_check"
  CHECK ("providerDisposition" IS NULL OR "providerDisposition" IN ('legacy_deferred', 'not_applicable')),
  ADD CONSTRAINT "ImageObjectDeletion_authority_evidence_check"
  CHECK (
    (
      "authority" = 'current_result' AND
      "objectKeyHash" IS NOT NULL AND
      "legacyImageSnapshotSha256" IS NULL AND
      "providerDisposition" IS NULL
    ) OR (
      "authority" = 'legacy_image' AND
      "objectKeyHash" IS NOT NULL AND
      "legacyImageSnapshotSha256" IS NOT NULL AND
      "providerDisposition" IS NULL
    ) OR (
      "authority" = 'non_r2_deferred' AND
      "providerDisposition" IS NOT NULL
    )
  );

ALTER TABLE "ImageUploadPromotionConflict"
  ADD CONSTRAINT "ImageUploadPromotionConflict_state_check"
  CHECK ("state" IN ('open', 'resolved')),
  ADD CONSTRAINT "ImageUploadPromotionConflict_mismatch_check"
  CHECK (
    "mismatchReason" IN ('destination_etag_mismatch', 'destination_metadata_mismatch') AND
    "expectedDestinationEtag" IS NOT NULL AND
    "destinationMetadataSha256" IS NOT NULL
  ),
  ADD CONSTRAINT "ImageUploadPromotionConflict_resolution_check"
  CHECK (
    (
      "state" = 'open' AND
      "resolution" IS NULL AND
      "resolvedAt" IS NULL
    ) OR (
      "state" = 'resolved' AND
      "resolution" IN ('confirmed_absent', 'cleanup_authorized', 'committed_authorized') AND
      "resolvedAt" IS NOT NULL AND
      "operatorIdentityFingerprint" IS NOT NULL AND
      "approvalDigest" IS NOT NULL
    )
  );
