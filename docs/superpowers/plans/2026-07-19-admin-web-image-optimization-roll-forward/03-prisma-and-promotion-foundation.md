# Prisma and Promotion Foundation Implementation Plan

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

Assert `Image.fileSizeBytes` and these nullable/additive `ImageUpload` fields:

```ts
const uploadFields = [
    'clientRequestId',
    'createdByAdminId',
    'policyVersion',
    'policySnapshot',
    'processedSha256',
    'finalizationLeaseToken',
    'resultImageId',
    'resultDeletedAt',
    'terminalAt',
    'resultRetentionExpiresAt',
    'failureCode',
];
```

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
providerSettlementObservedAt
providerEventId
settlementSource
providerObjectEtag
dispatchAttempts
lastDispatchAttemptAt
nextReconcileAt
reconcileAttempts
lastReconciledAt
createdAt
updatedAt
```

Assert indexes on `(createdByAdminId, createdAt)`, `(copyState, nextReconcileAt)`, `(disposition, nextReconcileAt)`, and the partial unique provider-event index. Assert one `ImageUploadReconcilerHeartbeat` table keyed by `id=singleton` with owner/build fingerprints, lock-acquired time, heartbeat time, and last-completed timestamps for Queue settlement, promotion recovery, temporary cleanup, and image-object deletion.

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
  copyDispatchedAt             DateTime?
  providerSettlementObservedAt DateTime?
  providerEventId              String?
  settlementSource             String?
  providerObjectEtag           String?
  dispatchAttempts             Int      @default(0)
  lastDispatchAttemptAt        DateTime?
  nextReconcileAt              DateTime?
  reconcileAttempts            Int      @default(0)
  lastReconciledAt             DateTime?
  createdAt                    DateTime @default(now())
  updatedAt                    DateTime @updatedAt

  @@index([copyState, nextReconcileAt])
  @@index([disposition, nextReconcileAt])
  @@index([albumId, disposition])
}

model ImageUploadReconcilerHeartbeat {
  id                           String   @id
  ownerId                      String
  buildFingerprint             String
  lockAcquiredAt               DateTime
  heartbeatAt                  DateTime
  queueSettlementCompletedAt   DateTime?
  promotionRecoveryCompletedAt DateTime?
  temporaryCleanupCompletedAt  DateTime?
  imageDeletionCompletedAt     DateTime?
  updatedAt                    DateTime @updatedAt
}
```

Do not add foreign keys from idempotency or promotion rows to `ImageUpload` or `Image`; their evidence must survive live-row or result deletion. `sourceEtag` is nullable only for a committed `legacy_bridge` record whose existing Image and matching provider event provide keep authority; every current-generation promotion requires it. The heartbeat row is operational state and contains no secret or object key.

- [ ] **Step 2: Add database state constraints**

The SQL migration adds checks equivalent to:

```sql
ALTER TABLE "ImageUploadPromotion"
  ADD CONSTRAINT "ImageUploadPromotion_origin_check"
  CHECK ("origin" IN ('current', 'legacy_bridge')),
  ADD CONSTRAINT "ImageUploadPromotion_copyState_check"
  CHECK ("copyState" IN ('dispatched', 'provider_settled')),
  ADD CONSTRAINT "ImageUploadPromotion_disposition_check"
  CHECK ("disposition" IN ('pending', 'committed', 'cleanup_required', 'verified_deleted')),
  ADD CONSTRAINT "ImageUploadPromotion_current_facts_check"
  CHECK (
    "origin" <> 'current' OR (
      "sourceEtag" IS NOT NULL AND
      "inspectedSha256" IS NOT NULL AND
      "inspectedByteSize" IS NOT NULL AND
      "canonicalMime" IS NOT NULL AND
      "inspectedWidth" IS NOT NULL AND
      "inspectedHeight" IS NOT NULL AND
      "policyVersion" IS NOT NULL
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
      "providerEventId" IS NOT NULL AND
      "settlementSource" IS NOT NULL AND
      "providerObjectEtag" IS NOT NULL
    )
  );

CREATE UNIQUE INDEX "ImageUploadPromotion_settlement_event_key"
ON "ImageUploadPromotion" ("settlementSource", "providerEventId")
WHERE "settlementSource" IS NOT NULL AND "providerEventId" IS NOT NULL;
```

Application validation additionally enforces:

- every stored ETag is canonical, unquoted, non-weak, and not case-folded; a null source ETag is accepted only for a provider-settled committed legacy bridge with exact Image/event keep authority;
- a newly `committed` promotion has an exact Image ID/key match;
- a committed result may later have no Image only when the permanent idempotency row has the same result ID plus `resultDeletedAt` and a matching durable `ImageObjectDeletion`;
- `cleanup_required` has no matching Image and was never committed;
- `verified_deleted` follows provider settlement plus a final absent HEAD;
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
- new live-session fields are null;
- no promotion or idempotency row is invented by the schema migration;
- the singleton heartbeat table exists but has no row until the new reconciler starts;
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
- a current row contains every inspected fact and a canonical source ETag, is created with `copyState=dispatched`, and commits before the mocked CopyObject call is allowed to start;
- a current row with any missing inspected fact is rejected;
- a different lease token cannot reuse or mutate the promotion;
- provider event identity is idempotent;
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
recordProviderSettlement(input: ProviderSettlementInput): Promise<PromotionRecord>;
markCommitted(input: CommitPromotionInput): Promise<boolean>;
requireCleanup(input: CleanupAuthorityInput): Promise<boolean>;
markVerifiedDeleted(input: VerifiedDeletionInput): Promise<boolean>;
```

Every mutation includes the expected current state and lease/event identity in its `WHERE` clause. A zero-count update re-reads and returns the winner; it never assumes success.

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
