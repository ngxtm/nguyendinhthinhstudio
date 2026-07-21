# Prisma and Promotion Foundation Implementation Plan

> **Free-compatible amendment:** Execute Task A1 in `free-compatible-polling-amendment.md`. Every Queue/DLQ/provider-event schema instruction below is retained only as historical checkbox evidence and is superseded; it must not be implemented or verified as a current requirement.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add current-version upload ownership, permanent request idempotency, and a durable promotion record created before every R2 CopyObject.

**Architecture:** `ImageUpload` owns live session state, `ImageUploadIdempotency` owns the permanent client-request outcome, and `ImageUploadPromotion` independently records provider COPY state and keep/delete disposition. The migration is additive for data safety, but no prior Prisma client is supported after cutover.

**Tech Stack:** Prisma 6, PostgreSQL, Jest, Testcontainers, serializable transactions.

---

### Task 1: Lock the schema contract with integration tests

**Files:**

- Create: `apps/backend/test/image-upload-schema.integration-spec.ts`
- Modify: `apps/backend/test/jest-integration.json`

- [ ] **Step 1: Write failing column and index assertions**

Assert exact additive shapes, preserving every legacy row:

```prisma
model Image {
  // existing fields remain unchanged
  fileSizeBytes Int?
}

model ImageUpload {
  // existing fields remain unchanged
  clientRequestId                  String?   @unique
  createdByAdminId                 String?
  policyVersion                    String?
  policySnapshot                   Json?
  processedSha256                  String?
  presignExpiresAt                 DateTime?
  finalizationLeaseToken           String?
  resultImageId                    String?
  resultDeletedAt                  DateTime?
  terminalAt                       DateTime?
  resultRetentionExpiresAt         DateTime?
  failureCode                      String?
  temporaryCleanupState            String?
  temporaryCleanupAttempts         Int       @default(0)
  temporaryCleanupNextAttemptAt    DateTime?
  temporaryCleanupVerifiedAt       DateTime?
  temporaryCleanupLastErrorCategory String?

  @@index([createdByAdminId, createdAt])
  @@index([temporaryCleanupState, temporaryCleanupNextAttemptAt])
}
```

`presignExpiresAt` is the exact signed PUT expiry and equals the new-session `expiresAt`. `temporaryCleanupState` has closed non-null values `pending | verified_deleted` when present; null is accepted only for legacy/non-terminal rows not yet classified by cutover. The error category is a closed redacted operational code, never provider text.

Assert `ImageUploadIdempotency` has:

```text
clientRequestId primary key
createdByAdminId
uploadId unique
requestFingerprint
terminalOutcome
resultImageId
resultDeletedAt
failureCode
terminalAt
resultRetentionExpiresAt
createdAt
archivedAt
```

Assert `ImageUploadPromotion` has:

```text
id primary key
uploadId unique
origin
albumId
finalizationLeaseToken
accountId
bucket
sourceObjectKey
sourceEtag
destinationObjectKey unique
inspectedSha256
inspectedByteSize
canonicalMime
inspectedWidth
inspectedHeight
policyVersion
committedResultImageId
copyState
disposition
copyDispatchedAt
copyResponseObservedAt
copyResponseEtag
providerSettlementObservedAt
providerEventId
providerEventObservedAt
settlementSource
providerObjectEtag
dispatchAttempts
lastDispatchAttemptAt
nextReconcileAt
firstDestinationAbsentAt
destinationAbsentVerifiedAt
dispatchRejectedAt
dispatchRejectionReason
dispatchRejectionObservedSourceEtag
reconcileAttempts
lastReconciledAt
createdAt
updatedAt
```

Assert exact `copyState` values `dispatched | provider_settled | dispatch_rejected`, exact disposition values `pending | committed | cleanup_required | verified_deleted | not_created`, and the coupled terminal pair `dispatch_rejected + not_created`. Assert indexes on `(createdByAdminId, createdAt)`, `(temporaryCleanupState, temporaryCleanupNextAttemptAt)`, `(copyState, nextReconcileAt)`, `(disposition, nextReconcileAt)`, and the partial unique provider-event index. Assert one `ImageUploadReconcilerHeartbeat` table keyed by `id=singleton` with owner/build fingerprints, lock-acquired time, heartbeat time, and six last-completed timestamps: Queue settlement, pending-session expiry, promotion recovery, temporary cleanup, image-object deletion, and rate-limit cleanup. Assert the existing `ImageObjectDeletion` model is extended with explicit `authority`, `objectKeyHash`, nullable `legacyImageSnapshotSha256`, and nullable `providerDisposition` fields. `authority` is `current_result | legacy_image | non_r2_deferred`; only the first two are R2 deletion authorities.

Assert `ImageUploadPromotionConflict` has exact columns and constraints from Task 2, including one row per `(promotionId, providerEventId)`, the complete immutable rejection snapshot, state `open | resolved`, resolution `confirmed_absent_ack | cleanup_authorized | committed_authorized`, and an index on `(state, openedAt)`. Assert `ImageUploadProviderEventQuarantine` derives `quarantineFingerprintSha256` as `SHA-256(JCS({ providerEventId }))` when a stable provider event ID exists, otherwise the exact relocation-stable fallback `SHA-256(JCS({ sourceQueueId, bodySha256 }))`; its provider-event ID and nullable stable `replayRequestId` are separately unique, malformed rows require null provider/envelope IDs while valid unmatched rows require both, state is `open | resolving | resolved`, resolution fields are closed, original evidence is append-only, replay identity fields are present, and `(state, lastObservedAt)` is indexed. Assert `ImageUploadProviderEventQuarantineLocation` has immutable source/DLQ observations, a unique observation hash, and `(quarantineId, observedAt)` index; the quarantine row's `latestLocationObservationSha256` is updated only after the corresponding history insert commits. Assert `ImageUploadProviderEventQuarantineAction` has immutable per-resolution-attempt/location `ack_requested | ack_succeeded | replay_publish_requested | replay_published` rows, a unique action hash, closed completed-action provider outcomes, real same-quarantine location linkage, and `(quarantineId, resolutionAttemptId, observedAt)` index. Assert `ImageUploadProviderEventQuarantineResolution` stores one immutable, canonically hashed completed snapshot per attempt and is the only authority that permits history-preserving `resolved -> open` after an unsuccessful replay. Assert `ImageUploadRateLimitEvent` has the exact admin/route/timestamp index and closed route-scope constraint used by Stage 04.

- [ ] **Step 2: Run the contract test and observe failure**

```powershell
npm run test:integration --workspace=backend -- image-upload-schema.integration-spec.ts
```

Expected: FAIL because the tables and columns are absent.

### Task 2: Add the additive migration

**Files:**

- Modify: `apps/backend/prisma/schema.prisma`
- Create: `apps/backend/prisma/migrations/20260719000100_image_upload_roll_forward/migration.sql`

- [ ] **Step 1: Add the Prisma models and fields**

Use the following model shape as the naming contract:

```prisma
model ImageUploadIdempotency {
  clientRequestId   String   @id
  createdByAdminId  String
  uploadId          String   @unique
  requestFingerprint String
  terminalOutcome   String?
  resultImageId     String?
  resultDeletedAt   DateTime?
  failureCode       String?
  terminalAt        DateTime?
  resultRetentionExpiresAt DateTime?
  createdAt         DateTime @default(now())
  archivedAt        DateTime?

  @@index([createdByAdminId, createdAt])
  @@index([createdAt])
}

model ImageUploadPromotion {
  id                           String   @id @default(uuid())
  uploadId                     String   @unique
  origin                       String
  albumId                      String
  finalizationLeaseToken       String
  accountId                    String
  bucket                       String
  sourceObjectKey              String
  sourceEtag                   String?
  destinationObjectKey         String   @unique
  inspectedSha256              String?
  inspectedByteSize            Int?
  canonicalMime                String?
  inspectedWidth               Int?
  inspectedHeight              Int?
  policyVersion                String?
  committedResultImageId       String?
  copyState                    String
  disposition                  String
  copyDispatchedAt                    DateTime?
  copyResponseObservedAt              DateTime?
  copyResponseEtag                    String?
  providerSettlementObservedAt        DateTime?
  providerEventId                     String?
  providerEventObservedAt             DateTime?
  settlementSource                    String?
  providerObjectEtag                  String?
  dispatchAttempts                    Int      @default(0)
  lastDispatchAttemptAt               DateTime?
  nextReconcileAt                     DateTime?
  firstDestinationAbsentAt            DateTime?
  destinationAbsentVerifiedAt         DateTime?
  dispatchRejectedAt                  DateTime?
  dispatchRejectionReason             String?
  dispatchRejectionObservedSourceEtag String?
  reconcileAttempts                   Int      @default(0)
  lastReconciledAt             DateTime?
  createdAt                    DateTime @default(now())
  updatedAt                    DateTime @updatedAt

  @@index([copyState, nextReconcileAt])
  @@index([disposition, nextReconcileAt])
  @@index([albumId, disposition])
}

model ImageUploadPromotionConflict {
  id                                     String   @id @default(uuid())
  promotionId                            String
  providerEventId                        String
  accountId                              String
  bucket                                 String
  sourceObjectKeyHash                    String
  destinationObjectKeyHash               String
  eventTime                              DateTime
  eventEnvelopeSha256                    String
  providerObjectEtag                     String
  rejectionDispatchRejectedAt            DateTime
  rejectionReason                        String
  rejectionObservedSourceEtag            String?
  rejectionFirstDestinationAbsentAt       DateTime
  rejectionDestinationAbsentVerifiedAt   DateTime
  rejectionEvidenceSha256                 String
  state                                  String
  resolution                  String?
  operatorIdentityFingerprint String?
  approvalDigest              String?
  observedDestinationEtag     String?
  openedAt                    DateTime @default(now())
  resolvedAt                  DateTime?
  finalAbsentVerifiedAt       DateTime?
  updatedAt                   DateTime @updatedAt

  @@unique([promotionId, providerEventId])
  @@index([state, openedAt])
}

model ImageUploadProviderEventQuarantine {
  id                              String   @id @default(uuid())
  providerEventId                 String?
  messageId                       String
  sourceQueueId                   String
  currentQueueId                  String
  latestLocationObservationSha256 String?
  leaseId                         String
  leaseDeadline                   DateTime
  attempts                        Int
  bodySha256                      String
  eventEnvelopeSha256             String?
  quarantineFingerprintSha256     String   @unique
  reason                          String
  firstObservedAt                 DateTime @default(now())
  lastObservedAt                  DateTime @default(now())
  state                           String
  resolutionAttemptId             String?
  latestResolutionAttemptId        String?
  latestResolutionEvidenceSha256  String?
  resolution                      String?
  resolutionStartedAt             DateTime?
  acknowledgedLocationCount       Int?
  resolutionScanCompletedAt       DateTime?
  operatorIdentityFingerprint     String?
  approvalDigest                  String?
  replayQueueId                   String?
  replayRequestId                 String?
  replayMessageId                 String?
  replayRequestedAt               DateTime?
  acknowledgedAt                  DateTime?
  resolvedAt                      DateTime?

  @@unique([providerEventId])
  @@unique([replayRequestId])
  @@index([state, lastObservedAt])
}

model ImageUploadProviderEventQuarantineLocation {
  id                        String   @id @default(uuid())
  quarantineId              String
  queueKind                 String
  queueId                   String
  messageId                 String
  replayRequestId           String?
  leaseId                   String
  leaseDeadline             DateTime
  attempts                  Int
  observedAt                DateTime @default(now())
  locationObservationSha256 String   @unique

  @@unique([quarantineId, locationObservationSha256])
  @@index([quarantineId, observedAt])
}

model ImageUploadProviderEventQuarantineAction {
  id                        String   @id @default(uuid())
  quarantineId              String
  resolutionAttemptId       String
  locationObservationSha256 String
  action                    String
  queueKind                 String
  queueId                   String
  messageId                 String
  replayRequestId           String?
  leaseId                   String
  actionEvidenceSha256      String
  providerOutcome            String?
  observedAt                DateTime @default(now())
  actionSha256              String   @unique

  @@index([quarantineId, resolutionAttemptId, observedAt])
}

model ImageUploadProviderEventQuarantineResolution {
  id                            String   @id
  quarantineId                  String
  resolution                    String
  operatorIdentityFingerprint   String
  approvalDigest                String
  resolutionStartedAt           DateTime
  acknowledgedLocationCount     Int
  resolutionScanCompletedAt     DateTime
  replayQueueId                 String?
  replayRequestId               String?
  replayMessageId               String?
  replayRequestedAt             DateTime?
  acknowledgedAt                DateTime
  resolvedAt                    DateTime
  resolutionEvidenceSha256      String   @unique

  @@unique([quarantineId, id])
  @@index([quarantineId, resolvedAt])
}

model ImageUploadRateLimitEvent {
  id               BigInt   @id @default(autoincrement())
  createdByAdminId String
  routeScope       String
  occurredAt       DateTime @default(now())

  @@index([createdByAdminId, routeScope, occurredAt])
  @@index([occurredAt])
}

model ImageUploadReconcilerHeartbeat {
  id                               String   @id
  ownerId                          String
  buildFingerprint                 String
  lockAcquiredAt                   DateTime
  heartbeatAt                      DateTime
  queueSettlementCompletedAt       DateTime?
  pendingSessionExpiryCompletedAt  DateTime?
  promotionRecoveryCompletedAt     DateTime?
  temporaryCleanupCompletedAt      DateTime?
  imageDeletionCompletedAt         DateTime?
  rateLimitCleanupCompletedAt      DateTime?
  updatedAt                        DateTime @updatedAt
}

// Extend the existing deletion ledger; do not create a second deletion table.
model ImageObjectDeletion {
  // existing fields remain unchanged
  authority                  String   @default("current_result")
  objectKeyHash              String?
  legacyImageSnapshotSha256  String?
  providerDisposition        String?
}
```

Do not add foreign keys from idempotency, promotion, promotion-conflict, quarantine, or rate-limit evidence to `ImageUpload` or `Image`; their evidence must survive live-row or result deletion. `sourceEtag` is nullable only for a committed `legacy_bridge` record whose existing Image and matching provider event provide keep authority; every current-generation promotion requires it. The conflict, quarantine, heartbeat, and legacy-image deletion-authority rows are operational evidence and contain no secret or full object key.

- [ ] **Step 2: Add database state constraints**

The SQL migration adds checks equivalent to. Runtime configuration cannot be referenced by a PostgreSQL CHECK constraint, so the database enforces no-earlier-than-expiry while the service and production verifier enforce `presignExpiresAt + IMAGE_UPLOAD_PRESIGN_CLOCK_SKEW_SECONDS`.

```sql
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
    ("providerEventId" IS NULL AND "providerEventObservedAt" IS NULL AND "settlementSource" IS NULL AND "providerObjectEtag" IS NULL) OR
    ("providerEventId" IS NOT NULL AND "providerEventObservedAt" IS NOT NULL AND "settlementSource" IS NOT NULL AND "providerObjectEtag" IS NOT NULL AND "copyState" = 'provider_settled')
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
ON "ImageUploadPromotion" ("settlementSource", "providerEventId")
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
  ADD COLUMN IF NOT EXISTS "authority" TEXT NOT NULL DEFAULT 'current_result',
  ADD COLUMN IF NOT EXISTS "objectKeyHash" TEXT,
  ADD COLUMN IF NOT EXISTS "legacyImageSnapshotSha256" TEXT,
  ADD COLUMN IF NOT EXISTS "providerDisposition" TEXT;

UPDATE "ImageObjectDeletion"
SET "authority" = 'non_r2_deferred', "providerDisposition" = COALESCE("providerDisposition", 'legacy_deferred')
WHERE provider <> 'r2' AND status = 'deferred';

ALTER TABLE "ImageObjectDeletion"
  ADD CONSTRAINT "ImageObjectDeletion_authority_check"
  CHECK ("authority" IN ('current_result', 'legacy_image', 'non_r2_deferred')),
  ADD CONSTRAINT "ImageObjectDeletion_provider_disposition_check"
  CHECK ("providerDisposition" IS NULL OR "providerDisposition" IN ('legacy_deferred', 'not_applicable')),
  ADD CONSTRAINT "ImageObjectDeletion_authority_evidence_check"
  CHECK (
    ("authority" = 'current_result' AND "legacyImageSnapshotSha256" IS NULL AND "providerDisposition" IS NULL) OR
    ("authority" = 'legacy_image' AND "legacyImageSnapshotSha256" IS NOT NULL AND "providerDisposition" IS NULL) OR
    ("authority" = 'non_r2_deferred' AND "providerDisposition" IS NOT NULL)
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
    ("action" = 'replay_publish_requested' AND "replayRequestId" IS NOT NULL AND "providerOutcome" IS NULL) OR
    ("action" = 'ack_succeeded' AND "providerOutcome" IN ('acknowledged', 'already_absent')) OR
    ("action" = 'replay_published' AND "replayRequestId" IS NOT NULL AND "providerOutcome" IN ('published', 'adopted_after_uncertain_publish'))
  ),
  ADD CONSTRAINT "ImageUploadProviderEventQuarantineAction_location_check"
  CHECK ("locationObservationSha256" IS NOT NULL);

ALTER TABLE "ImageUploadProviderEventQuarantineLocation"
  ADD CONSTRAINT "ImageUploadProviderEventQuarantineLocation_quarantine_fk"
  FOREIGN KEY ("quarantineId") REFERENCES "ImageUploadProviderEventQuarantine"("id") ON DELETE RESTRICT;

ALTER TABLE "ImageUploadProviderEventQuarantineAction"
  ADD CONSTRAINT "ImageUploadProviderEventQuarantineAction_location_fk"
  FOREIGN KEY ("quarantineId", "locationObservationSha256")
  REFERENCES "ImageUploadProviderEventQuarantineLocation"("quarantineId", "locationObservationSha256") ON DELETE RESTRICT;

ALTER TABLE "ImageUploadProviderEventQuarantineResolution"
  ADD CONSTRAINT "ImageUploadProviderEventQuarantineResolution_quarantine_fk"
  FOREIGN KEY ("quarantineId") REFERENCES "ImageUploadProviderEventQuarantine"("id") ON DELETE RESTRICT;

ALTER TABLE "ImageUploadProviderEventQuarantineResolution"
  ADD CONSTRAINT "ImageUploadProviderEventQuarantineResolution_resolution_check"
  CHECK (
    ("resolution" = 'quarantined_ack' AND "replayQueueId" IS NULL AND "replayRequestId" IS NULL AND "replayMessageId" IS NULL AND "replayRequestedAt" IS NULL) OR
    ("resolution" = 'replay_requested' AND "replayQueueId" IS NOT NULL AND "replayRequestId" IS NOT NULL AND "replayMessageId" IS NOT NULL AND "replayRequestedAt" IS NOT NULL AND "resolutionStartedAt" <= "replayRequestedAt" AND "replayRequestedAt" <= "resolutionScanCompletedAt")
  ),
  ADD CONSTRAINT "ImageUploadProviderEventQuarantineResolution_count_check"
  CHECK ("acknowledgedLocationCount" >= 0),
  ADD CONSTRAINT "ImageUploadProviderEventQuarantineResolution_time_order_check"
  CHECK (
    "resolutionStartedAt" <= "resolutionScanCompletedAt" AND
    "resolutionScanCompletedAt" <= "acknowledgedAt" AND
    "acknowledgedAt" <= "resolvedAt" AND
    ("replayRequestedAt" IS NULL OR ("resolutionStartedAt" <= "replayRequestedAt" AND "replayRequestedAt" <= "acknowledgedAt"))
  );

ALTER TABLE "ImageUploadProviderEventQuarantine"
  ADD CONSTRAINT "ImageUploadProviderEventQuarantine_state_check"
  CHECK ("state" IN ('open', 'resolving', 'resolved')),
  ADD CONSTRAINT "ImageUploadProviderEventQuarantine_reason_check"
  CHECK ("reason" IN ('malformed_event', 'unmatched_event')),
  ADD CONSTRAINT "ImageUploadProviderEventQuarantine_envelope_evidence_check"
  CHECK (
    ("reason" = 'malformed_event' AND "eventEnvelopeSha256" IS NULL AND "providerEventId" IS NULL) OR
    ("reason" = 'unmatched_event' AND "eventEnvelopeSha256" IS NOT NULL AND "providerEventId" IS NOT NULL)
  ),
  ADD CONSTRAINT "ImageUploadProviderEventQuarantine_resolution_check"
  CHECK (
    (
      "state" = 'open'
      AND "resolutionAttemptId" IS NULL
      AND "resolution" IS NULL
      AND "resolutionStartedAt" IS NULL
      AND "acknowledgedLocationCount" IS NULL
      AND "resolutionScanCompletedAt" IS NULL
      AND "operatorIdentityFingerprint" IS NULL
      AND "approvalDigest" IS NULL
      AND "replayQueueId" IS NULL
      AND "replayRequestId" IS NULL
      AND "replayMessageId" IS NULL
      AND "replayRequestedAt" IS NULL
      AND "acknowledgedAt" IS NULL
      AND "resolvedAt" IS NULL
    ) OR (
      "state" = 'resolving'
      AND "resolutionAttemptId" IS NOT NULL
      AND "resolution" IN ('quarantined_ack', 'replay_requested')
      AND "resolutionStartedAt" IS NOT NULL
      AND "operatorIdentityFingerprint" IS NOT NULL
      AND "approvalDigest" IS NOT NULL
      AND "acknowledgedAt" IS NULL
      AND "resolvedAt" IS NULL
    ) OR (
      "state" = 'resolved'
      AND "resolutionAttemptId" IS NOT NULL
      AND "latestResolutionAttemptId" = "resolutionAttemptId"
      AND "latestResolutionEvidenceSha256" IS NOT NULL
      AND "resolution" = 'quarantined_ack'
      AND "resolutionStartedAt" IS NOT NULL
      AND "acknowledgedLocationCount" >= 0
      AND "resolutionScanCompletedAt" IS NOT NULL
      AND "operatorIdentityFingerprint" IS NOT NULL
      AND "approvalDigest" IS NOT NULL
      AND "replayQueueId" IS NULL
      AND "replayRequestId" IS NULL
      AND "replayMessageId" IS NULL
      AND "replayRequestedAt" IS NULL
      AND "acknowledgedAt" IS NOT NULL
      AND "resolvedAt" IS NOT NULL
    ) OR (
      "state" = 'resolved'
      AND "resolutionAttemptId" IS NOT NULL
      AND "latestResolutionAttemptId" = "resolutionAttemptId"
      AND "latestResolutionEvidenceSha256" IS NOT NULL
      AND "resolution" = 'replay_requested'
      AND "resolutionStartedAt" IS NOT NULL
      AND "acknowledgedLocationCount" >= 0
      AND "resolutionScanCompletedAt" IS NOT NULL
      AND "operatorIdentityFingerprint" IS NOT NULL
      AND "approvalDigest" IS NOT NULL
      AND "replayQueueId" IS NOT NULL
      AND "replayRequestId" IS NOT NULL
      AND "replayMessageId" IS NOT NULL
      AND "replayRequestedAt" IS NOT NULL
      AND "resolutionStartedAt" <= "replayRequestedAt"
      AND "replayRequestedAt" <= "resolutionScanCompletedAt"
      AND "acknowledgedAt" IS NOT NULL
      AND "resolvedAt" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "ImageUploadProviderEventQuarantine_attempts_check"
  CHECK ("attempts" >= 1),
  ADD CONSTRAINT "ImageUploadProviderEventQuarantine_latest_resolution_fk"
  FOREIGN KEY ("id", "latestResolutionAttemptId") REFERENCES "ImageUploadProviderEventQuarantineResolution"("quarantineId", "id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "ImageUploadPromotionConflict"
  ADD CONSTRAINT "ImageUploadPromotionConflict_state_check"
  CHECK ("state" IN ('open', 'resolved')),
  ADD CONSTRAINT "ImageUploadPromotionConflict_rejection_snapshot_check"
  CHECK (
    "rejectionReason" IN ('source_missing', 'source_etag_mismatch') AND
    "rejectionDestinationAbsentVerifiedAt" > "rejectionFirstDestinationAbsentAt" AND
    "rejectionDispatchRejectedAt" >= "rejectionDestinationAbsentVerifiedAt" AND
    (
      ("rejectionReason" = 'source_missing' AND "rejectionObservedSourceEtag" IS NULL) OR
      ("rejectionReason" = 'source_etag_mismatch' AND "rejectionObservedSourceEtag" IS NOT NULL)
    )
  ),
  ADD CONSTRAINT "ImageUploadPromotionConflict_resolution_check"
  CHECK (
    ("state" = 'open' AND "resolution" IS NULL AND "resolvedAt" IS NULL) OR
    ("state" = 'resolved' AND "resolution" IN ('confirmed_absent_ack', 'cleanup_authorized', 'committed_authorized') AND "resolvedAt" IS NOT NULL AND "operatorIdentityFingerprint" IS NOT NULL AND "approvalDigest" IS NOT NULL)
  );
```

Application validation additionally enforces:

- every stored ETag is canonical, unquoted, non-weak, and not case-folded; a null source ETag is accepted only for a provider-settled committed legacy bridge with exact Image/event keep authority;
- provider settlement is proven by a complete CopyObject-response branch or a complete Queue-event branch; event fields may stay null after response-only settlement, and both canonical ETags must match when both branches exist;
- every new session persists `presignExpiresAt=expiresAt`; the one-shot cutover apply may backfill a legacy row with the receipt's conservative outstanding-PUT deadline; every terminal session atomically sets `temporaryCleanupState=pending`, and only a final absent HEAD after that expiry plus clock skew may set `verified_deleted`; a terminal row with null `presignExpiresAt` is critical and cannot close cleanup;
- every current promotion is inserted with `copyDispatchedAt=lastDispatchAttemptAt=now`, `dispatchAttempts=1`, and `nextReconcileAt=now+eventGrace` in the same transaction as its inspected facts; a due scan explicitly uses `nextReconcileAt <= now` and rejects a current row with null scheduling facts;
- every `legacy_bridge.finalizationLeaseToken` is UUIDv5 namespace `16e0d6a7-6c39-5dc9-bc41-24f847e2f36a` over `receiptSha256 + ":" + uploadId`, so audit/apply restart derives the same non-secret token;
- `dispatch_rejected + not_created` requires two destination-absence observations at least one configured Queue visibility timeout apart, no provider event through the second observation, a missing or mismatched source, no Image reference, and zero canonical R2 mutation;
- a newly `committed` promotion has an exact Image ID/key match;
- an unmatched/malformed provider event creates/reuses one append-only `ImageUploadProviderEventQuarantine` row whose fingerprint is `SHA-256(JCS({ providerEventId }))` for stable IDs or exactly `SHA-256(JCS({ sourceQueueId, bodySha256 }))` otherwise; malformed rows have `reason=malformed_event`, null provider/event-envelope IDs, and unmatched valid rows have `reason=unmatched_event` with both IDs present; ephemeral message/lease IDs never enter identity, duplicate bodies share the quarantine but retain separate location/action histories, and replay uses a separately unique stable `replayRequestId` envelope; only the cutover-only quarantine CLI may resolve it;
- non-deferrable `ON DELETE RESTRICT` foreign keys prevent quarantine location/action/resolution evidence from being orphaned, while the circular latest-resolution pointer uses deferrable `ON DELETE NO ACTION` (equivalent protection at commit), the composite action/location key binds every action to a real same-quarantine observation, and the deferred latest-resolution pointer can reference only an existing immutable snapshot; ACK/replay-completion actions must match the location's stable replay request ID (including null), `ack_requested` precedes matching `ack_succeeded`, completed actions carry only the closed provider outcomes, orphan success actions are rejected, and the resolution snapshot fields/hash exactly match the current attempt and its immutable resolution row;
- quarantine/conflict resolution uses the singleton advisory lock, waits one full Queue visibility timeout after taking it, and aborts on lock loss; a replay that reopens a quarantine retires its old replay ID so the next attempt ACKs it or replaces it with a new stable replay ID;
- a committed result may later have no Image only when the permanent idempotency row has the same result ID plus `resultDeletedAt` and a matching durable `ImageObjectDeletion`;
- `cleanup_required` has no matching Image and was never committed;
- `verified_deleted` follows provider settlement plus a final absent HEAD;
- before any `committed_authorized` repair clears rejection fields on the promotion, the same transaction inserts the complete conflict rejection snapshot and `rejectionEvidenceSha256`, defined as the canonical SHA-256 of that complete immutable snapshot; every read/repair recomputes that hash from the immutable snapshot fields and rejects drift; the snapshot is immutable afterward;
- rate-limit admission takes a PostgreSQL transaction-scoped advisory lock over `(adminId, routeScope)`, counts events within the exact rolling window, inserts the current attempt atomically when below limit, and computes `retryAfter` from the oldest in-window event; the reconciler owns bounded deletion of events older than ten minutes and records cleanup progress; events older than ten minutes are cleanup-only operational data;
- `terminalAt` and `resultRetentionExpiresAt=terminalAt+30 days` are written together for terminal idempotency outcomes.

- [ ] **Step 3: Validate and format the schema**

```powershell
npx prisma format --schema apps/backend/prisma/schema.prisma
npx prisma validate --schema apps/backend/prisma/schema.prisma
```

Expected: both commands exit 0.

### Task 3: Verify empty and upgrade migrations

**Files:**

- Modify: `apps/backend/test/image-upload-schema.integration-spec.ts`

- [ ] **Step 1: Test an empty database**

Run `prisma migrate deploy` against a fresh Testcontainers PostgreSQL database and assert every model, constraint, and index exists.

- [ ] **Step 2: Test upgrade with representative current rows**

Before migration insert representative `pending`, `finalizing`, `consumed`, and `failed` `ImageUpload` rows plus referenced `Image` rows. Apply the migration and assert:

- existing images and keys are unchanged;
- all existing upload rows remain readable;
- nullable new live-session fields are null and `temporaryCleanupAttempts` has the compatible default zero;
- no promotion or idempotency row is invented by the schema migration;
- the singleton heartbeat table exists but has no row until the new reconciler starts, and exposes all six loop-completion timestamps;
- the rate-limit event table starts empty and its route/index constraints are present;
- the quarantine location/action/completed-resolution history tables exist, start empty, and no source/DLQ observation, ACK/replay outcome, or completed resolution is invented by migration; integration tests prove `ON DELETE RESTRICT` blocks parent/history deletion, action insertion without the exact same-quarantine location fails, and a latest-resolution pointer cannot target another quarantine's snapshot;
- representative existing `ImageObjectDeletion(provider='cloudflare_legacy', status='deferred')` rows migrate to `authority='non_r2_deferred'` with non-null `providerDisposition` without becoming unresolved R2 deletion work;
- current R2 deletion rows receive `authority='current_result'` and a canonical `objectKeyHash`; existing non-R2 deferred rows are updated before constraints to `authority='non_r2_deferred'` plus `providerDisposition='legacy_deferred'`; a legacy R2 Image deletion may use `authority='legacy_image'` only with an immutable snapshot hash over exact image ID, provider, and object-key hash;
- no old application binary is executed.

- [ ] **Step 3: Run migration integration tests**

```powershell
npm run test:integration --workspace=backend -- image-upload-schema.integration-spec.ts
```

Expected: empty deploy and upgrade cases PASS.

### Task 4: Add promotion repository invariants

**Files:**

- Create: `apps/backend/src/images/image-upload-promotion.repository.ts`
- Create: `apps/backend/src/images/image-upload-promotion.repository.spec.ts`
- Modify: `apps/backend/src/images/images.module.ts`

- [ ] **Step 1: Write failing transactional invariant tests**

Cover:

- exactly one promotion per upload;
- a current row contains every inspected fact and a canonical source ETag, is created with `copyState=dispatched`, `copyDispatchedAt=lastDispatchAttemptAt=now`, `dispatchAttempts=1`, and `nextReconcileAt=now+eventGrace`, and commits before the mocked CopyObject call is allowed to start;
- a current row with any missing inspected or scheduling fact is rejected;
- the due query includes a crash-before-HTTP current row exactly at `nextReconcileAt` and never silently excludes null scheduling data;
- source-condition rejection cannot be recorded after only one absent destination HEAD, before one visibility timeout, while a matching event/Image exists, or while source still matches;
- a fully evidenced rejection atomically writes `copyState=dispatch_rejected`, `disposition=not_created`, failure `upload_dispatch_rejected`, and releases the reservation without DeleteObject;
- a different lease token cannot reuse or mutate the promotion;
- an exact successful CopyObject response records `copyResponseObservedAt/copyResponseEtag`, changes `copyState` to `provider_settled`, and can commit without waiting for an event;
- provider event identity is idempotent; a later exact event attaches its separate fields to response-settled state and re-enters the matrix;
- `recordProviderSettlement` refuses `dispatch_rejected + not_created` without changing rejection or provider fields, creates/reuses one open conflict containing the complete rejection snapshot plus event/account/bucket/key evidence, recomputes the canonical snapshot hash, and lets the Queue message retry to DLQ;
- unmatched/malformed events create/reuse quarantine evidence without a promotion using `SHA-256(JCS({ providerEventId }))` for stable IDs or `SHA-256(JCS({ sourceQueueId, bodySha256 }))` otherwise, never authorize deletion, and duplicate same-body messages cannot resolve until every current source/DLQ lease has a same-attempt committed `ack_succeeded` action and exhaustive zero-match rescan; replay uses a committed publish intent and deterministic adoption after crash rather than claiming cross-system exactly-once, and a still-invalid replay reopens only after the prior completed resolution snapshot/hash is preserved;
- a duplicate provider event re-reads the current state instead of implying committed;
- newly `committed` requires an Image ID/reference to the exact destination;
- committed remains valid after legitimate result deletion only with matching idempotency and `ImageObjectDeletion` tombstones;
- `cleanup_required` rejects any Image reference or prior committed result;
- `committed` can never transition to `cleanup_required`;
- `verified_deleted` requires provider settlement.

- [ ] **Step 2: Run the focused tests and observe failure**

```powershell
npm test --workspace=backend -- image-upload-promotion.repository.spec.ts --runInBand
```

Expected: FAIL because the repository does not exist.

- [ ] **Step 3: Implement explicit CAS repository methods**

Expose only:

```ts
createDispatchedPromotion(input: CreateDispatchedPromotionInput): Promise<PromotionRecord>;
settleCopyResponseAndCommit(input: CopyResponseCommitInput): Promise<PromotionRecord>;
recordProviderSettlement(input: ProviderSettlementInput): Promise<PromotionRecord>;
openLateEventConflict(input: LateEventConflictInput): Promise<PromotionConflictRecord>;
resolveLateEventConflict(input: ResolveLateEventConflictInput): Promise<PromotionConflictRecord>;
openProviderEventQuarantine(
    input: OpenProviderEventQuarantineInput,
): Promise<ProviderEventQuarantineRecord>;
beginProviderEventQuarantineResolution(
    input: BeginProviderEventQuarantineResolutionInput,
): Promise<ProviderEventQuarantineRecord>;
finalizeProviderEventQuarantineResolution(
    input: FinalizeProviderEventQuarantineResolutionInput,
): Promise<ProviderEventQuarantineRecord>;
reopenProviderEventQuarantineAfterReplay(
    input: ReopenProviderEventQuarantineAfterReplayInput,
): Promise<ProviderEventQuarantineRecord>;
markCommitted(input: CommitPromotionInput): Promise<boolean>;
requireCleanup(input: CleanupAuthorityInput): Promise<boolean>;
markVerifiedDeleted(input: VerifiedDeletionInput): Promise<boolean>;
markDispatchRejectedNotCreated(
    input: DispatchRejectedNotCreatedInput,
): Promise<boolean>;
```

Every mutation includes the expected current state and lease/event identity in its `WHERE` clause. Replay envelopes are accepted only when `replayRequestId`, source Queue ID, quarantine fingerprint, original body SHA-256, and base64 payload all verify against the durable quarantine; their ephemeral message IDs remain location evidence only. `settleCopyResponseAndCommit` is one serializable transaction spanning Image creation, album count, upload/idempotency terminal state, temporary-cleanup scheduling, promotion response settlement, and committed disposition; it accepts either `dispatched` or an already event-settled row only when the canonical response/event ETags and lease match, and it never exposes an intermediate `committed + dispatched` state or invents Queue-event fields. `markDispatchRejectedNotCreated` additionally compares both absence timestamps, the configured visibility timeout, response/event absence, source observation, and no-Image authority inside the transaction. Conflict resolution preserves the complete immutable rejection snapshot and its canonical hash in `ImageUploadPromotionConflict`; a `committed_authorized` repair may clear promotion rejection fields and change promotion state only in the same transaction that first commits that snapshot. Quarantine creation hashes the raw body and, when parseable, the canonical envelope; its fingerprint is `SHA-256(JCS({ providerEventId }))` for stable IDs or exactly `SHA-256(JCS({ sourceQueueId, bodySha256 }))` otherwise. `beginProviderEventQuarantineResolution` CASes `open -> resolving`, stores the closed resolution/operator approval, and commits before Queue ACK or replay. `finalizeProviderEventQuarantineResolution` may CAS `resolving -> resolved` only after same-attempt append-only location/action history proves every matching current source/DLQ lease reached `ack_succeeded`, both scans exhausted with zero non-replay match, and any requested replay has one committed publish intent plus exactly one adopted/published replay identity; the same transaction inserts immutable `ImageUploadProviderEventQuarantineResolution` evidence and updates `latestResolutionEvidenceSha256`. `reopenProviderEventQuarantineAfterReplay` verifies that snapshot/hash, CASes only `resolved + replay_requested -> open`, clears only working-resolution fields, and preserves all prior history. If a publish result is uncertain, the resolver adopts one current matching message and ACKs all others; it never claims cross-system exactly-once. Legacy-image deletion authority snapshots exact image ID, provider, and object-key hash; it never fabricates upload, promotion, or idempotency authority. Conflict resolution permits ACK only after its exact resolution transaction and any required final absent HEAD commit. A zero-count update re-reads and returns the winner; it never assumes success.

- [ ] **Step 4: Verify repository tests**

```powershell
npm test --workspace=backend -- image-upload-promotion.repository.spec.ts --runInBand
```

Expected: all CAS and state-invariant tests PASS.

### Task 5: Stage gate and commit

- [ ] **Step 1: Run backend schema checks**

```powershell
npm test --workspace=backend -- image-upload-promotion.repository.spec.ts --runInBand
npm run test:integration --workspace=backend -- image-upload-schema.integration-spec.ts
npm run build --workspace=backend
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Commit**

```powershell
git add apps/backend/prisma apps/backend/src/images apps/backend/test
git commit -m "feat(images): add durable promotion foundation"
```
