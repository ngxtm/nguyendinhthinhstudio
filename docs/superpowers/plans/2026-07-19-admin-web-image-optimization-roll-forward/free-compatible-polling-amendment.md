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
- Modify: `scripts/schemas/image-upload-production-evidence.schema.json`
- Modify: production verifier fixtures/tests and deployment/runbook configuration

#### Task A5.0: Use a provider-correct credential for production CORS readback

Cloudflare bucket-scoped Object Read/Object Read & Write credentials support object data-plane operations but reject bucket configuration reads such as `GetBucketCors`. Preserve the bucket-scoped `ndt-prod-cutover-rw` credential for HEAD/LIST/COPY/DELETE and add a distinct temporary account-scoped R2 Admin Read Only credential, exposed only to the cutover role as `IMAGE_UPLOAD_CUTOVER_R2_CONFIG_READ_ACCESS_KEY_ID` and `IMAGE_UPLOAD_CUTOVER_R2_CONFIG_READ_SECRET_ACCESS_KEY`.

Provider evidence on 2026-07-22 reproduced the boundary with the production cutover credential: PostgreSQL read passed, R2 object LIST passed, and `GetBucketCors` failed with HTTP 403 `AccessDenied`. No audit receipt was created and no production mutation occurred.

- [ ] **Step 1: Write failing role-isolation and client-routing tests**

Require cutover configuration to fail closed without the two config-read variables. Require API and reconciler configuration to reject them. Prove object commands use only the bucket-scoped data-plane client and `GetBucketCors` uses only the config-read client.

- [ ] **Step 2: Implement the separate read-only CORS client**

Create a second S3 client only in the one-shot cutover entrypoint. Pass it solely to the CORS readback path, keep all object operations on the existing cutover client, and destroy both clients on exit. Extend the closed production evidence schema with `cutoverR2ConfigReadCredentialFingerprintSha256`; require it to differ from every data-plane fingerprint and expose no credential value.

- [ ] **Step 3: Verify provider behavior and revocation contract**

Require the bucket-scoped credential to pass object LIST/HEAD and fail `GetBucketCors`; require the temporary Admin Read Only credential to pass `GetBucketCors` and fail an object/bucket write canary. Never mount the config-read credential into API, reconciler, or imgproxy. Revoke it after Stage 09 acceptance and record only its fingerprint plus revocation evidence.

- [x] **Step 1: Remove provider-event receipt fields and Queue drain gates**

Cutover receipts retain database/R2 HEAD evidence, protected row dispositions, conflict resolution evidence, backup bindings, and object-deletion authority. Remove provider event IDs, Queue locations, message/lease IDs, ACK/replay evidence, Queue tokens, and event-rule readback.

Fresh evidence: commits `c6f2a95`, `a115c81`, and `d9c1189` implement the polling-only cutover command. Its closed receipt/CLI contract contains no provider-event, Queue, DLQ, ACK, replay, consumer, event-rule, or Queue-token field; obsolete Queue/event configuration remains fail-closed elsewhere.

- [x] **Step 2: Make legacy audit R2-read-only**

Audit reads exact legacy-schema rows, Image references, and destination HEAD evidence. It performs no database mutation and no R2 PUT/COPY/DELETE. Ambiguous rows still require protected `committed_authorized | cleanup_authorized` dispositions.

Fresh evidence: the exact PostgreSQL legacy projection and R2 HEAD-only audit passed focused unit and Testcontainers integration coverage. Apply is separately schema-preflighted before mutation; protected disposition/audit/evidence/backup paths and digests are revalidated before any post-migration action.

- [x] **Step 3: Require two zero-backlog polling snapshots**

Before ingress, require zero unresolved promotions, invalid response/HEAD settlement, open conflicts, due temporary cleanup, applicable image deletion, invalid legacy authority, and CORS mismatch twice, at least 30 seconds apart.

#### Task A5.1: Stage 09 Task 2 — polling-only production verifier and runbook

**Files:**

- Create: `docs/runbooks/image-upload-roll-forward.md`
- Create: `scripts/verify-image-upload-production-gates.mjs`
- Create: `scripts/schemas/image-upload-production-evidence.schema.json`
- Create: `scripts/fixtures/image-upload-production-gates/pass.json`
- Create: polling-specific independent fail fixtures under `scripts/fixtures/image-upload-production-gates/fail/`
- Modify: `package.json` and `package-lock.json` for direct Ajv/Ajv-formats dependencies

- [x] **Step 1: Define the closed polling-only evidence schema**

Require release, authoritative pre/post backup bindings, API/reconciler/cutover role fingerprints, actual replica/permit/singleton-heartbeat evidence, bucket/CORS/role-separated R2 readback, exact `reconcileGraceMs=30000` and `reconcileCadenceMs=5000` readback, protected cutover audit/disposition bindings, two polling snapshots at least 30 seconds apart, exact CI contexts, deterministic manual-memory evidence, staging receipt, operator-smoke receipt, and roll-forward decision. Every object rejects unknown fields. No Queue, DLQ, consumer, event-rule, provider-event, ACK, replay, or Queue-token field is allowed.

- [x] **Step 2: Add one independent fail fixture per polling gate**

Cover expired pending uploads, unresolved promotion, invalid response/HEAD settlement, invalid committed/cleanup authority, incomplete conflict evidence, open conflict, due/unverified temporary cleanup, unresolved/invalid R2 image deletion, invalid non-R2 disposition, legacy temporary source, backup/disposition/path drift, stale five-loop heartbeat, replica budget, CORS mismatch, snapshot barrier, missing CI context, and forbidden secret/object-key/ETag/URL material.

- [x] **Step 3: Implement the verifier and protected receipt/approval modes**

Validate JSON Schema before semantics; recompute canonical JSON hashes; bind exact canonical receipt/approval/audit/disposition paths and digests; enforce owner-only evidence permissions; accept production only through one explicit `--receipt <absolute-path> --approval <distinct-absolute-path>` mode or test-only `--fixture <repository-path>` with `NODE_ENV=test`; fail closed on multiple/implicit inputs.

- [x] **Step 4: Write the polling-only production runbook**

Document preparation, the standard no-new-upload ingress block or the spec-approved protected `maintenance_route_absent` exception, pre-migration read-only audit, migration/apply, two zero polling snapshots, new-role startup, operator-only response-loss acceptance, general-ingress gate, and roll-forward drill. The exception avoids provisioning a new maintenance Worker/rule only; it must prove maintenance-page state, deployed route absence, authenticated fail-closed canaries, and a stable absence interval covering the maximum legacy signed-PUT lifetime plus skew. Keep every production mutation behind the existing explicit approval gates.

- [x] **Step 5: Verify pass and all independent fail fixtures**

The pass fixture exits zero. Every fail fixture exits nonzero and names its intended gate. Run schema/verifier tests, `git diff --check`, and the relevant repository build before checking this task.

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
