# Production Cold Cutover and Roll-Forward Implementation Plan

> **Free-compatible amendment:** Execute Task A5 and Task A6 in `free-compatible-polling-amendment.md`. Queue/DLQ/event-rule/event-receipt gates below are historical and superseded; production acceptance uses response/HEAD settlement and two polling snapshots separated by 30 seconds.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old upload generation during a bounded maintenance window, reconcile retained legacy rows through exact database/R2 HEAD evidence, start only the new API/reconciler, and recover from incidents by roll-forward.

**Architecture:** Old API/jobs are fully quiesced, an R2-read-only legacy audit binds the authoritative backup and protected row dispositions, migration runs, and a one-shot polling-compatible bridge safely disposes retained old sessions while ingress remains closed. No provider event, Queue, or DLQ is used, and no old binary starts after migration.

**Tech Stack:** PostgreSQL, Docker Compose/Dokploy, Cloudflare R2, imgproxy, GitHub rulesets, PowerShell, Playwright.

---

### Task 1: Implement and test the one-shot cutover bridge

> **Current polling completion:** Task A5 Steps 1–3 in `free-compatible-polling-amendment.md` replace this task's mixed Queue/event wording. The Queue-era checkboxes below remain unchecked as historical text; current completion evidence is recorded only on the replacement checklist.

**Files:**

- Create: `apps/backend/src/scripts/image-upload-cutover.ts`
- Create: `apps/backend/src/scripts/image-upload-cutover.spec.ts`
- Create: `apps/backend/src/images/image-upload-cutover.service.ts`
- Create: `apps/backend/src/images/image-upload-cutover.service.spec.ts`
- Create: `apps/backend/test/image-upload-cutover.integration-spec.ts`
- Modify: `apps/backend/package.json`
- Modify: `apps/backend/Dockerfile`

- [ ] **Step 1: Write failing retained-row classification tests**

With API ingress disabled, cover the pre-migration audit and post-migration apply modes in separate exact-schema fixtures:

- against the exact pre-migration schema, a row with no source ETag, no finalization or consumption evidence, no existing destination, no matching CopyObject event, and no `Image` reference is classified as proven pre-dispatch without changing the row or deleting an object; after migration, apply revalidates it, atomically writes `failed/upload_cutover_aborted`, creates no promotion, deletes only its temporary key through the bounded idempotent cleanup path, and requires a final absent HEAD;
- an exact existing `Image.id/r2ObjectKey` match is committed keep authority and is never deleted; create an `origin=legacy_bridge`, `disposition=committed` row plus compact internal idempotency evidence only when exact dispatch/event evidence also exists—otherwise preserve the Image without inventing a promotion; every created bridge uses `finalizationLeaseToken=UUIDv5('16e0d6a7-6c39-5dc9-bc41-24f847e2f36a', receiptSha256 + ':' + uploadId)`;
- `sourceEtag` may be null only for that committed legacy bridge when the existing Image plus a matching provider event prove keep authority; a current or cleanup-authorized promotion with null `sourceEtag` is rejected;
- `disposition` writes a separate protected, signed row-level decision file for one legacy candidate row, recording source/destination evidence hashes, canonical case-preserving ETag/event hashes, and either committed Image authority or cleanup authority before audit can clear it or a `legacy_bridge` is created;
- audit accepts only explicit disposition paths, revalidates each against current evidence, rejects duplicate/cross-row decisions, and never treats whole-receipt `approve` as a row disposition;
- any source ETag, finalization/consumption evidence, existing destination HEAD, or Queue event without complete exact linkage is `legacy_ambiguous`; one ambiguous row blocks migration and no object is deleted;
- a retained `consumed` row without its exact Image is ambiguous, not automatically committed;
- destination ETag/source-key mismatch is ambiguous, causes no delete, and exits nonzero;
- unmatched or malformed event is retried/DLQed, causes no delete, and exits nonzero;
- an audit-observed event may cross `max_retries`; the receipt tracks stable event ID, ephemeral message ID, attempts, lease deadline, and source/DLQ location, and apply finds it in either Queue and ACKs only a fresh current lease after commit;
- a duplicate event reuses evidence and re-enters the current bridge state rather than implying committed;
- apply backfills every retained legacy terminal row's `presignExpiresAt` from the verified conservative outstanding-PUT deadline, atomically enters `temporaryCleanupState=pending`, and cannot mark cleanup verified before that deadline plus skew;
- restart after a pre-dispatch `failed/upload_cutover_aborted` commit but before temporary-key cleanup resumes final absent-HEAD verification, and restart after database commit before Queue ACK is idempotent;
- audit refuses a missing/stale/mismatched quiesced-backup receipt or approval and embeds their canonical paths plus ciphertext/approval digests in its own receipt;
- the tamper-evident operator receipt contains server IDs, classifications, counts, evidence hashes, disposition-file digests, backup binding, and decisions only—never full keys, ETags, or secrets; receipt and distinct approval paths are outside the repository, permission-protected, canonical-JSON hashed, and any digest/signer/path/ACL drift fails audit/apply.

- [ ] **Step 2: Run focused tests and observe failure**

```powershell
npm test --workspace=backend -- image-upload-cutover.service.spec.ts --runInBand
npm run test:integration --workspace=backend -- image-upload-cutover.integration-spec.ts
```

Expected: FAIL because the cutover role and bridge do not exist.

- [ ] **Step 3: Implement the cutover role**

Register:

```json
{
    "images:uploads:cutover": "node /app/dist/scripts/image-upload-cutover.js"
}
```

The command requires:

```text
IMAGE_UPLOAD_PROCESS_ROLE=cutover
IMAGE_UPLOAD_PRESIGN_ENABLED=false
audit: explicit absolute output receipt plus quiesced-backup receipt/approval paths and zero-or-more explicit disposition paths
approve/apply: distinct absolute receipt and approval paths
disposition: audit receipt, upload ID, closed decision, evidence receipt, output path, and operator fingerprint
exact Queue/DLQ/consumer/rule identities
cutover-only R2 credentials, `IMAGE_UPLOAD_CUTOVER_QUEUE_TOKEN`, and `IMAGE_UPLOAD_OPERATOR_TOKEN`
```

It refuses to run while any API health endpoint reports presign enabled, any old/new upload writer is live, or the receipt points inside the repository.

- [ ] **Step 4: Implement bounded bridge reconciliation**

Run `images:uploads:cutover audit --receipt <absolute-path> --backup-receipt <absolute-path> --backup-approval <distinct-absolute-path> [--disposition <absolute-path>...]` before migration. Audit verifies backup ACL, approval, restore evidence, and ciphertext digest before reading legacy state, embeds that exact binding, creates only the permission-protected receipt, and prints its canonical JSON SHA-256; it never creates its own operator approval. For an ambiguous row, the authenticated operator first runs `images:uploads:cutover disposition --audit-receipt <path> --upload-id <uuid> --decision committed_authorized|cleanup_authorized --evidence-receipt <path> --output <path> --operator-fingerprint <hash>`; audit reruns with each explicit `--disposition` path and keeps ambiguity nonzero if evidence drifts. Only after a zero-ambiguity receipt is independently reviewed does the operator run `images:uploads:cutover approve --receipt <absolute-path> --approval <distinct-absolute-path>` to write the separately protected signer/approval/digest record without database or R2 mutation. Audit uses parameterized raw SQL or an equally explicit legacy-only projection containing exactly the columns present before this feature migration; it must not issue a Prisma model read that implicitly selects new columns or touch `ImageUploadIdempotency`, `ImageUploadPromotion`, or the new `ImageObjectDeletion` shape. It reads every retained row, exact Image references, destination HEAD results, and captured Queue events; it records attempts/current source-or-DLQ location and retries rather than ACKs audit-pulled messages, searches both Queues on rerun, writes the tamper-evident receipt outside the repository, and exits nonzero unless `legacyAmbiguousCount=0`. Audit performs no database write and no R2 PUT/COPY/DELETE. Proven pre-dispatch rows are only classified in the receipt at this point.

After migration, run `images:uploads:cutover apply --receipt $receiptPath --approval $approvalPath` using the same verified receipt/approval paths. It re-reads all database/provider evidence and rejects receipt drift, except that an exact receipt-derived `failed/upload_cutover_aborted` row or exact already-created bridge is recognized as this command's idempotent prior commit. For every retained legacy terminal row, it first backfills `presignExpiresAt` from the receipt's conservative outstanding-PUT deadline and enters durable temporary cleanup. For every still-proven pre-dispatch row, it atomically writes `status=failed`, `failureCode=upload_cutover_aborted`, and `temporaryCleanupState=pending`, creates no promotion, and commits. After all bridge/classification transactions, it runs the bounded idempotent temporary-session cleanup path for every retained terminal row, touching only that row's temporary source key and never its canonical destination. It requires a final absent HEAD and `temporaryCleanupState=verified_deleted` for each; any remaining source increments sanitized `legacyTerminalTempPresentCount` and the pre-dispatch subset `legacyPreDispatchTempPresentCount`, then exits nonzero, and is retried by rerunning apply with the same receipt; that rerun resumes cleanup instead of rejecting its own exact terminal write as drift. It derives every bridge `finalizationLeaseToken` with UUIDv5 namespace `16e0d6a7-6c39-5dc9-bc41-24f847e2f36a` over `receiptSha256 + ':' + uploadId`, creates `legacy_bridge` records only for exact committed or operator-disposed dispatch evidence, then searches both the source Queue and DLQ by stable event ID, refreshes the ephemeral message/lease evidence, and ACKs the exact current lease only after its database transaction commits. A receipt hash alone never substitutes for redelivered provider settlement. It never accepts HTTP requests, invents provider settlement, creates a new Image for an unfinished old session, or deletes an unmatched destination.

- [ ] **Step 5: Verify bridge tests**

```powershell
npm test --workspace=backend -- image-upload-cutover.service.spec.ts --runInBand
npm run test:integration --workspace=backend -- image-upload-cutover.integration-spec.ts
npm run build --workspace=backend
node --check apps/backend/dist/scripts/image-upload-cutover.js
docker build -f apps/backend/Dockerfile .
```

Expected: pre-dispatch/no-promotion, committed legacy bridge, nullable-ETag restriction, ambiguity blocking, no-delete, receipt-drift, replay, compiled-entrypoint, and backend-image tests PASS. The Docker builder and final runner both assert `/app/dist/scripts/image-upload-cutover.js` exists.

### Task 2: Write the production runbook and machine-checkable gates

> **Current polling replacement:** Execute and track Task A5.1 in `free-compatible-polling-amendment.md`. The Queue/provider-event schema, SQL, fixtures, and readbacks below are historical and must not be implemented.

**Files:**

- Create: `docs/runbooks/image-upload-roll-forward.md`
- Create: `scripts/verify-image-upload-production-gates.mjs`
- Create: `scripts/schemas/image-upload-production-evidence.schema.json`
- Create: `scripts/fixtures/image-upload-production-gates/pass.json`
- Create: `scripts/fixtures/image-upload-production-gates/fail/expired-pending.json`
- Create: `scripts/fixtures/image-upload-production-gates/fail/unresolved-promotion.json`
- Create: `scripts/fixtures/image-upload-production-gates/fail/invalid-provider-settlement.json`
- Create: `scripts/fixtures/image-upload-production-gates/fail/invalid-committed-authority.json`
- Create: `scripts/fixtures/image-upload-production-gates/fail/invalid-cleanup-authority.json`
- Create: `scripts/fixtures/image-upload-production-gates/fail/unverified-temporary-cleanup.json`
- Create: `scripts/fixtures/image-upload-production-gates/fail/open-conflict.json`
- Create: `scripts/fixtures/image-upload-production-gates/fail/conflict-hash-drift.json`
- Create: `scripts/fixtures/image-upload-production-gates/fail/open-quarantine.json`
- Create: `scripts/fixtures/image-upload-production-gates/fail/invalid-quarantine-evidence.json`
- Create: `scripts/fixtures/image-upload-production-gates/fail/unresolved-r2-deletion.json`
- Create: `scripts/fixtures/image-upload-production-gates/fail/invalid-r2-deletion-authority.json`
- Create: `scripts/fixtures/image-upload-production-gates/fail/invalid-non-r2-disposition.json`
- Create: `scripts/fixtures/image-upload-production-gates/fail/backup-binding-mismatch.json`
- Create: `scripts/fixtures/image-upload-production-gates/fail/stale-heartbeat.json`
- Create: `scripts/fixtures/image-upload-production-gates/fail/replica-budget.json`
- Create: `scripts/fixtures/image-upload-production-gates/fail/cors-mismatch.json`
- Create: `scripts/fixtures/image-upload-production-gates/fail/event-location-mismatch.json`
- Create: `scripts/fixtures/image-upload-production-gates/fail/missing-ci-context.json`
- Modify: `package.json` (add direct `ajv` dependency used by the verifier)

- [ ] **Step 1: Define the sanitized preflight input**

The verifier consumes a JSON receipt with:

```text
new image digest and commit
policy hash and exact policy values
quiesced pre-migration and post-bridge database backup/restore receipt paths, approval paths, ciphertext/approval digests, with audit/apply bound to the exact quiesced pair
API/reconciler/cutover process-role fingerprints
actual ready replica/process counts
Queue/DLQ names and IDs
source and DLQ inspection consumer IDs/types/settings
event rule ID/action/prefix
R2 bucket and endpoint identity plus exact production CORS origins/method/headers
cutover disposition paths/digests and audit-observed event ID/attempts/current source-or-DLQ location
active and unterminalized-expired upload counts; unresolved-promotion, invalid-provider-settlement, invalid-promotion-authority, invalid-promotion-conflict-evidence, due/unverified-temporary-cleanup, open-promotion-conflict, unresolved-image-deletion, legacy-terminal-source, and legacy-pre-dispatch-source counts, including rejection visibility-timeout comparison
explicit `cutoverBackupBindingMismatchCount`, `cutoverDispositionInvalidCount`, `cutoverEventLocationUnresolvedCount`, and `productionCorsMismatchCount`
ruleset ID and exact required contexts: backend-image-upload, image-upload-packaging, frontend-playwright-chromium
staging acceptance receipt
```

Create `scripts/schemas/image-upload-production-evidence.schema.json` with these exact versioned `$defs`; every object has `additionalProperties: false`, every listed field is required unless suffixed `?`, timestamps use RFC 3339 `date-time`, digests use lowercase `^[a-f0-9]{64}$`, UUIDs use `format: uuid`, and evidence paths use an absolute-path format enforced by the verifier:

| `$defs` name                         | Exact fields                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backupReceipt`                      | `schemaVersion='image-upload-backup-receipt/v1'`, `kind=pre_migration\|post_bridge`, `receiptId`, `createdAt`, `databaseFingerprintSha256`, `ciphertextSha256`, `restoreVerifiedAt`, `rowCountsSha256`, `migrationHistorySha256`, `operatorFingerprintSha256`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `backupApproval`                     | `schemaVersion='image-upload-backup-approval/v1'`, `receiptPath`, `receiptSha256`, `ciphertextSha256`, `approverFingerprintSha256`, `approvedAt`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `legacyRowDisposition`               | `schemaVersion='image-upload-legacy-row-disposition/v1'`, `uploadId`, `decision=committed_authorized\|cleanup_authorized`, `auditReceiptPath`, `auditReceiptSha256`, `evidenceReceiptPath`, `evidenceReceiptSha256`, `sourceObjectKeySha256`, `destinationObjectKeySha256`, `providerEventId?`, `imageIdSha256?`, `operatorFingerprintSha256`, `createdAt`, `approvalDigestSha256`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `promotionConflictDisposition`       | `schemaVersion='image-upload-promotion-conflict-disposition/v1'`, `conflictId`, `providerEventId`, `resolution=confirmed_absent_ack\|cleanup_authorized\|committed_authorized`, `evidenceReceiptPath`, `evidenceReceiptSha256`, `rejectionEvidenceSha256`, `operatorFingerprintSha256`, `approvalDigestSha256`, `createdAt`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `providerEventQuarantineDisposition` | `schemaVersion='image-upload-provider-event-quarantine-disposition/v1'`, `quarantineId`, `resolution=quarantined_ack\|replay_requested`, `reason=malformed_event\|unmatched_event`, `sourceQueueIdSha256`, `bodySha256`, optional `providerEventIdSha256` and `eventEnvelopeSha256` (both required only for `unmatched_event`, both forbidden for `malformed_event`), `quarantineFingerprintSha256`, `resolutionAttemptIdSha256`, `resolutionEvidenceSha256`, `locationActionReceiptSha256`, `acknowledgedLocationCount` (integer >= 0), `scanCompletedAt`, optional `replayQueueIdSha256`/`replayRequestIdSha256`/`replayMessageIdSha256` only for `replay_requested`, `evidenceReceiptPath`, `evidenceReceiptSha256`, `operatorFingerprintSha256`, `approvalDigestSha256`, `createdAt`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `cutoverAuditReceipt`                | `schemaVersion='image-upload-cutover-audit-receipt/v1'`, `receiptId`, `createdAt`, `authoritativeBackup` (exact `receiptPath`, `approvalPath`, `receiptSha256`, `approvalSha256`, `ciphertextSha256`), `outstandingPutDeadline`, `classificationsSha256`, `legacyAmbiguousCount`, `dispositions[]` (exact `uploadId`, `path`, `sha256`, `decision`), `observedEvents[]` (exact `providerEventId`, `attempts`, `currentLocation`, `queueIdSha256`, `messageIdSha256`, `leaseDeadline`), `counts` (exact `legacyCandidateCount`, `legacyPreDispatchCount`, `legacyCommittedCount`, `legacyCleanupAuthorizedCount`, `legacyTerminalTempPresentCount`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `productionReceipt`                  | `schemaVersion='image-upload-production-gate-receipt/v1'`, `receiptId`, `createdAt`, `release` (`imageDigest`, `commitSha`, `migrationChecksumSha256`, `policyHash`), `backups` (`preMigrationReceiptPath`, `preMigrationReceiptSha256`, `preMigrationApprovalPath`, `preMigrationApprovalSha256`, `postBridgeReceiptPath`, `postBridgeReceiptSha256`, `postBridgeApprovalPath`, `postBridgeApprovalSha256`), `roles` (`apiFingerprintSha256`, `reconcilerFingerprintSha256`, `cutoverFingerprintSha256`, `readyApiProcesses`, `permitsPerProcess`, `advisoryLockOwnerCount`, `heartbeatAt`, `queueSettlementCompletedAt`, `pendingSessionExpiryCompletedAt`, `promotionRecoveryCompletedAt`, `temporaryCleanupCompletedAt`, `imageDeletionCompletedAt`, `rateLimitCleanupCompletedAt`), `provider` (`accountIdSha256`, `bucketNameSha256`, `endpointSha256`, `sourceQueueIdSha256`, `dlqIdSha256`, `sourceConsumerIdSha256`, `dlqConsumerIdSha256`, `eventRuleIdSha256`, `apiR2CredentialFingerprintSha256`, `reconcilerR2CredentialFingerprintSha256`, `cutoverR2CredentialFingerprintSha256`, `imgproxyCredentialFingerprintSha256`, `reconcilerQueueCredentialFingerprintSha256`, `cutoverQueueCredentialFingerprintSha256`, `providerReadbackSha256`, `corsReadbackSha256`, `queueVisibilityTimeoutSeconds`, `queueMaxRetries`), `cutover` (`auditReceiptPath`, `auditReceiptSha256`, `dispositionPaths[]`, `dispositionDigests[]`, `eventLocationSha256`), `gates` (exact object with `observedAt` plus integer keys `activeUploads`, `unterminalizedExpiredUploads`, `unresolvedPromotions`, `invalidProviderSettlement`, `invalidPromotionAuthority`, `invalidPromotionConflictEvidence`, `openPromotionConflicts`, `openProviderEventQuarantine`, `invalidProviderEventQuarantineEvidence`, `dueTemporaryCleanup`, `unresolvedR2ImageDeletion`, `invalidR2DeletionAuthority`, `invalidNonR2DeletionDisposition`, `legacyTerminalTempPresent`, `legacyPreDispatchTempPresent`, `queueBacklog`, `dlqDepth`, `corsMismatch`, `backupBindingMismatch`, `dispositionInvalid`, `eventLocationUnresolved`), `ci` (`rulesetId`, `contexts` exact three-name array), `stagingReceiptPath`, `stagingReceiptSha256`, `operatorSmokeReceiptSha256`, `rollForwardDrillDecision=pass\|fail` |
| `productionApproval`                 | `schemaVersion='image-upload-production-gate-approval/v1'`, `receiptPath`, `receiptSha256`, `approverFingerprintSha256`, `approvedAt`, `decision=approved`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Arrays reject duplicate IDs/paths. The verifier loads these `$defs`, rejects missing or unknown fields before any semantic gate, then cross-checks all path/digest references and canonical JSON hashes. No receipt may embed another receipt as an unvalidated free-form object.

> **Stable-fingerprint closed-contract amendment:** The current post-start polling receipt is `image-upload-production-gate-receipt/v2-polling`. Its closed `release` object contains exactly `imageReference`, `imageDigest`, `imageCommitSha`, `commitSha`, `releaseFingerprint`, `migrationChecksumSha256`, `policyVersion`, `policyReadbackSha256`, and `policyHash`. Its closed `roles` object contains the historical polling role/process/heartbeat fields plus exactly `apiImageDigest`, `migrationImageDigest`, `reconcilerImageDigest`, `reconcilerEnvironmentBuildFingerprint`, and `heartbeatBuildFingerprint`. The verifier requires `imageCommitSha == commitSha`, recomputes `releaseFingerprint` from `commitSha`, requires all three role image IDs to equal the independently observed `release.imageDigest`, and requires both runtime fingerprints to equal the recomputed release fingerprint. Top-level `preDeployPollingSnapshotSha256` contains exactly two distinct protected pre-deploy snapshot digests. Top-level `startupApprovalPathSha256` and `startupApprovalSha256` bind the distinct protected pre-deploy approval; production mode requires its third distinct absolute `--startup-approval` path, reads its protected bytes, validates its closed canonical contract, and cross-binds its release, backups, audit, those pre-deploy snapshot digests, presign-disabled decision, path, and digest. The receipt deliberately excludes the later operator-smoke receipt fields because it authorizes that mutation. This amendment supersedes the historical v1 `productionReceipt.release`, runtime-binding, and operator-smoke tuple in the table above.

> **Two-phase admission amendment:** Phase 1 is now `image-upload-production-gate-receipt/v3-post-start-polling` and additionally requires the retained staging receipt as a fourth protected input. It contains no drill decision. Phase 2 uses `image-upload-final-ingress-receipt/v1-polling` and binds Phase 1, smoke authorization/receipt, a roll-forward drill ending at the active release, and two post-smoke/drill zero snapshots. Only Phase 2 authorizes general ingress.

The deterministic fixture, pinned stable Chrome, and memory thresholds remain an optional memory diagnostic. They are not CI, Phase 1, Phase 2, smoke, drill, or ingress gates. Missing optional diagnostic results do not block admission.

It rejects secrets, presigned URLs, full keys, full ETags, or image bytes in the receipt. Production and audit receipts live outside the repository with POSIX mode 0600 or a Windows owner-only ACL. The verifier canonicalizes JSON, verifies its SHA-256 against an operator approval/digest stored at a distinct absolute path, and rejects receipt permission drift, content/digest mismatch, signer/approval mismatch, or input/approval path drift. The receipt and approval file may reference each other only by canonical path and digest; neither contains credentials. The CLI has no implicit input discovery and accepts exactly one explicit mode: `--receipt <absolute-path> --approval <distinct-absolute-path> --startup-approval <third-distinct-absolute-path>` for the complete production gate, `--cutover-audit <absolute-path> --approval <distinct-absolute-path>` for audit, or test-only `--fixture <repository-fixture-path>` when `NODE_ENV=test`. A missing/relative/reused path, missing production or startup approval, multiple modes, `--fixture` outside test mode, or more than one candidate exits nonzero.

- [ ] **Step 2: Add exact SQL gates and independent failure fixtures**

Install/use a direct JSON Schema validator (Ajv or the repository's equivalent) against the schema file before running SQL. Create one fail fixture per gate—expired pending session, unresolved promotion, invalid response-only/event evidence, committed authority mismatch, cleanup authority mismatch, unverified temporary cleanup, open conflict, conflict hash drift, open quarantine, malformed/unmatched envelope-branch drift, current/snapshot mismatch, orphan or location-mismatched quarantine actions, invalid quarantine replay evidence, unresolved R2 deletion, non-R2 deferred deletion miscount, backup binding mismatch, stale heartbeat, replica-budget mismatch, CORS mismatch, Queue/DLQ location mismatch, and missing CI context—so a passing fixture never masks another gate's failure. The verifier runs each fixture independently and reports the gate key.

Before migration, enumerate database-evidenced legacy ambiguity:

```sql
SELECT u.id, u.status
FROM "ImageUpload" u
WHERE NOT EXISTS (
        SELECT 1 FROM "Image" i
        WHERE i."r2ObjectKey" = u."finalObjectKey"
      )
  AND (
        u."sourceEtag" IS NOT NULL
        OR u."finalizationStartedAt" IS NOT NULL
        OR u."consumedAt" IS NOT NULL
      )
ORDER BY u.id;
```

The audit must compare this exact ID set with destination HEAD and Queue-event readback, record an explicit operator disposition for every candidate, and emit `legacyAmbiguousCount=0`. A zero SQL row count alone is insufficient because destination/event evidence can exist outside PostgreSQL.

After migration, require zero active uploads and zero expired sessions left unterminalized:

```sql
SELECT COUNT(*) AS active_uploads
FROM "ImageUpload"
WHERE status = 'finalizing'
   OR (status = 'pending' AND "expiresAt" > NOW());

SELECT COUNT(*) AS unterminalized_expired_uploads
FROM "ImageUpload"
WHERE status = 'pending'
  AND "expiresAt" <= NOW();
```

The expired-session fixture passes only after the reconciler/cutover CAS writes `status=failed`, `failureCode=upload_expired|upload_cutover_aborted`, terminal timestamps, and durable temporary-cleanup state.

Require zero unresolved promotions:

```sql
SELECT COUNT(*) AS unresolved_promotions
FROM "ImageUploadPromotion"
WHERE "copyState" = 'dispatched'
   OR disposition IN ('pending', 'cleanup_required')
   OR ("copyState" = 'dispatch_rejected' AND disposition <> 'not_created')
   OR (disposition = 'not_created' AND "copyState" <> 'dispatch_rejected');
```

Require zero invalid provider-settlement evidence:

```sql
SELECT COUNT(*) AS invalid_provider_settlement
FROM "ImageUploadPromotion" p
WHERE (
        p."copyState" = 'provider_settled'
        AND (
          p."providerSettlementObservedAt" IS NULL
          OR NOT (
          (p."copyResponseObservedAt" IS NOT NULL AND p."copyResponseEtag" IS NOT NULL)
          OR (
            p."providerEventId" IS NOT NULL
            AND p."providerEventObservedAt" IS NOT NULL
            AND p."settlementSource" IS NOT NULL
            AND p."providerObjectEtag" IS NOT NULL
          )
          )
        )
      )
   OR ((p."copyResponseObservedAt" IS NULL) <> (p."copyResponseEtag" IS NULL))
   OR (p."copyResponseObservedAt" IS NOT NULL AND p."copyState" <> 'provider_settled')
   OR (p."providerSettlementObservedAt" IS NOT NULL AND p."copyState" <> 'provider_settled')
   OR (p."providerEventId" IS NOT NULL AND p."copyState" <> 'provider_settled')
   OR NOT (
        (p."providerEventId" IS NULL AND p."providerEventObservedAt" IS NULL AND p."settlementSource" IS NULL AND p."providerObjectEtag" IS NULL)
        OR
        (p."providerEventId" IS NOT NULL AND p."providerEventObservedAt" IS NOT NULL AND p."settlementSource" IS NOT NULL AND p."providerObjectEtag" IS NOT NULL)
      )
   OR (
        p."copyResponseEtag" IS NOT NULL
        AND p."providerObjectEtag" IS NOT NULL
        AND p."copyResponseEtag" <> p."providerObjectEtag"
      );
```

A response-only `provider_settled` row is valid and must not be rejected merely because `providerEventId` is null. Require zero invalid committed/deletion authority. A committed promotion is valid either through its exact live Image or through the exact permanent idempotency deletion tombstone plus durable deleted object record:

```sql
SELECT COUNT(*) AS invalid_promotion_authority
FROM "ImageUploadPromotion" p
WHERE (
        p.disposition = 'committed'
        AND NOT (
          EXISTS (
            SELECT 1 FROM "Image" i
            WHERE i.id = p."committedResultImageId"
              AND i."r2ObjectKey" = p."destinationObjectKey"
          )
          OR (
            EXISTS (
              SELECT 1 FROM "ImageUploadIdempotency" idem
              WHERE idem."uploadId" = p."uploadId"
                AND idem."resultImageId" = p."committedResultImageId"
                AND idem."resultDeletedAt" IS NOT NULL
            )
            AND EXISTS (
              SELECT 1 FROM "ImageObjectDeletion" d
              WHERE d."imageId" = p."committedResultImageId"
                AND d."objectKey" = p."destinationObjectKey"
                AND d.status = 'deleted'
                AND d."deletedAt" IS NOT NULL
            )
          )
        )
      )
   OR (
        p.disposition IN ('cleanup_required', 'verified_deleted')
        AND (
          p."committedResultImageId" IS NOT NULL
          OR EXISTS (
            SELECT 1 FROM "Image" i
            WHERE i."r2ObjectKey" = p."destinationObjectKey"
          )
        )
      )
   OR (
        p.disposition = 'not_created'
        AND (
          p."copyState" <> 'dispatch_rejected'
          OR p."dispatchRejectedAt" IS NULL
          OR p."firstDestinationAbsentAt" IS NULL
          OR p."destinationAbsentVerifiedAt" IS NULL
          OR p."destinationAbsentVerifiedAt" <= p."firstDestinationAbsentAt"
          OR p."dispatchRejectedAt" < p."destinationAbsentVerifiedAt"
          OR p."dispatchRejectionReason" IS NULL
          OR p."dispatchRejectionReason" NOT IN ('source_missing', 'source_etag_mismatch')
          OR (
            p."dispatchRejectionReason" = 'source_missing'
            AND p."dispatchRejectionObservedSourceEtag" IS NOT NULL
          )
          OR (
            p."dispatchRejectionReason" = 'source_etag_mismatch'
            AND (
              p."dispatchRejectionObservedSourceEtag" IS NULL
              OR p."dispatchRejectionObservedSourceEtag" = p."sourceEtag"
            )
          )
          OR p."providerSettlementObservedAt" IS NOT NULL
          OR p."copyResponseObservedAt" IS NOT NULL
          OR p."copyResponseEtag" IS NOT NULL
          OR p."providerEventId" IS NOT NULL
          OR p."providerEventObservedAt" IS NOT NULL
          OR p."settlementSource" IS NOT NULL
          OR p."providerObjectEtag" IS NOT NULL
          OR p."committedResultImageId" IS NOT NULL
          OR EXISTS (
            SELECT 1 FROM "Image" i
            WHERE i."r2ObjectKey" = p."destinationObjectKey"
          )
        )
      );
```

Require zero due or unverified terminal temporary cleanup and zero open promotion conflicts:

```sql
SELECT COUNT(*) AS unresolved_temporary_cleanup
FROM "ImageUpload"
WHERE "temporaryCleanupState" = 'pending'
   OR (
        (status IN ('consumed', 'failed') OR (status = 'pending' AND "expiresAt" <= NOW()))
        AND "temporaryCleanupState" IS DISTINCT FROM 'verified_deleted'
      )
   OR (
        "temporaryCleanupState" = 'verified_deleted'
        AND (
          "presignExpiresAt" IS NULL
          OR "temporaryCleanupVerifiedAt" IS NULL
          OR "temporaryCleanupVerifiedAt" < "presignExpiresAt"
        )
      );

SELECT COUNT(*) AS open_promotion_conflicts
FROM "ImageUploadPromotionConflict"
WHERE state <> 'resolved'
   OR resolution IS NULL
   OR "resolvedAt" IS NULL;

SELECT COUNT(*) AS open_provider_event_quarantine
FROM "ImageUploadProviderEventQuarantine"
WHERE state <> 'resolved'
   OR resolution IS NULL
   OR "resolvedAt" IS NULL;

SELECT COUNT(*) AS invalid_provider_event_quarantine_evidence
FROM "ImageUploadProviderEventQuarantine" q
WHERE q.state NOT IN ('open', 'resolving', 'resolved')
   OR (q.state = 'open' AND q."resolutionAttemptId" IS NOT NULL)
   OR q."bodySha256" IS NULL
   OR q.reason NOT IN ('malformed_event', 'unmatched_event')
   OR (q.reason = 'malformed_event' AND (q."eventEnvelopeSha256" IS NOT NULL OR q."providerEventId" IS NOT NULL))
   OR (q.reason = 'unmatched_event' AND (q."eventEnvelopeSha256" IS NULL OR q."providerEventId" IS NULL))
   OR q."quarantineFingerprintSha256" IS NULL
   OR q."latestLocationObservationSha256" IS NULL
   OR NOT EXISTS (
        SELECT 1
        FROM "ImageUploadProviderEventQuarantineLocation" l
        WHERE l."quarantineId" = q.id
          AND l."locationObservationSha256" = q."latestLocationObservationSha256"
          AND l."queueKind" IN ('source', 'dlq')
          AND l.attempts >= 1
      )
   OR (
        q.state = 'resolving'
        AND (q."resolutionAttemptId" IS NULL OR q.resolution IS NULL OR q."resolutionStartedAt" IS NULL OR q."operatorIdentityFingerprint" IS NULL OR q."approvalDigest" IS NULL OR q."resolvedAt" IS NOT NULL)
      )
   OR (
        q.state = 'resolved'
        AND (
        q."latestResolutionAttemptId" IS DISTINCT FROM q."resolutionAttemptId"
        OR NOT EXISTS (
          SELECT 1
        FROM "ImageUploadProviderEventQuarantineResolution" r
        WHERE r.id = q."resolutionAttemptId"
              AND r."quarantineId" = q.id
               AND r."resolutionEvidenceSha256" = q."latestResolutionEvidenceSha256"
               AND r.resolution = q.resolution
               AND r."operatorIdentityFingerprint" = q."operatorIdentityFingerprint"
               AND r."approvalDigest" = q."approvalDigest"
               AND r."acknowledgedLocationCount" = q."acknowledgedLocationCount"
               AND r."resolutionStartedAt" = q."resolutionStartedAt"
               AND r."resolutionScanCompletedAt" = q."resolutionScanCompletedAt"
               AND r."replayQueueId" IS NOT DISTINCT FROM q."replayQueueId"
               AND r."replayRequestId" IS NOT DISTINCT FROM q."replayRequestId"
               AND r."replayMessageId" IS NOT DISTINCT FROM q."replayMessageId"
               AND r."replayRequestedAt" IS NOT DISTINCT FROM q."replayRequestedAt"
               AND r."acknowledgedAt" = q."acknowledgedAt"
               AND r."resolvedAt" = q."resolvedAt"
           )
         )
      )
   OR (
        q.state = 'resolved'
        AND (q.resolution NOT IN ('quarantined_ack', 'replay_requested') OR q."acknowledgedLocationCount" IS NULL OR q."acknowledgedLocationCount" < 0 OR q."resolutionScanCompletedAt" IS NULL OR q."acknowledgedAt" IS NULL OR q."resolvedAt" IS NULL OR q."resolutionStartedAt" > q."resolutionScanCompletedAt" OR q."resolutionScanCompletedAt" > q."acknowledgedAt" OR q."acknowledgedAt" > q."resolvedAt")
      )
   OR (
        q.state = 'resolved'
        AND EXISTS (
          SELECT 1
          FROM "ImageUploadProviderEventQuarantineAction" requested
          LEFT JOIN "ImageUploadProviderEventQuarantineAction" succeeded
            ON succeeded."quarantineId" = requested."quarantineId"
           AND succeeded."resolutionAttemptId" = requested."resolutionAttemptId"
           AND succeeded."locationObservationSha256" = requested."locationObservationSha256"
           AND succeeded.action = 'ack_succeeded'
          WHERE requested."quarantineId" = q.id
            AND requested."resolutionAttemptId" = q."resolutionAttemptId"
            AND requested.action = 'ack_requested'
            AND succeeded.id IS NULL
        )
      )
   OR (
        q.state = 'resolved'
        AND EXISTS (
          SELECT 1
          FROM "ImageUploadProviderEventQuarantineAction" succeeded
          WHERE succeeded."quarantineId" = q.id
            AND succeeded."resolutionAttemptId" = q."resolutionAttemptId"
            AND succeeded.action = 'ack_succeeded'
            AND NOT EXISTS (
              SELECT 1
              FROM "ImageUploadProviderEventQuarantineAction" requested
              WHERE requested."quarantineId" = succeeded."quarantineId"
                AND requested."resolutionAttemptId" = succeeded."resolutionAttemptId"
                AND requested."locationObservationSha256" = succeeded."locationObservationSha256"
                AND requested.action = 'ack_requested'
                AND requested."observedAt" <= succeeded."observedAt"
            )
        )
      )
   OR (
        q.state = 'resolved'
        AND EXISTS (
          SELECT 1
          FROM "ImageUploadProviderEventQuarantineAction" a
          WHERE a."quarantineId" = q.id
            AND a."resolutionAttemptId" = q."resolutionAttemptId"
            AND NOT EXISTS (
              SELECT 1
              FROM "ImageUploadProviderEventQuarantineLocation" l
              WHERE l."quarantineId" = a."quarantineId"
                AND l."locationObservationSha256" = a."locationObservationSha256"
                AND l."queueKind" = a."queueKind"
                AND l."queueId" = a."queueId"
                AND l."messageId" = a."messageId"
                AND l."leaseId" = a."leaseId"
                AND (a.action = 'replay_publish_requested' OR a."replayRequestId" IS NOT DISTINCT FROM l."replayRequestId")
            )
        )
      )
   OR (
        q.state = 'resolved'
        AND EXISTS (
          SELECT 1
          FROM "ImageUploadProviderEventQuarantineAction" a
          WHERE a."quarantineId" = q.id
            AND a."resolutionAttemptId" = q."resolutionAttemptId"
            AND (
              (a.action IN ('ack_requested', 'replay_publish_requested') AND a."providerOutcome" IS NOT NULL)
              OR (a.action = 'replay_publish_requested' AND a."replayRequestId" IS NULL)
              OR (a.action = 'replay_published' AND a."replayRequestId" IS NULL)
              OR (a.action = 'ack_succeeded' AND (a."providerOutcome" IS NULL OR a."providerOutcome" NOT IN ('acknowledged', 'already_absent')))
              OR (a.action = 'replay_published' AND (a."providerOutcome" IS NULL OR a."providerOutcome" NOT IN ('published', 'adopted_after_uncertain_publish')))
            )
        )
      )
   OR (
        q.state = 'resolved'
        AND q."acknowledgedLocationCount" <> (
          SELECT COUNT(DISTINCT succeeded."locationObservationSha256")
          FROM "ImageUploadProviderEventQuarantineAction" succeeded
          WHERE succeeded."quarantineId" = q.id
            AND succeeded."resolutionAttemptId" = q."resolutionAttemptId"
            AND succeeded.action = 'ack_succeeded'
        )
      )
   OR (
        q.resolution = 'quarantined_ack'
        AND (q."replayQueueId" IS NOT NULL OR q."replayRequestId" IS NOT NULL OR q."replayMessageId" IS NOT NULL OR q."replayRequestedAt" IS NOT NULL)
      )
   OR (
        q.resolution = 'replay_requested'
        AND (
          q."replayQueueId" IS NULL
          OR q."replayRequestId" IS NULL
          OR q."replayMessageId" IS NULL
          OR q."replayRequestedAt" IS NULL
          OR 1 <> (
          SELECT COUNT(*)
          FROM "ImageUploadProviderEventQuarantineAction" requested
          WHERE requested."quarantineId" = q.id
          AND requested."resolutionAttemptId" = q."resolutionAttemptId"
          AND requested.action = 'replay_publish_requested'
          AND requested."replayRequestId" = q."replayRequestId"
          )
          OR 1 <> (
          SELECT COUNT(*)
          FROM "ImageUploadProviderEventQuarantineAction" replay
          WHERE replay."quarantineId" = q.id
          AND replay."resolutionAttemptId" = q."resolutionAttemptId"
          AND replay.action = 'replay_published'
          AND replay."replayRequestId" = q."replayRequestId"
          )
        )
      );

SELECT COUNT(*) AS invalid_promotion_conflict_evidence
FROM "ImageUploadPromotionConflict"
WHERE "accountId" IS NULL
   OR bucket IS NULL
   OR "sourceObjectKeyHash" IS NULL
   OR "destinationObjectKeyHash" IS NULL
   OR "eventTime" IS NULL
   OR "eventEnvelopeSha256" IS NULL
   OR "rejectionDispatchRejectedAt" IS NULL
   OR "rejectionReason" NOT IN ('source_missing', 'source_etag_mismatch')
   OR "rejectionFirstDestinationAbsentAt" IS NULL
   OR "rejectionDestinationAbsentVerifiedAt" IS NULL
   OR "rejectionEvidenceSha256" IS NULL;
```

Require zero applicable R2 user-deletion work and explicitly disposition non-R2 rows:

```sql
SELECT COUNT(*) AS unresolved_r2_image_object_deletions
FROM "ImageObjectDeletion"
WHERE provider = 'r2'
  AND (
    status <> 'deleted'
    OR "deletedAt" IS NULL
    OR authority NOT IN ('current_result', 'legacy_image')
  );

SELECT COUNT(*) AS invalid_r2_deletion_authority
FROM "ImageObjectDeletion"
WHERE provider = 'r2'
  AND (
    authority NOT IN ('current_result', 'legacy_image')
    OR "objectKeyHash" IS NULL
    OR (authority = 'legacy_image' AND "legacyImageSnapshotSha256" IS NULL)
    OR (authority = 'current_result' AND "legacyImageSnapshotSha256" IS NOT NULL)
  );

SELECT COUNT(*) AS invalid_non_r2_deletion_disposition
FROM "ImageObjectDeletion"
WHERE provider <> 'r2'
  AND NOT (status = 'deferred' AND "providerDisposition" IS NOT NULL);
```

For every quarantine resolution row—not only the current pointer—the verifier reconstructs the canonical immutable snapshot, recomputes `resolutionEvidenceSha256`, checks monotonic timestamps, exact attempt/action/location linkage, and rejects any historical drift. For every `verified_deleted` temporary cleanup, the verifier recomputes the runtime deadline as `presignExpiresAt + IMAGE_UPLOAD_PRESIGN_CLOCK_SKEW_SECONDS` (the SQL CHECK intentionally cannot reference runtime configuration) and compares `temporaryCleanupVerifiedAt >= presignExpiresAt + configured clock skew` and requires the sanitized final absent-HEAD observation to occur at or after that instant. Fixtures must prove an expired pending row fails until terminalized, a conflict hash without its full rejection snapshot fails, a tombstone belonging to another upload cannot satisfy committed authority, response-only settlement is accepted, partial/mismatched response/event evidence is rejected, and every open conflict/unverified terminal cleanup fails closed. For every `not_created` row, the verifier additionally compares `destinationAbsentVerifiedAt - firstDestinationAbsentAt` against the exact Queue visibility timeout from the provider readback receipt and requires it to be greater than or equal. Every zero gate and its sanitized readback must be recorded twice when the runbook says “twice”.

- [ ] **Step 3: Verify actual fleet decode budget**

Read actual ready API replicas and Node worker count from Dokploy/Compose/runtime health. Require:

```text
actual process count = IMAGE_UPLOAD_PROCESS_COUNT
actual process count × permits per process <= 2
exactly one reconciler advisory-lock owner on a dedicated `pg.Client` connection
singleton heartbeat age <= two one-minute cadences
all six per-loop completion timestamps are present and advancing
pending-session expiry and rate-limit cleanup owners are the reconciler; no ad-hoc cron or API process may mutate those tables
```

A declared environment value alone is not evidence.

- [ ] **Step 4: Verify GitHub and provider readbacks**

Fetch the ruleset by ID and require exactly the three contexts `backend-image-upload`, `image-upload-packaging`, and `frontend-playwright-chromium`, with active enforcement and no bypass. Fetch both Queue consumers and the event rule, not only the Queue resources. Require source-to-DLQ name binding, retry settings, retention, visibility timeout, a DLQ inspection consumer with no recursive DLQ, action `CopyObject`, prefix `albums/`, and zero DLQ before proceeding. Read back role-separated bucket-scoped R2 identities. Prove the API credential cannot access another bucket/environment. Prove create-only overwrite protection by sending the application conditional COPY command to an existing destination and requiring a failed second COPY with unchanged destination bytes/ETag; do not claim the credential itself denies overwrite. Prove prefix/operation safety through application key-builder/command tests that reject traversal, cross-prefix, and arbitrary DELETE before an SDK call; do not claim long-lived token prefix isolation. Read back exact production CORS with explicit HTTPS admin origins, `PUT`, `Content-Type`, and no wildcard. Separately prove the reconciler credential has bucket-scoped Object Read & Write for HEAD/COPY/DELETE without sharing the API credential.

- [ ] **Step 5: Run the verifier against fixtures**

```powershell
$previousNodeEnv = $env:NODE_ENV
try {
    $env:NODE_ENV = "test"
    node scripts/verify-image-upload-production-gates.mjs --fixture scripts/fixtures/image-upload-production-gates/pass.json
    if ($LASTEXITCODE -ne 0) { throw "pass fixture failed" }

    Get-ChildItem scripts/fixtures/image-upload-production-gates/fail/*.json | ForEach-Object {
        node scripts/verify-image-upload-production-gates.mjs --fixture $_.FullName
        if ($LASTEXITCODE -eq 0) { throw "fail fixture unexpectedly passed: $($_.Name)" }
    }
    if ($LASTEXITCODE -eq 0) { throw "fail fixture unexpectedly passed" }
} finally {
    if ($null -eq $previousNodeEnv) {
        Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
    } else {
        $env:NODE_ENV = $previousNodeEnv
    }
}
```

Expected: the pass fixture exits 0; every independent fail fixture exits nonzero and names only its intended gate.

### Task 3: Prepare immutable build and provider resources before maintenance

> **Current polling execution for Tasks 3–7:** Execute the polling-only procedure in `docs/runbooks/image-upload-roll-forward.md` and track Task A5 Steps 4–5 in `free-compatible-polling-amendment.md`. Every Queue, DLQ, consumer, event-rule, provider-event, ACK/replay, six-loop, or Queue-visibility instruction below is historical and must not be executed or used as acceptance evidence.

**Files:**

- Modify: `docs/runbooks/image-upload-roll-forward.md`

- [ ] **Step 1: Record immutable build evidence**

Record the new Docker digest/commit, migration checksum, and test/CI receipts. An optional encrypted preparation backup may be created for rehearsal, but it is explicitly non-authoritative: it cannot satisfy the mandatory migration-backup gate or authorize audit, migration, or apply because legacy writers are still live. The mandatory quiesced backup is created in Task 4 only after every old writer and outstanding signed PUT is proven unable to mutate state.

- [ ] **Step 2: Provision and read back settlement resources**

Before blocking uploads, create/read back:

- production Queue name and ID;
- distinct DLQ name and ID;
- source HTTP-pull consumer ID with `type=http_pull`;
- source consumer DLQ name, max retries, retry delay, batch size, and visibility timeout;
- DLQ inspection HTTP-pull consumer ID with no recursive DLQ binding;
- at least 24-hour retention;
- R2 notification rule with action exactly `CopyObject` and prefix exactly `albums/`;
- R2 CORS with the exact production admin origins, method `PUT`, allowed header `Content-Type`, no wildcard origin/header, and no unrelated exposed header;
- separate Queue credentials for reconciler runtime (`IMAGE_UPLOAD_QUEUE_TOKEN`) and cutover pull/ack (`IMAGE_UPLOAD_CUTOVER_QUEUE_TOKEN`), plus the operator provisioning token;
- separate bucket-scoped R2 data-plane credentials for reconciler HEAD/COPY/DELETE and cutover conflict-resolution HEAD/DELETE; neither is shared with API or imgproxy;
- one distinct temporary account-scoped R2 Admin Read Only credential for production cutover CORS/configuration readback, exposed only through `IMAGE_UPLOAD_CUTOVER_R2_CONFIG_READ_ACCESS_KEY_ID` and `IMAGE_UPLOAD_CUTOVER_R2_CONFIG_READ_SECRET_ACCESS_KEY`.

The API must not receive either Queue or operator token and must not share its bucket-scoped R2 credential with the reconciler. Prefix restrictions are application invariants, not an unsupported claim about long-lived R2 token scope. The reconciler receives only `IMAGE_UPLOAD_QUEUE_TOKEN` and its dedicated R2 credential, never `IMAGE_UPLOAD_CUTOVER_QUEUE_TOKEN`, the operator token, or the temporary config-read credential. Cutover receives its separately fingerprinted bucket-scoped data-plane credential, the distinct temporary Admin Read Only config credential, and `IMAGE_UPLOAD_OPERATOR_TOKEN`. Only the config credential may perform `GetBucketCors`; object operations remain on the bucket-scoped cutover credential. All cutover mounts are removed before runtime enablement, and the temporary config credential is revoked after Stage 09 acceptance. Failure to prove every required resource and role boundary is present and correctly bound aborts maintenance.

- [ ] **Step 3: Prove the required CI rules**

Run the ruleset verifier by ID and store the sanitized result proving all three required contexts. A list-only response or unhandled branch-protection 404 is insufficient. Stable-Chrome and deterministic memory results may be stored separately when an operator elects to run the optional diagnostic, but they are not part of the production receipt.

### Task 4: Execute the serial maintenance cutover

**Files:**

- Modify: `docs/runbooks/image-upload-roll-forward.md`

- [ ] **Step 1: Establish and evidence the no-new-upload boundary**

Use one closed path:

1. **Standard path:** set the ingress maintenance rule for every upload-creation route and verify HTTP 503 `upload_presign_disabled`.
2. **Approved initial-cutover exception — `maintenance_route_absent`:** do not provision a new Cloudflare maintenance Worker/rule. Instead, store protected evidence that the public frontend is already in maintenance mode; inventory every currently deployed API generation and prove no upload-creation endpoint is registered; run an authenticated admin canary against every known upload-creation path and prove it fails closed without creating an upload/session; and prove this exact route-absent state remained unchanged for at least the maximum configured legacy signed-PUT lifetime plus `IMAGE_UPLOAD_PRESIGN_CLOCK_SKEW_SECONDS`. Record the start of that verified interval as `presignDisabledAt`. A screenshot or operator statement alone does not satisfy the exception. Any reachable creation route, successful/ambiguous canary, deployment drift, or insufficient interval falls back to the standard path.

For either path, the pre-migration schema must not reference future `presignExpiresAt`: query legacy `expiresAt` only if a legacy signer contract test proves it equals the signed PUT expiry; otherwise record `presignDisabledAt + maximum configured legacy PUT lifetime`. Use the later conservative outstanding-PUT deadline. Keep HTTP confirm, status, and abandon available during the bounded drain; status is read-only, while confirm/abandon may settle already-started work. The exception waives only creation of a new ingress maintenance Worker/rule; it does not waive any wait, quiescence, backup, audit, migration, approval, smoke, or zero gate.

- [ ] **Step 2: Stop old scheduled mutations while events collect**

Stop the old upload cleanup, image deletion, migration, and scheduler jobs. Keep only the old HTTP confirm, status, and abandon routes during the bounded drain. Verify the newly provisioned Queue is receiving CopyObject events. Wait until the later of (a) the recorded conservative outstanding-PUT deadline plus `IMAGE_UPLOAD_PRESIGN_CLOCK_SKEW_SECONDS` and (b) every active confirm/R2 deadline/finalization lease settlement. The one-hour PUT signature therefore cannot be replaced by a 10-minute lease wait.

- [ ] **Step 3: Stop every old writer**

After that exact deadline, block confirm and abandon; status may stay read-only only until the API is stopped. Stop every old backend/API instance. Verify zero ready old replicas, zero old scheduler processes, closed old health endpoints, no active database lease renewal over at least two lease cadences, no active R2 operation, and canary evidence that a late PUT cannot mutate R2 during audit/apply. Do not start an old process again.

- [ ] **Step 4: Create the authoritative quiesced migration backup**

Only now create an encrypted full logical backup of the entire quiesced legacy PostgreSQL database—schema, data, migration history, and roles/ownership metadata required for restore—not a selective table dump. Restore it into a disposable PostgreSQL instance, verify existing `Image`/`ImageUpload` counts and digests, then destroy the restore. Store the ciphertext SHA-256 and restore receipt outside the repository with protected permissions and a separately stored operator approval digest. Future tables are not required. Every audit, migration, and apply invocation must reference this quiesced backup receipt/digest and reject an early/stale backup.

- [ ] **Step 5: Audit and classify every legacy row before migration**

```powershell
$env:IMAGE_UPLOAD_PROCESS_ROLE = "cutover"
$env:IMAGE_UPLOAD_PRESIGN_ENABLED = "false"
$receiptPath = Join-Path $env:TEMP "ndt-image-upload-cutover-receipt.json"
$approvalPath = Join-Path $env:TEMP "ndt-image-upload-cutover-approval.json"
$backupReceiptPath = $env:IMAGE_UPLOAD_QUIESCED_BACKUP_RECEIPT
$backupApprovalPath = $env:IMAGE_UPLOAD_QUIESCED_BACKUP_APPROVAL
$dispositionPaths = @()

if ([string]::IsNullOrWhiteSpace($backupReceiptPath) -or
    [string]::IsNullOrWhiteSpace($backupApprovalPath)) {
    throw "The quiesced backup receipt and its distinct approval are required"
}

$auditArgs = @(
    "/app/dist/scripts/image-upload-cutover.js",
    "audit",
    "--receipt", $receiptPath,
    "--backup-receipt", $backupReceiptPath,
    "--backup-approval", $backupApprovalPath
)
foreach ($dispositionPath in $dispositionPaths) {
    $auditArgs += @("--disposition", $dispositionPath)
}
node @auditArgs
$initialAuditExitCode = $LASTEXITCODE
if ($initialAuditExitCode -eq 0) {
    Write-Host "Initial audit is already unambiguous"
} else {
    Write-Host "Initial audit is nonzero; create one signed disposition per reported ambiguous row"

    # Repeat this command for every reported row, with one independently reviewed
    # environment-variable set and one distinct protected output file per row.
    node /app/dist/scripts/image-upload-cutover.js disposition `
        --audit-receipt $receiptPath `
        --upload-id $env:IMAGE_UPLOAD_LEGACY_DISPOSITION_UPLOAD_ID `
        --decision $env:IMAGE_UPLOAD_LEGACY_DISPOSITION_DECISION `
        --evidence-receipt $env:IMAGE_UPLOAD_LEGACY_DISPOSITION_EVIDENCE `
        --output $env:IMAGE_UPLOAD_LEGACY_DISPOSITION_OUTPUT `
        --operator-fingerprint $env:IMAGE_UPLOAD_OPERATOR_FINGERPRINT
    if ($LASTEXITCODE -ne 0) { throw "legacy disposition failed" }

    # Append every distinct output produced by the repeated command.
    $dispositionPaths += $env:IMAGE_UPLOAD_LEGACY_DISPOSITION_OUTPUT
}
$auditArgs = @(
    "/app/dist/scripts/image-upload-cutover.js",
    "audit",
    "--receipt", $receiptPath,
    "--backup-receipt", $backupReceiptPath,
    "--backup-approval", $backupApprovalPath
)
foreach ($dispositionPath in $dispositionPaths) {
    $auditArgs += @("--disposition", $dispositionPath)
}
node @auditArgs
if ($LASTEXITCODE -ne 0) { throw "cutover audit remains ambiguous" }

# Only after independent review of the zero-ambiguity canonical receipt digest:
node /app/dist/scripts/image-upload-cutover.js approve --receipt $receiptPath --approval $approvalPath
if ($LASTEXITCODE -ne 0) { throw "cutover approval failed" }
node scripts/verify-image-upload-production-gates.mjs --cutover-audit $receiptPath --approval $approvalPath
if ($LASTEXITCODE -ne 0) { throw "cutover audit gate failed" }
```

Expected: the initial audit may deliberately exit nonzero and still write a protected, non-approved receipt listing ambiguous rows. Each such row receives one independently evidenced, signed `committed_authorized` or `cleanup_authorized` disposition; the rerun receives every disposition through an explicit `--disposition` argument. The zero-ambiguity audit receipt embeds the canonical quiesced-backup receipt/approval paths plus their ciphertext/approval digests. Only then does the separate approve command record the independently reviewed audit digest/signer at the distinct protected path. The verifier rejects self-approval, missing/duplicate/cross-row dispositions, backup/disposition digest or path drift, ACL drift, or a missing approval. The SQL candidate set, exact Image references, destination HEAD readback, and retried source-Queue/DLQ evidence agree; `legacyAmbiguousCount=0`; the legacy-schema audit has made no database or R2 object mutation; no promotion exists yet. Any future-column/table access, database write, R2 PUT/COPY/DELETE, ambiguous row, receipt drift, ACK during audit, or provider mismatch keeps maintenance active and blocks migration.

- [ ] **Step 6: Apply the migration**

```powershell
npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma
npx prisma validate --schema apps/backend/prisma/schema.prisma
```

Expected: both commands exit 0 while all API ingress remains closed and the verified audit receipt remains unchanged.

- [ ] **Step 7: Apply the one-shot bridge receipt**

```powershell
node /app/dist/scripts/image-upload-cutover.js apply --receipt $receiptPath --approval $approvalPath
```

Expected: apply verifies the audit receipt's exact quiesced-backup and disposition bindings before mutation. After exact evidence revalidation, pre-dispatch rows become `failed/upload_cutover_aborted` and receive no promotion; every retained legacy terminal row has the conservative `presignExpiresAt`, durable cleanup evidence, and a temporary key that passes final absent HEAD verification; exact existing Image authority is preserved and becomes a committed `legacy_bridge` only with exact dispatch/event evidence; every created bridge has the deterministic UUIDv5 lease token; only exact operator-disposed dispatch evidence can create canonical cleanup authority. For every audit-observed provider event, apply searches both the configured source Queue and DLQ by stable event ID, records its current location/message ID/attempt/fresh lease, and ACKs only that current lease after the corresponding database transaction commits. A missing or multiply located event, stale lease, or unresolved Queue/DLQ location exits nonzero.

Immediately after bridge apply, create a second encrypted full logical backup of the migrated database. Restore it into a disposable instance and prove `ImageUploadIdempotency`, `ImageUploadPromotion`, `ImageUploadPromotionConflict`, `ImageUploadProviderEventQuarantine`, `ImageUploadProviderEventQuarantineLocation`, `ImageUploadProviderEventQuarantineAction`, `ImageUploadProviderEventQuarantineResolution`, `ImageUploadReconcilerHeartbeat`, `ImageUploadRateLimitEvent`, `ImageObjectDeletion`, response/event settlement constraints, quarantine replay/action/foreign-key constraints, temporary-cleanup fields/constraints, bridge counts, deterministic lease tokens, and migration history. Store this post-bridge backup receipt separately from the pre-migration receipt.

- [ ] **Step 8: Require zero maintenance gates**

Run active-upload, `unterminalized_expired_uploads`, unresolved-promotion, invalid provider-settlement, invalid committed/rejected authority, `invalid_promotion_conflict_evidence`, open/resolving and invalid provider-event quarantine evidence, due/unverified temporary-cleanup, open-promotion-conflict, unresolved-`ImageObjectDeletion`, `legacyTerminalTempPresentCount`, `legacyPreDispatchTempPresentCount`, source Queue backlog, and DLQ depth checks. Require all zero twice, separated by one Queue visibility timeout. Also require `legacyAmbiguousCount=0`, `cutoverBackupBindingMismatchCount=0`, `cutoverDispositionInvalidCount=0`, `cutoverEventLocationUnresolvedCount=0`, `productionCorsMismatchCount=0`, and zero promotion rows for every pre-dispatch receipt entry. The verifier must validate every receipt/approval/disposition against the versioned schema with unknown-field rejection, recompute every conflict and quarantine fingerprint/hash from immutable fields (including `providerEventIdSha256` plus canonical `eventEnvelopeSha256` for `unmatched_event`, and forbidding both for `malformed_event`), verify every quarantine location/action receipt has one `ack_succeeded` per matching current lease (or exactly one recorded `replayRequestId` envelope, with ephemeral message IDs treated only as evidence), compare the audit/apply canonical backup paths and digests to the authoritative quiesced backup, validate every disposition path/digest/row exactly once, prove every audit-observed stable event ID has one resolved source-Queue-or-DLQ location and post-commit ACK outcome, and read back exact production CORS. Any expired pending session, incomplete conflict snapshot, unmatched/multiply located event, missing provider readback, stale receipt, or nonzero gate keeps maintenance active.

### Task 5: Start only the new generation

> **Corrective prerequisite:** Execute every task in `../2026-07-23-stage09-stable-release-fingerprint.md` before continuing this task. The corrective plan defines the canonical commit-derived heartbeat fingerprint and keeps the actual Docker image ID as separate deployment evidence.

**Files:**

- Modify: `docs/runbooks/image-upload-roll-forward.md`

- [ ] **Step 1: Start API and reconciler with presign disabled**

After all pre-deploy gates and a distinct protected startup approval pass, deploy the recorded release with presign disabled. Before deriving any identity, prove branch `main`, an empty `git status --porcelain --untracked-files=all`, and `HEAD == origin/main`. Keep the Docker image selector `BACKEND_IMAGE`, build provenance `IMAGE_UPLOAD_RELEASE_COMMIT`, and reconciler heartbeat identity `IMAGE_UPLOAD_BUILD_FINGERPRINT` separate. Set the build provenance to the exact lowercase full merged commit and compute the fingerprint with the version-1 no-newline helper; never derive either from a Docker tag or output image ID. The final image label `studio.nguyendinhthinh.image-upload.release-commit` must equal that commit. Start `backend` with role `api` and `images-upload-reconciler` with role `reconciler`. After startup, record the actual image ID separately as `release.imageDigest`, require API, migration, and reconciler containers to share it, and then collect the runtime evidence needed for the post-start production receipt. Require one API process with two permits for the initial rollout, exactly one advisory-lock owner on its dedicated `pg.Client`, a heartbeat whose `buildFingerprint` equals `release.releaseFingerprint`, heartbeat freshness newer than two cadences, and advancing completion timestamps for pending-session expiry, promotion recovery, temporary-session cleanup, `ImageObjectDeletion`, and rate-limit cleanup. No old image digest may be running.

- [ ] **Step 2: Verify process roles and secret isolation**

Read sanitized fingerprints and container secret mounts. Prove the API has no Queue/operator token, the reconciler has only its Queue token plus separate bucket-scoped R2 Object Read & Write credential, neither runtime role has the operator token, API/reconciler R2 credentials differ, and cutover credentials are no longer mounted.

- [ ] **Step 3: Run presign-disabled read-only checks**

While presign is disabled and general upload ingress remains blocked, verify health, schema, policy, maintenance 503, non-enumerating status/abandon authorization, provider configuration readbacks, HEAD of a pre-existing operator canary, Queue/DLQ depth, notification rule, signed imgproxy read variants, heartbeat/loop freshness, and serializer/log redaction. Do not PUT, COPY, DELETE, create an upload session, synthesize a Queue event, or ACK a smoke message in this phase. Build and independently approve the complete post-start production receipt only after the image label, all three role image IDs, reconciler environment fingerprint, database heartbeat fingerprint, and advancing five-loop evidence have been observed. The passing receipt/approval is required before Step 5.

- [ ] **Step 4: Deploy/purge the current frontend with ingress closed**

Deploy the new frontend, purge/expire old CDN assets and service workers, and verify its current bounded request shape from a non-mutating contract probe. Old shapes must receive `policy_refresh_required`; they are never translated. General upload ingress remains blocked.

- [ ] **Step 5: Enable presign behind operator-only smoke ingress**

Only after the protected post-start production receipt/approval passes, enable `IMAGE_UPLOAD_PRESIGN_ENABLED=true` on every API instance and verify the readback, but allowlist only the authenticated operator smoke identity/path at ingress. Run portrait, high-detail, dark/noisy, PNG, orientation, ICC, cancellation, response-loss, retry, late-COPY, canonical quoted/unquoted ETag, durable-promotion recovery, response-only settlement without an event, response-loss event settlement, duplicate-event state matrix, all three late-rejection conflict dispositions, presigned PUT header/key/expiry negatives, consumed/abandoned temporary cleanup timing, failed-promotion cleanup, and legitimate committed-result deletion cases. The response-loss retry must return the originally persisted whole-second `presignExpiresAt`; parse `X-Amz-Date + X-Amz-Expires` from both URLs and prove neither retry nor rounding extends that absolute instant, while a retry at/after expiry returns no URL and atomically terminalizes `failed/upload_expired`. From a real browser running on each allowed production admin origin, PUT with exactly `Content-Type` and require successful preflight/upload; a disallowed origin, wildcard-dependent origin, or extra request header must fail CORS.

Require:

- canonical bytes <= 5 MiB and exact digest;
- one Image and one promotion per current upload;
- every current dispatch has persisted digest, bytes, MIME, dimensions, policy, canonical source ETag, destination, lease, `copyDispatchedAt`, `lastDispatchAttemptAt`, and non-null `nextReconcileAt` before COPY;
- promotion `provider_settled + committed` remains committed after legitimate result deletion;
- user deletion is backed by matching idempotency tombstone plus `ImageObjectDeletion`, never `cleanup_required`;
- all six reconciler loops survive restart and remain idempotent;
- imgproxy variants render;
- source Queue, DLQ, unterminalized expired sessions, unresolved promotion, invalid response/event settlement, invalid conflict evidence, open promotion conflicts, open/resolving or invalid provider-event quarantine/location/action evidence, due/unverified temporary cleanup, invalid committed/rejected/legacy deletion authority, applicable R2 image-deletion backlog, non-R2 disposition errors, cutover backup/disposition/event-location mismatches, and production CORS mismatches return zero;
- no sensitive logs;
- optional browser diagnostics, when run, use the deterministic generated fixture rather than `0W9A1500.jpg` and retain their absolute and relative memory results separately from admission evidence.

- [ ] **Step 6: Open general upload ingress**

Record the operator-only acceptance receipt, repeat every zero gate after one Queue visibility timeout, verify the three required CI contexts on the deployed commit, and only then remove the operator allowlist/open general upload ingress. If any gate changes, disable presign and keep ingress closed.

- [ ] **Step 7: Add the uploads lifecycle fallback**

After general ingress is open and all active/promotion/Queue/object-deletion gates remain zero, add/read back a 24-hour lifecycle rule for `uploads/` only. Verify `albums/` is excluded.

### Task 6: Drill roll-forward incident recovery

**Files:**

- Modify: `docs/runbooks/image-upload-roll-forward.md`

- [ ] **Step 1: Simulate a new-version failure**

Disable presign on every API instance and block ingress. Do not deploy the old frontend or old backend. Capture sanitized active-upload, promotion, Queue/DLQ, role, replica, and heartbeat evidence.

- [ ] **Step 2: Preserve only proven-safe background work**

Keep status/reconciliation/cleanup running only if role health, the dedicated advisory-lock connection, singleton heartbeat, all six bounded-loop timestamps, role-separated R2/Queue credentials, provider readback, and database invariants pass. Otherwise stop the affected new role while retaining Queue messages.

- [ ] **Step 3: Deploy a corrected forward image**

Build a new immutable digest, apply only forward-compatible migrations, and start the corrected new API/reconciler with presign disabled. Rerun only the presign-disabled read-only checks first; do not PUT/COPY/DELETE or generate Queue events while general ingress is blocked.

- [ ] **Step 4: Run mutating acceptance behind operator-only ingress**

Enable presign only after read-only checks pass, keep general ingress blocked, allowlist the authenticated operator smoke identity/path, and rerun the complete upload/Queue/cleanup/imgproxy acceptance suite. Include fixed-absolute-expiry response-loss retries, exact production CORS readback, real allowed/disallowed cross-origin PUTs, and both destination-condition and source-condition 412 cases; the latter must reach `dispatch_rejected + not_created` only with complete evidence and no canonical DeleteObject. Exercise the durable late-event conflict CLI and require zero unterminalized expired sessions, invalid response/event settlement, incomplete conflict evidence, open conflicts, open/resolving or invalid provider-event quarantine/location/action evidence, due/unverified terminal temporary cleanup, invalid committed/rejected/legacy deletion authority, unresolved provider-event quarantine, unresolved critical promotions, cutover backup/disposition/event-location mismatches, production CORS mismatch, source Queue/DLQ backlog, and unresolved applicable R2 `ImageObjectDeletion`, plus healthy dedicated lock/heartbeat/six-loop progress, correct actual replica budget, and all three required CI contexts.

- [ ] **Step 5: Reopen general ingress**

Repeat the zero gates after one Queue visibility timeout, record the corrected-build receipt, and only then remove the operator allowlist. Any regression disables presign and keeps general ingress blocked.

Expected: incident recovery completes without starting any prior application generation.

### Task 7: Capture acceptance evidence and commit the runbook

- [ ] **Step 1: Store sanitized evidence**

Store counts, policy hash, the exact merged commit, its recomputed release fingerprint, the separate actual image digest, migration checksum, ruleset-by-ID result for all three contexts, provider resource/consumer/rule/CORS readbacks, role-separated Queue and bucket-scoped R2 credential fingerprints matching the production receipt schema plus application prefix/operation canaries, dedicated lock owner and six-loop heartbeat evidence, actual replica count, fixed-absolute-expiry retry evidence, real-browser allowed/disallowed CORS results, response/event settlement counts, unterminalized-expired/conflict-evidence/temporary-cleanup zero gates, protected disposition path/digests, audit-observed source-Queue-or-DLQ locations and post-commit ACK outcomes, exact quiesced-backup binding, operator-only smoke results, protected bridge audit/apply receipt plus distinct approval digest, and roll-forward drill decision. Optional stable-Chrome and memory diagnostic results, if collected, remain separate from admission evidence.

- [ ] **Step 2: Run final documentation checks**

```powershell
if ([string]::IsNullOrWhiteSpace($env:IMAGE_UPLOAD_PRODUCTION_GATE_RECEIPT)) {
    throw "IMAGE_UPLOAD_PRODUCTION_GATE_RECEIPT must be an absolute operator receipt path"
}
if ([string]::IsNullOrWhiteSpace($env:IMAGE_UPLOAD_PRODUCTION_GATE_APPROVAL)) {
    throw "IMAGE_UPLOAD_PRODUCTION_GATE_APPROVAL must be a distinct absolute operator approval path"
}
if ([string]::IsNullOrWhiteSpace($env:IMAGE_UPLOAD_PRODUCTION_STARTUP_APPROVAL)) {
    throw "IMAGE_UPLOAD_PRODUCTION_STARTUP_APPROVAL must be the third distinct absolute startup approval path"
}
node scripts/verify-image-upload-production-gates.mjs --receipt $env:IMAGE_UPLOAD_PRODUCTION_GATE_RECEIPT --approval $env:IMAGE_UPLOAD_PRODUCTION_GATE_APPROVAL --startup-approval $env:IMAGE_UPLOAD_PRODUCTION_STARTUP_APPROVAL
git diff --check
git status --short
```

Expected: every required receipt is present, no destructive provider action lacks an operator receipt, and only planned files are changed.

- [ ] **Step 3: Commit**

```powershell
git add apps/backend/src/scripts/image-upload-cutover.ts apps/backend/src/scripts/image-upload-cutover.spec.ts apps/backend/src/images/image-upload-cutover.service.ts apps/backend/src/images/image-upload-cutover.service.spec.ts apps/backend/test/image-upload-cutover.integration-spec.ts apps/backend/package.json apps/backend/Dockerfile docs/runbooks/image-upload-roll-forward.md scripts/verify-image-upload-production-gates.mjs scripts/schemas scripts/fixtures package.json
git commit -m "docs(images): add cold cutover and roll-forward gates"
```
