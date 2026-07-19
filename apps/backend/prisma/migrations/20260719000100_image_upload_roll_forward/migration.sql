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
  "providerEventId" TEXT,
  "providerEventObservedAt" TIMESTAMP(3),
  "settlementSource" TEXT,
  "providerObjectEtag" TEXT,
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
  "providerEventId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "bucket" TEXT NOT NULL,
  "sourceObjectKeyHash" TEXT NOT NULL,
  "destinationObjectKeyHash" TEXT NOT NULL,
  "eventTime" TIMESTAMP(3) NOT NULL,
  "eventEnvelopeSha256" TEXT NOT NULL,
  "providerObjectEtag" TEXT NOT NULL,
  "rejectionDispatchRejectedAt" TIMESTAMP(3) NOT NULL,
  "rejectionReason" TEXT NOT NULL,
  "rejectionObservedSourceEtag" TEXT,
  "rejectionFirstDestinationAbsentAt" TIMESTAMP(3) NOT NULL,
  "rejectionDestinationAbsentVerifiedAt" TIMESTAMP(3) NOT NULL,
  "rejectionEvidenceSha256" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "resolution" TEXT,
  "operatorIdentityFingerprint" TEXT,
  "approvalDigest" TEXT,
  "observedDestinationEtag" TEXT,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "finalAbsentVerifiedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImageUploadPromotionConflict_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ImageUploadPromotionConflict_promotionId_providerEventId_key"
  ON "ImageUploadPromotionConflict"("promotionId", "providerEventId");
CREATE INDEX "ImageUploadPromotionConflict_state_openedAt_idx"
  ON "ImageUploadPromotionConflict"("state", "openedAt");

CREATE TABLE "ImageUploadProviderEventQuarantine" (
  "id" TEXT NOT NULL,
  "providerEventId" TEXT,
  "messageId" TEXT NOT NULL,
  "sourceQueueId" TEXT NOT NULL,
  "currentQueueId" TEXT NOT NULL,
  "latestLocationObservationSha256" TEXT,
  "leaseId" TEXT NOT NULL,
  "leaseDeadline" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL,
  "bodySha256" TEXT NOT NULL,
  "eventEnvelopeSha256" TEXT,
  "quarantineFingerprintSha256" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "firstObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "state" TEXT NOT NULL,
  "resolutionAttemptId" TEXT,
  "latestResolutionAttemptId" TEXT,
  "latestResolutionEvidenceSha256" TEXT,
  "resolution" TEXT,
  "resolutionStartedAt" TIMESTAMP(3),
  "acknowledgedLocationCount" INTEGER,
  "resolutionScanCompletedAt" TIMESTAMP(3),
  "operatorIdentityFingerprint" TEXT,
  "approvalDigest" TEXT,
  "replayQueueId" TEXT,
  "replayRequestId" TEXT,
  "replayMessageId" TEXT,
  "replayRequestedAt" TIMESTAMP(3),
  "acknowledgedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "ImageUploadProviderEventQuarantine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ImageUploadProviderEventQuarantine_providerEventId_key"
  ON "ImageUploadProviderEventQuarantine"("providerEventId");
CREATE UNIQUE INDEX "ImageUploadProviderEventQuarantine_replayRequestId_key"
  ON "ImageUploadProviderEventQuarantine"("replayRequestId");
CREATE UNIQUE INDEX "ImageUploadProviderEventQuarantine_quarantineFingerprintSha256_key"
  ON "ImageUploadProviderEventQuarantine"("quarantineFingerprintSha256");
CREATE INDEX "ImageUploadProviderEventQuarantine_state_lastObservedAt_idx"
  ON "ImageUploadProviderEventQuarantine"("state", "lastObservedAt");

CREATE TABLE "ImageUploadProviderEventQuarantineLocation" (
  "id" TEXT NOT NULL,
  "quarantineId" TEXT NOT NULL,
  "queueKind" TEXT NOT NULL,
  "queueId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "replayRequestId" TEXT,
  "leaseId" TEXT NOT NULL,
  "leaseDeadline" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locationObservationSha256" TEXT NOT NULL,
  CONSTRAINT "ImageUploadProviderEventQuarantineLocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ImageUploadProviderEventQuarantineLocation_locationObservationSha256_key"
  ON "ImageUploadProviderEventQuarantineLocation"("locationObservationSha256");
CREATE UNIQUE INDEX "ImageUploadProviderEventQuarantineLocation_quarantineId_locationObservationSha256_key"
  ON "ImageUploadProviderEventQuarantineLocation"("quarantineId", "locationObservationSha256");
CREATE INDEX "ImageUploadProviderEventQuarantineLocation_quarantineId_observedAt_idx"
  ON "ImageUploadProviderEventQuarantineLocation"("quarantineId", "observedAt");

CREATE TABLE "ImageUploadProviderEventQuarantineAction" (
  "id" TEXT NOT NULL,
  "quarantineId" TEXT NOT NULL,
  "resolutionAttemptId" TEXT NOT NULL,
  "locationObservationSha256" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "queueKind" TEXT NOT NULL,
  "queueId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "replayRequestId" TEXT,
  "leaseId" TEXT NOT NULL,
  "actionEvidenceSha256" TEXT NOT NULL,
  "providerOutcome" TEXT,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actionSha256" TEXT NOT NULL,
  CONSTRAINT "ImageUploadProviderEventQuarantineAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ImageUploadProviderEventQuarantineAction_actionSha256_key"
  ON "ImageUploadProviderEventQuarantineAction"("actionSha256");
CREATE INDEX "ImageUploadProviderEventQuarantineAction_quarantineId_resolutionAttemptId_observedAt_idx"
  ON "ImageUploadProviderEventQuarantineAction"("quarantineId", "resolutionAttemptId", "observedAt");

CREATE TABLE "ImageUploadProviderEventQuarantineResolution" (
  "id" TEXT NOT NULL,
  "quarantineId" TEXT NOT NULL,
  "resolution" TEXT NOT NULL,
  "operatorIdentityFingerprint" TEXT NOT NULL,
  "approvalDigest" TEXT NOT NULL,
  "resolutionStartedAt" TIMESTAMP(3) NOT NULL,
  "acknowledgedLocationCount" INTEGER NOT NULL,
  "resolutionScanCompletedAt" TIMESTAMP(3) NOT NULL,
  "replayQueueId" TEXT,
  "replayRequestId" TEXT,
  "replayMessageId" TEXT,
  "replayRequestedAt" TIMESTAMP(3),
  "acknowledgedAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3) NOT NULL,
  "resolutionEvidenceSha256" TEXT NOT NULL,
  CONSTRAINT "ImageUploadProviderEventQuarantineResolution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ImageUploadProviderEventQuarantineResolution_quarantineId_id_key"
  ON "ImageUploadProviderEventQuarantineResolution"("quarantineId", "id");
CREATE UNIQUE INDEX "ImageUploadProviderEventQuarantineResolution_resolutionEvidenceSha256_key"
  ON "ImageUploadProviderEventQuarantineResolution"("resolutionEvidenceSha256");
CREATE INDEX "ImageUploadProviderEventQuarantineResolution_quarantineId_resolvedAt_idx"
  ON "ImageUploadProviderEventQuarantineResolution"("quarantineId", "resolvedAt");

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
  "queueSettlementCompletedAt" TIMESTAMP(3),
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
          "providerEventId" IS NOT NULL AND
          "providerEventObservedAt" IS NOT NULL AND
          "settlementSource" IS NOT NULL AND
          "providerObjectEtag" IS NOT NULL
        )
      ) AND
      (
        "copyResponseEtag" IS NULL OR
        "providerObjectEtag" IS NULL OR
        "copyResponseEtag" = "providerObjectEtag"
      )
    )
  ),
  ADD CONSTRAINT "ImageUploadPromotion_response_pair_check"
  CHECK (
    (("copyResponseObservedAt" IS NULL) = ("copyResponseEtag" IS NULL)) AND
    ("copyResponseObservedAt" IS NULL OR "copyState" = 'provider_settled')
  ),
  ADD CONSTRAINT "ImageUploadPromotion_event_evidence_check"
  CHECK (
    (
      "providerEventId" IS NULL AND
      "providerEventObservedAt" IS NULL AND
      "settlementSource" IS NULL AND
      "providerObjectEtag" IS NULL
    ) OR (
      "providerEventId" IS NOT NULL AND
      "providerEventObservedAt" IS NOT NULL AND
      "settlementSource" IS NOT NULL AND
      "providerObjectEtag" IS NOT NULL AND
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
      "providerEventId" IS NULL AND
      "providerEventObservedAt" IS NULL AND
      "settlementSource" IS NULL AND
      "providerObjectEtag" IS NULL AND
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

CREATE UNIQUE INDEX "ImageUploadPromotion_settlement_event_key"
  ON "ImageUploadPromotion"("settlementSource", "providerEventId")
  WHERE "settlementSource" IS NOT NULL AND "providerEventId" IS NOT NULL;

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

ALTER TABLE "ImageUploadProviderEventQuarantineLocation"
  ADD CONSTRAINT "ImageUploadProviderEventQuarantineLocation_kind_check"
  CHECK ("queueKind" IN ('source', 'dlq')),
  ADD CONSTRAINT "ImageUploadProviderEventQuarantineLocation_attempts_check"
  CHECK ("attempts" >= 1);

ALTER TABLE "ImageUploadProviderEventQuarantineAction"
  ADD CONSTRAINT "ImageUploadProviderEventQuarantineAction_kind_check"
  CHECK ("queueKind" IN ('source', 'dlq')),
  ADD CONSTRAINT "ImageUploadProviderEventQuarantineAction_action_check"
  CHECK ("action" IN ('ack_requested', 'ack_succeeded', 'replay_publish_requested', 'replay_published')),
  ADD CONSTRAINT "ImageUploadProviderEventQuarantineAction_replay_identity_check"
  CHECK (
    ("action" = 'ack_requested' AND "providerOutcome" IS NULL) OR
    (
      "action" = 'replay_publish_requested' AND
      "replayRequestId" IS NOT NULL AND
      "providerOutcome" IS NULL
    ) OR (
      "action" = 'ack_succeeded' AND
      "providerOutcome" IN ('acknowledged', 'already_absent')
    ) OR (
      "action" = 'replay_published' AND
      "replayRequestId" IS NOT NULL AND
      "providerOutcome" IN ('published', 'adopted_after_uncertain_publish')
    )
  ),
  ADD CONSTRAINT "ImageUploadProviderEventQuarantineAction_location_check"
  CHECK ("locationObservationSha256" IS NOT NULL);

ALTER TABLE "ImageUploadProviderEventQuarantineLocation"
  ADD CONSTRAINT "ImageUploadProviderEventQuarantineLocation_quarantine_fk"
  FOREIGN KEY ("quarantineId")
  REFERENCES "ImageUploadProviderEventQuarantine"("id")
  ON DELETE RESTRICT;

ALTER TABLE "ImageUploadProviderEventQuarantineAction"
  ADD CONSTRAINT "ImageUploadProviderEventQuarantineAction_location_fk"
  FOREIGN KEY ("quarantineId", "locationObservationSha256")
  REFERENCES "ImageUploadProviderEventQuarantineLocation"("quarantineId", "locationObservationSha256")
  ON DELETE RESTRICT;

ALTER TABLE "ImageUploadProviderEventQuarantineResolution"
  ADD CONSTRAINT "ImageUploadProviderEventQuarantineResolution_quarantine_fk"
  FOREIGN KEY ("quarantineId")
  REFERENCES "ImageUploadProviderEventQuarantine"("id")
  ON DELETE RESTRICT,
  ADD CONSTRAINT "ImageUploadProviderEventQuarantineResolution_resolution_check"
  CHECK (
    (
      "resolution" = 'quarantined_ack' AND
      "replayQueueId" IS NULL AND
      "replayRequestId" IS NULL AND
      "replayMessageId" IS NULL AND
      "replayRequestedAt" IS NULL
    ) OR (
      "resolution" = 'replay_requested' AND
      "replayQueueId" IS NOT NULL AND
      "replayRequestId" IS NOT NULL AND
      "replayMessageId" IS NOT NULL AND
      "replayRequestedAt" IS NOT NULL AND
      "resolutionStartedAt" <= "replayRequestedAt" AND
      "replayRequestedAt" <= "resolutionScanCompletedAt"
    )
  ),
  ADD CONSTRAINT "ImageUploadProviderEventQuarantineResolution_count_check"
  CHECK ("acknowledgedLocationCount" >= 0),
  ADD CONSTRAINT "ImageUploadProviderEventQuarantineResolution_time_order_check"
  CHECK (
    "resolutionStartedAt" <= "resolutionScanCompletedAt" AND
    "resolutionScanCompletedAt" <= "acknowledgedAt" AND
    "acknowledgedAt" <= "resolvedAt" AND
    (
      "replayRequestedAt" IS NULL OR (
        "resolutionStartedAt" <= "replayRequestedAt" AND
        "replayRequestedAt" <= "acknowledgedAt"
      )
    )
  );

ALTER TABLE "ImageUploadProviderEventQuarantine"
  ADD CONSTRAINT "ImageUploadProviderEventQuarantine_state_check"
  CHECK ("state" IN ('open', 'resolving', 'resolved')),
  ADD CONSTRAINT "ImageUploadProviderEventQuarantine_reason_check"
  CHECK ("reason" IN ('malformed_event', 'unmatched_event')),
  ADD CONSTRAINT "ImageUploadProviderEventQuarantine_envelope_evidence_check"
  CHECK (
    (
      "reason" = 'malformed_event' AND
      "eventEnvelopeSha256" IS NULL AND
      "providerEventId" IS NULL
    ) OR (
      "reason" = 'unmatched_event' AND
      "eventEnvelopeSha256" IS NOT NULL AND
      "providerEventId" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "ImageUploadProviderEventQuarantine_resolution_check"
  CHECK (
    (
      "state" = 'open' AND
      "resolutionAttemptId" IS NULL AND
      "resolution" IS NULL AND
      "resolutionStartedAt" IS NULL AND
      "acknowledgedLocationCount" IS NULL AND
      "resolutionScanCompletedAt" IS NULL AND
      "operatorIdentityFingerprint" IS NULL AND
      "approvalDigest" IS NULL AND
      "replayQueueId" IS NULL AND
      "replayRequestId" IS NULL AND
      "replayMessageId" IS NULL AND
      "replayRequestedAt" IS NULL AND
      "acknowledgedAt" IS NULL AND
      "resolvedAt" IS NULL
    ) OR (
      "state" = 'resolving' AND
      "resolutionAttemptId" IS NOT NULL AND
      "resolution" IN ('quarantined_ack', 'replay_requested') AND
      "resolutionStartedAt" IS NOT NULL AND
      "operatorIdentityFingerprint" IS NOT NULL AND
      "approvalDigest" IS NOT NULL AND
      "acknowledgedAt" IS NULL AND
      "resolvedAt" IS NULL
    ) OR (
      "state" = 'resolved' AND
      "resolutionAttemptId" IS NOT NULL AND
      "latestResolutionAttemptId" = "resolutionAttemptId" AND
      "latestResolutionEvidenceSha256" IS NOT NULL AND
      "resolution" = 'quarantined_ack' AND
      "resolutionStartedAt" IS NOT NULL AND
      "acknowledgedLocationCount" >= 0 AND
      "resolutionScanCompletedAt" IS NOT NULL AND
      "operatorIdentityFingerprint" IS NOT NULL AND
      "approvalDigest" IS NOT NULL AND
      "replayQueueId" IS NULL AND
      "replayRequestId" IS NULL AND
      "replayMessageId" IS NULL AND
      "replayRequestedAt" IS NULL AND
      "acknowledgedAt" IS NOT NULL AND
      "resolvedAt" IS NOT NULL
    ) OR (
      "state" = 'resolved' AND
      "resolutionAttemptId" IS NOT NULL AND
      "latestResolutionAttemptId" = "resolutionAttemptId" AND
      "latestResolutionEvidenceSha256" IS NOT NULL AND
      "resolution" = 'replay_requested' AND
      "resolutionStartedAt" IS NOT NULL AND
      "acknowledgedLocationCount" >= 0 AND
      "resolutionScanCompletedAt" IS NOT NULL AND
      "operatorIdentityFingerprint" IS NOT NULL AND
      "approvalDigest" IS NOT NULL AND
      "replayQueueId" IS NOT NULL AND
      "replayRequestId" IS NOT NULL AND
      "replayMessageId" IS NOT NULL AND
      "replayRequestedAt" IS NOT NULL AND
      "resolutionStartedAt" <= "replayRequestedAt" AND
      "replayRequestedAt" <= "resolutionScanCompletedAt" AND
      "acknowledgedAt" IS NOT NULL AND
      "resolvedAt" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "ImageUploadProviderEventQuarantine_attempts_check"
  CHECK ("attempts" >= 1);

ALTER TABLE "ImageUploadPromotionConflict"
  ADD CONSTRAINT "ImageUploadPromotionConflict_state_check"
  CHECK ("state" IN ('open', 'resolved')),
  ADD CONSTRAINT "ImageUploadPromotionConflict_rejection_snapshot_check"
  CHECK (
    "rejectionReason" IN ('source_missing', 'source_etag_mismatch') AND
    "rejectionDestinationAbsentVerifiedAt" > "rejectionFirstDestinationAbsentAt" AND
    "rejectionDispatchRejectedAt" >= "rejectionDestinationAbsentVerifiedAt" AND
    (
      (
        "rejectionReason" = 'source_missing' AND
        "rejectionObservedSourceEtag" IS NULL
      ) OR (
        "rejectionReason" = 'source_etag_mismatch' AND
        "rejectionObservedSourceEtag" IS NOT NULL
      )
    )
  ),
  ADD CONSTRAINT "ImageUploadPromotionConflict_resolution_check"
  CHECK (
    (
      "state" = 'open' AND
      "resolution" IS NULL AND
      "resolvedAt" IS NULL
    ) OR (
      "state" = 'resolved' AND
      "resolution" IN ('confirmed_absent_ack', 'cleanup_authorized', 'committed_authorized') AND
      "resolvedAt" IS NOT NULL AND
      "operatorIdentityFingerprint" IS NOT NULL AND
      "approvalDigest" IS NOT NULL
    )
  );

ALTER TABLE "ImageUploadProviderEventQuarantine"
  ADD CONSTRAINT "ImageUploadProviderEventQuarantine_latest_resolution_fk"
  FOREIGN KEY ("id", "latestResolutionAttemptId")
  REFERENCES "ImageUploadProviderEventQuarantineResolution"("quarantineId", "id")
  ON DELETE NO ACTION
  DEFERRABLE INITIALLY DEFERRED;
