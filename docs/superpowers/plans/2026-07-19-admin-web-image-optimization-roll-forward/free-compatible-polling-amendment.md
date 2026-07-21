# Free-Compatible R2 Polling Amendment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Workers Paid R2 Event Notification and Cloudflare Queue/DLQ settlement path with response-first CopyObject settlement plus exact R2 HEAD polling after 30 seconds.

**Architecture:** `ImageUploadPromotion` remains the only durable promotion work ledger. Normal CopyObject responses commit immediately; ambiguous outcomes become due after 30 seconds and the singleton reconciler polls R2 every five seconds, accepting only a destination whose ETag, bytes, MIME, digest, dimensions, promotion ID, and policy metadata all match. There is no generic outbox, provider-event quarantine, Queue, DLQ, consumer, event rule, or Queue credential.

**Tech Stack:** NestJS, Prisma/PostgreSQL, AWS SDK S3-compatible R2 client, Jest, Docker Compose, GitHub Actions.

---

## Authority and stage placement

This amendment is normative for Stages 03, 04, 05, 08, and 09. In those stage files, any older instruction that provisions, reads, consumes, acknowledges, retries, quarantines, replays, audits, or verifies Cloudflare Queue/DLQ/provider-event resources is superseded and must not be executed. Existing checked boxes remain historical implementation evidence; the replacement tasks below must be completed and checked before the affected stage gate is considered current.

Stages 01, 02, 06, and 07 remain valid. The word “queue” in Stage 07 means the browser's local upload work queue, not Cloudflare Queues.

## File responsibility map

- `apps/backend/prisma/schema.prisma` and the feature migration: destination-HEAD evidence, five-loop heartbeat, polling conflict evidence; remove provider-event/quarantine schema.
- `apps/backend/src/images/image-upload-promotion.repository.ts`: closed response-or-HEAD settlement transactions and due scans.
- `apps/backend/src/images/image-upload-promotion-recovery.service.ts`: 30-second grace, exact HEAD verification, conditional retry, conflict opening.
- `apps/backend/src/images/image-upload-reconciler.service.ts`: five bounded loops and five-second cadence; no Queue consumer.
- `apps/backend/src/images/storage.service.ts`: HEAD returns exact size/MIME/metadata required for verification.
- `apps/backend/src/images/image-upload-runtime-config.ts`: reject obsolete Queue/event inputs and require only role-appropriate R2 inputs.
- `apps/backend/test/staging-resource-contract.ts`: free-compatible R2/CORS/identity contract.
- `apps/backend/test/run-image-upload-staging.ts`: real CopyObject, response-loss polling, conflict, imgproxy, and exact-prefix cleanup.
- `.github/workflows/image-upload-ci.yml`: protected manual staging job without Queue/event secrets or variables.
- `docs/runbooks/image-upload-staging-resources.md`: R2-only setup and post-migration Queue/DLQ deletion reminder.
- Stage 09 cutover scripts/tests/runbooks: remove event receipts and Queue drain gates; prove polling twice across a 30-second barrier.

### Task A1: Stage 03 — replace provider-event schema with polling evidence

**Files:**
- Modify: `apps/backend/test/image-upload-schema.integration-spec.ts`
- Modify: `apps/backend/prisma/schema.prisma`
- Modify: the existing feature migration under `apps/backend/prisma/migrations/`
- Modify: `apps/backend/src/images/image-upload-promotion.repository.spec.ts`
- Modify: `apps/backend/src/images/image-upload-promotion.repository.ts`

- [x] **Step 1: Make the schema contract describe only response-or-HEAD evidence**

Require these promotion fields and remove assertions for provider events, quarantine/location/action/resolution tables, Queue IDs, and replay IDs:

```ts
const pollingEvidenceFields = [
  'destinationHeadObservedAt',
  'destinationHeadEtag',
  'destinationHeadBytes',
  'destinationHeadMime',
  'destinationHeadMetadataSha256',
];

const heartbeatFields = [
  'pendingSessionExpiryCompletedAt',
  'promotionRecoveryCompletedAt',
  'temporaryCleanupCompletedAt',
  'imageDeletionCompletedAt',
  'rateLimitCleanupCompletedAt',
];
```

- [x] **Step 2: Run the focused schema test and observe the Queue-era schema failure**

Run:

```powershell
npm run test:integration --workspace=backend -- --runTestsByPath test/image-upload-schema.integration-spec.ts
```

Expected: FAIL because destination-HEAD evidence is absent and provider-event/quarantine fields still exist.

- [x] **Step 3: Migrate the model to closed polling evidence**

Implement paired/null-safe destination HEAD fields. `provider_settled` must have exactly one or both matching branches:

```text
copyResponseObservedAt + copyResponseEtag
destinationHeadObservedAt + destinationHeadEtag + destinationHeadBytes
  + destinationHeadMime + destinationHeadMetadataSha256
```

Remove provider-event identity fields, provider-event partial indexes, Queue/DLQ/replay columns, and provider-event quarantine models. Change `ImageUploadReconcilerHeartbeat` to the five timestamps above. Adapt `ImageUploadPromotionConflict` to destination mismatch evidence with resolution `confirmed_absent | cleanup_authorized | committed_authorized`.

- [x] **Step 4: Write failing repository tests for HEAD settlement and 30-second rejection barrier**

Cover:

```ts
await repository.settleDestinationHeadAndCommit({
  promotionId,
  expectedState: 'dispatched',
  destinationEtag,
  destinationBytes,
  destinationMime,
  destinationMetadataSha256,
  observedAt,
});
```

Assert a mismatched ETag or metadata hash cannot commit, and `dispatch_rejected + not_created` requires two absent observations at least 30 seconds apart.

- [x] **Step 5: Implement the minimal repository transactions and rerun focused tests**

Run:

```powershell
npm test --workspace=backend -- --runInBand --runTestsByPath src/images/image-upload-promotion.repository.spec.ts
npm run test:integration --workspace=backend -- --runTestsByPath test/image-upload-schema.integration-spec.ts
```

Expected: PASS with no provider-event/quarantine schema or repository API.

### Task A2: Stage 04 — close role configuration without Queue credentials

**Files:**
- Modify: `apps/backend/src/images/image-upload-runtime-config.spec.ts`
- Modify: `apps/backend/src/images/image-upload-runtime-config.ts`
- Modify: `apps/backend/src/images/images.module.ts`
- Modify: `docker-compose.yml`

- [x] **Step 1: Write failing role-secret tests**

Require API, reconciler, and cutover to reject these obsolete inputs when non-empty:

```text
IMAGE_UPLOAD_QUEUE_TOKEN
IMAGE_UPLOAD_CUTOVER_QUEUE_TOKEN
NDT_STAGING_QUEUE_TOKEN
NDT_STAGING_CUTOVER_QUEUE_TOKEN
NDT_STAGING_EVENT_RULE_ID
NDT_PRODUCTION_EVENT_RULE_ID
```

Reconciler requires only database, its bucket-scoped R2 credential, `IMAGE_UPLOAD_RECONCILE_GRACE_MS=30000`, and `IMAGE_UPLOAD_RECONCILE_CADENCE_MS=5000`.

- [x] **Step 2: Run the focused config test and observe failure**

Run:

```powershell
npm test --workspace=backend -- --runInBand src/images/image-upload-runtime-config.spec.ts
```

- [x] **Step 3: Remove Queue providers/config and rerun**

Delete Queue client injection from runtime modules and Compose. Keep the cutover operator token isolated from API/reconciler. Expected focused test: PASS.

### Task A3: Stage 05 — implement exact destination polling recovery

**Files:**
- Delete: `apps/backend/src/images/cloudflare-queue.client.ts`
- Delete: `apps/backend/src/images/cloudflare-queue.client.spec.ts`
- Modify: `apps/backend/src/images/storage.service.spec.ts`
- Modify: `apps/backend/src/images/storage.service.ts`
- Modify: `apps/backend/src/images/image-upload-promotion-recovery.service.spec.ts`
- Modify: `apps/backend/src/images/image-upload-promotion-recovery.service.ts`
- Modify: `apps/backend/src/images/image-upload-reconciler.service.spec.ts`
- Modify: `apps/backend/src/images/image-upload-reconciler.service.ts`
- Modify: `apps/backend/test/image-upload-settlement.integration-spec.ts`
- Modify: `apps/backend/package.json`
- Remove provider-event/quarantine services and resolver scripts that have no non-event responsibility.

- [x] **Step 1: Write failing exact-HEAD tests**

The storage HEAD result must expose this closed shape:

```ts
type PromotionHeadEvidence = {
  etag: string;
  bytes: number;
  contentType: string;
  metadata: {
    promotionId: string;
    inspectedSha256: string;
    width: string;
    height: string;
    policyVersion: string;
  };
};
```

Test missing, duplicated, malformed, or mismatched metadata; none may settle or authorize deletion.

- [x] **Step 2: Write failing response-loss recovery tests**

Use a fake clock. Assert no HEAD before 30 seconds, the row is selected at exactly 30 seconds, and a five-second scan cadence observes it by 35 seconds. Cover exact destination settlement, absent destination conditional retry, mismatched destination conflict, crash-before-COPY recovery, and restart idempotency.

- [x] **Step 3: Run focused tests and observe Queue-era failures**

Run:

```powershell
npm test --workspace=backend -- --runInBand --runTestsByPath src/images/storage.service.spec.ts src/images/image-upload-promotion-recovery.service.spec.ts src/images/image-upload-reconciler.service.spec.ts
npm run test:integration --workspace=backend -- --runTestsByPath test/image-upload-settlement.integration-spec.ts
```

- [x] **Step 4: Implement response-first plus HEAD settlement**

CopyObject writes the exact metadata from the durable promotion. The recovery loop:

```text
due dispatched row
→ HEAD destination
→ exact evidence: settle and commit
→ absent: HEAD source and bounded conditional COPY retry
→ mismatched: append/open conflict; no COPY/DELETE
```

Keep API immediate response settlement unchanged. Remove Queue settlement, ACK, replay, DLQ, and provider-event quarantine paths.

- [x] **Step 5: Reduce the reconciler to five bounded loops**

The singleton heartbeat must advance only pending expiry, promotion recovery, temporary cleanup, image deletion, and rate-limit cleanup. Lock loss aborts every R2 operation.

- [x] **Step 6: Rerun focused and full backend gates**

Run:

```powershell
npm test --workspace=backend -- --runInBand
npm run test:e2e --workspace=backend -- --runInBand
npm run test:integration --workspace=backend
npm run build --workspace=backend
```

Expected: PASS and `rg -n "cloudflare-queue|QUEUE_TOKEN|providerEvent|quarantine|DLQ" apps/backend/src apps/backend/test` returns no provider-settlement dependency.

### Task A4: Stage 08 — qualify free-compatible staging

**Files:**
- Modify: `apps/backend/src/images/staging-resource-contract.spec.ts`
- Modify: `apps/backend/test/staging-resource-contract.ts`
- Modify: `apps/backend/test/run-image-upload-staging.integration-spec.ts`
- Modify: `apps/backend/test/run-image-upload-staging.ts`
- Modify: `.github/workflows/image-upload-ci.yml`
- Modify: `docs/runbooks/image-upload-staging-resources.md`

- [x] **Step 1: Replace the staging resource contract**

Remove Queue/DLQ names, IDs, consumers, event-rule IDs, and Queue tokens from the 33-input contract. Require only account, staging/deny-canary/production bucket identities, R2 endpoints, exact CORS, four role-separated staging R2 credential pairs, production access-key IDs for identity inequality, operator token, and Cloudflare read token.

- [x] **Step 2: Write failing orchestrator tests for polling recovery**

Require `uploads/staging/{runId}/` and `albums/staging/{runId}/`, response-loss simulation, no HEAD settlement before 30 seconds, exact settlement by the next cadence, mismatch conflict, and `finally` cleanup of both prefixes.

- [x] **Step 3: Implement the protected manual staging job**

Keep `workflow_dispatch`, protected `staging` environment, `image-upload-staging` concurrency, and `if: always()` cleanup. Remove all Queue/event variables and secrets. The staging job must never write outside the exact run prefixes.

- [x] **Step 4: Run sanitized preflight and local verification**

Run:

```powershell
npm test --workspace=backend -- --runInBand src/images/staging-resource-contract.spec.ts test/run-image-upload-staging.integration-spec.ts
npm run verify:image-upload-workflow
npm run build --workspace=backend
git diff --check
```

- [x] **Step 5: Run live staging only after explicit mutation approval**

Prove real R2 PUT/COPY/HEAD/DELETE, response-loss polling recovery, create-only overwrite denial, allowed/denied CORS, imgproxy rendering, and exact cleanup. Store only sanitized receipt hashes and IDs.

Fresh evidence: GitHub Actions run `29847372686` on commit `1b1f04a31ce706da4d5b850187a04f29c5387854` completed all four jobs successfully. Its sanitized provider evidence recorded `deny=4/4`, create-only denial, exact response-loss HEAD settlement after 31,407 ms, allowed/denied CORS, read-only imgproxy rendering, and successful idempotent cleanup.

- [x] **Step 6: Mark the Queue deletion reminder ready**

After repository/workflow scans show no runtime dependency and live staging passes, instruct the account operator to delete:

```text
ndt-studio-image-upload-staging
ndt-studio-image-upload-staging-dlq
```

Never delete them earlier; this step requires a fresh zero-reference scan.

Fresh scan classification: remaining Queue/Event Notification strings are limited to fail-closed obsolete-variable guards and their tests, schema-absence assertions, and explicit historical/removal documentation. No active runtime, workflow, deployment, or provider-settlement dependency remains.

### Task A5: Stage 09 — cut over with polling gates

**Files:**
- Modify: Stage 09 cutover scripts and tests listed in `09-production-cold-cutover-and-roll-forward.md`
- Modify: production deployment/runbook configuration

- [ ] **Step 1: Remove provider-event receipt fields and Queue drain gates**

Cutover receipts retain database/R2 HEAD evidence, protected row dispositions, conflict resolution evidence, backup bindings, and object-deletion authority. Remove provider event IDs, Queue locations, message/lease IDs, ACK/replay evidence, Queue tokens, and event-rule readback.

- [ ] **Step 2: Make legacy audit R2-read-only**

Audit reads exact legacy-schema rows, Image references, and destination HEAD evidence. It performs no database mutation and no R2 PUT/COPY/DELETE. Ambiguous rows still require protected `committed_authorized | cleanup_authorized` dispositions.

- [x] **Step 3: Require two zero-backlog polling snapshots**

Before ingress, require zero unresolved promotions, invalid response/HEAD settlement, open conflicts, due temporary cleanup, applicable image deletion, invalid legacy authority, and CORS mismatch twice, at least 30 seconds apart.

- [ ] **Step 4: Exercise operator-only response-loss acceptance**

Run one real upload whose CopyObject response is deliberately hidden from the application, require `finalizing`, then require exact HEAD settlement within 30–35 seconds and an unchanged destination on retry.

- [ ] **Step 5: Run the complete Stage 09 rehearsal and production gates**

Production mutation still requires the explicit approvals already required by Stage 09. No old binary starts after migration; failures roll forward only.

### Task A6: Plan and repository consistency gate

- [x] **Step 1: Verify no normative Queue/Event Notification dependency remains**

Run:

```powershell
rg -n -i "NDT_.*QUEUE|IMAGE_UPLOAD_.*QUEUE|EVENT_RULE_ID|providerEvent|cloudflare-queue|DLQ|event notification" apps .github scripts docker-compose.yml docs/runbooks
```

Expected: no active runtime, workflow, deployment, runbook procedure, or provider-settlement dependency. Matches may remain only in fail-closed obsolete-variable guards and their tests, schema-absence assertions, and explicit historical/supersession/removal text.

- [x] **Step 2: Run repository verification**

Run all Stage 08 Task 6 gates, Docker rebuilds, Compose verification, workflow/ruleset verifiers, and `git diff --check`.

- [x] **Step 3: Tick replacement tasks immediately after fresh evidence**

Do not reuse Queue-era test results. Each task above is checked only after its polling-specific command passes.
