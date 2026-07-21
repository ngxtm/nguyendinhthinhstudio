# Backend Policy and Session API Implementation Plan

> **Free-compatible amendment:** Execute Task A2 in `free-compatible-polling-amendment.md`. Queue/event credentials and providers mentioned below are historical and superseded; runtime configuration must reject them.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose current-version admin upload APIs with strict process-role configuration, ownership, idempotency, capacity control, and maintenance-mode behavior.

**Architecture:** The API process owns HTTP routes and R2 inspection/promotion credentials; the reconciler owns Queue consumption. A permanent idempotency record and tokenized live session make all retries deterministic. Legacy request shapes are rejected rather than translated.

**Tech Stack:** NestJS 11, Prisma 6, class-validator, PostgreSQL serializable transactions, Jest, Supertest.

---

### Task 1: Add policy and process-role configuration

**Files:**

- Create: `apps/backend/src/images/image-upload-policy.service.ts`
- Create: `apps/backend/src/images/image-upload-policy.service.spec.ts`
- Create: `apps/backend/src/images/image-upload-runtime-config.ts`
- Create: `apps/backend/src/images/image-upload-runtime-config.spec.ts`
- Modify: `apps/backend/src/images/images.module.ts`
- Modify: `apps/backend/src/main.ts`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Write failing policy and numeric-limit tests**

Assert the shared policy values, exact wire hash, sorted ICC digests, canonical MIME map, and rejection of unsafe cross-field values. Assert:

```text
IMAGE_UPLOAD_PROCESS_COUNT >= 1
IMAGE_UPLOAD_DECODE_PERMITS_PER_PROCESS >= 1
process count × permits <= 2
IMAGE_UPLOAD_R2_CONTROL_TIMEOUT_SECONDS integer 1..120
IMAGE_UPLOAD_R2_READ_TIMEOUT_SECONDS integer 1..120
IMAGE_UPLOAD_PRESIGN_ENABLED strict true|false
IMAGE_UPLOAD_PRESIGN_CLOCK_SKEW_SECONDS integer 0..300 (initial 60)
IMAGE_UPLOAD_RATE_LIMIT_CLEANUP_BATCH integer 100..10000 (initial 1000)
```

- [ ] **Step 2: Write failing process-role isolation tests**

Use this exact role contract:

```ts
type ImageUploadProcessRole = 'api' | 'reconciler' | 'cutover';
```

Assert:

- `api` requires database, R2 data-plane, imgproxy, policy, and presign configuration;
- `api` rejects canonical runtime secrets `IMAGE_UPLOAD_QUEUE_TOKEN`, `IMAGE_UPLOAD_CUTOVER_QUEUE_TOKEN`, and `IMAGE_UPLOAD_OPERATOR_TOKEN`, plus parent-only `NDT_STAGING_QUEUE_TOKEN`, `NDT_STAGING_CUTOVER_QUEUE_TOKEN`, and `NDT_STAGING_CF_READ_TOKEN`;
- `reconciler` requires database, a separate bucket-scoped R2 Object Read & Write credential for HEAD/COPY/DELETE, account ID, Queue ID, DLQ ID, source HTTP consumer ID, DLQ inspection consumer ID, bucket, prefix, and `IMAGE_UPLOAD_QUEUE_TOKEN`;
- `reconciler` rejects `IMAGE_UPLOAD_CUTOVER_QUEUE_TOKEN`, `IMAGE_UPLOAD_OPERATOR_TOKEN`, `NDT_STAGING_QUEUE_TOKEN`, `NDT_STAGING_CUTOVER_QUEUE_TOKEN`, `NDT_STAGING_CF_READ_TOKEN`, and the API presigning credential;
- `cutover` is the only role allowed to receive `IMAGE_UPLOAD_CUTOVER_QUEUE_TOKEN`, `IMAGE_UPLOAD_OPERATOR_TOKEN`, and its dedicated R2 credential; it rejects `IMAGE_UPLOAD_QUEUE_TOKEN`, the API/reconciler credentials, and all staging parent variable names;
- Queue and DLQ IDs differ;
- canonical prefix is exactly `albums/` in production;
- placeholders, cross-environment values, unknown roles, and any forbidden variable for the selected role fail startup before a listener or provider call. Tests enumerate the exact forbidden-variable set, including the actual `NDT_STAGING_CF_READ_TOKEN` spelling.

- [ ] **Step 3: Run focused tests and observe failure**

```powershell
npm test --workspace=backend -- image-upload-policy.service.spec.ts image-upload-runtime-config.spec.ts --runInBand
```

Expected: FAIL because policy and role-aware validation do not exist.

- [ ] **Step 4: Implement role-specific bootstraps**

`main.ts` boots only the API role. The scheduled script created in Stage 05 boots only the reconciler application context. The cutover script created in Stage 09 boots only cutover services. The conflict/quarantine resolvers created in Stage 05 must also require `IMAGE_UPLOAD_PROCESS_ROLE=cutover`, the operator token, `IMAGE_UPLOAD_CUTOVER_QUEUE_TOKEN`, explicit Queue/DLQ IDs, and dedicated cutover R2 credentials; neither resolver boots HTTP routes. Each entrypoint exposes a sanitized fingerprint containing role, non-secret IDs, policy hash, timeout values, process count, and permit count.

- [ ] **Step 5: Verify policy and role tests**

```powershell
npm test --workspace=backend -- image-upload-policy.service.spec.ts image-upload-runtime-config.spec.ts --runInBand
```

Expected: all policy, secret-isolation, and role tests PASS.

### Task 2: Implement current-only DTO and route contracts

**Files:**

- Modify: `apps/backend/src/images/dto/upload-request.dto.ts`
- Modify: `apps/backend/src/images/dto/upload-confirm.dto.ts`
- Create: `apps/backend/src/images/dto/upload-session-status.dto.ts`
- Create: `apps/backend/src/images/dto/upload-session-abandon.dto.ts`
- Modify: `apps/backend/src/images/images.controller.ts`
- Modify: `apps/backend/src/images/images.controller.spec.ts`
- Create: `apps/backend/src/images/image-upload-rate-limit.service.ts`
- Create: `apps/backend/src/images/image-upload-rate-limit.service.spec.ts`
- Create: `apps/backend/test/image-upload-rate-limit.integration-spec.ts`
- Modify: `apps/backend/test/images.e2e-spec.ts`

- [ ] **Step 1: Write failing route and rejection tests**

Cover authenticated admin-only policy, upload-url, confirm, status, and abandon routes. For an enabled route and an attempt admitted below the limit, a presign body missing `clientRequestId`, `processedSha256`, or `policyVersion` must return the closed `UploadErrorResponse` with `statusCode=409` and `code=policy_refresh_required`; it must not create a session. Once the route limit is reached, the same malformed attempt returns `upload_rate_limited` as specified by the admission order. A same-clientRequestId fingerprint/owner mismatch returns non-enumerating `statusCode=409` `upload_request_conflict` and never returns the existing record. Exhaustively cover `upload_invalid_request`, `upload_authentication_required`, `upload_admin_required`, non-enumerating `upload_not_found`, `upload_request_conflict`, `upload_capacity_exceeded`, `upload_rate_limited` with required absolute `retryAfter`, `upload_rate_limit_unavailable`, and `upload_presign_disabled`. No controller path emits an untyped code or switches on message text.

Use the PostgreSQL `ImageUploadRateLimitEvent` ledger keyed by immutable authenticated admin ID plus exact route scope. For each authenticated attempt, one serializable transaction takes `pg_advisory_xact_lock(hashtextextended(adminId || ':' || routeScope, 0))`, counts rows with `occurredAt > now-window`, rejects at the limit using `MIN(occurredAt)+window` as `retryAfter`, or inserts the current event. Initial operational limits are: upload-url 20/rolling 10 minutes, confirm 60/rolling 10 minutes, status 120/rolling minute, and abandon 30/rolling 10 minutes. Every authenticated attempt admitted below the limit inserts one event before later validation/business logic, even when that later work rejects; an attempt already over limit does not insert or extend the window. Isolate admins and routes, and return the ledger's absolute RFC 3339 reset instant. IP is telemetry only; honor forwarded IP only from the explicit trusted-proxy allowlist and never use it as the admission identity. Database timeout/unavailability returns HTTP 503 `upload_rate_limit_unavailable`; it never admits on failure or falls back to process memory. A bounded maintenance query deletes at most `IMAGE_UPLOAD_RATE_LIMIT_CLEANUP_BATCH` rows older than ten minutes; the reconciler's rate-limit cleanup loop owns this query and records its completion timestamp/failed count in the heartbeat. Fake-clock/PostgreSQL integration tests prove concurrent atomic admission, admin/route isolation, exact boundary/reset, retryAfter, cleanup ownership, store failure, and untrusted-proxy behavior.

Required request validation:

```text
clientRequestId: UUID
policyVersion: exact current wire version
processedSha256: lowercase 64 hex
contentType: canonical allowlist
fileSize: positive integer <= 5242880
filename: normalized safe basename
albumId: UUID
unknown properties: rejected
```

- [ ] **Step 2: Run focused tests and observe failure**

```powershell
npm test --workspace=backend -- images.controller.spec.ts image-upload-rate-limit.service.spec.ts --runInBand
npm run test:integration --workspace=backend -- image-upload-rate-limit.integration-spec.ts
npm run test:e2e --workspace=backend -- images.e2e-spec.ts --runInBand
```

Expected: FAIL because current-only routes and closed errors are incomplete.

- [ ] **Step 3: Implement strict DTOs and maintenance gating**

When `IMAGE_UPLOAD_PRESIGN_ENABLED=false`, authenticated/authorized `POST /images/upload-url` returns HTTP 503 `upload_presign_disabled` before rate-limit admission, capacity, idempotency ledger, session, or signing work. With presign enabled, the route order is rate-limit admission, strict shape/current-policy validation, idempotency/fingerprint/owner checks, capacity, session transaction, and signing. Policy, status, confirm, abandon, cleanup, and reconciliation remain separately available for controlled draining.

- [ ] **Step 4: Verify route contracts**

```powershell
npm test --workspace=backend -- images.controller.spec.ts image-upload-rate-limit.service.spec.ts --runInBand
npm run test:integration --workspace=backend -- image-upload-rate-limit.integration-spec.ts
npm run test:e2e --workspace=backend -- images.e2e-spec.ts --runInBand
```

Expected: authorization, strict-shape, policy-refresh, and maintenance tests PASS; the Testcontainers integration spec uses at least two independent PostgreSQL connections and proves exact-window admission, advisory-lock serialization, admin/route isolation, fail-closed store errors, and bounded cleanup against a real database.

### Task 3: Implement ownership, quota, and idempotent presign

**Files:**

- Create: `apps/backend/src/images/image-upload-fingerprint.ts`
- Create: `apps/backend/src/images/image-upload-fingerprint.spec.ts`
- Create: `apps/backend/src/images/image-upload-presign-expiry.ts`
- Create: `apps/backend/src/images/image-upload-presign-expiry.spec.ts`
- Modify: `apps/backend/src/images/storage.service.ts`
- Modify: `apps/backend/src/images/storage.service.spec.ts`
- Modify: `apps/backend/src/images/images.service.ts`
- Modify: `apps/backend/src/images/images.service.spec.ts`
- Modify: `apps/backend/test/image-concurrency.integration-spec.ts`

- [ ] **Step 1: Write failing request-fingerprint and concurrency tests**

The fingerprint is SHA-256 over canonical JSON containing:

```ts
const fingerprintInput = {
    clientRequestId,
    createdByAdminId,
    albumId,
    normalizedFilename,
    canonicalMime,
    fileSize,
    processedSha256,
    policyVersion,
};
```

Cover same-key/same-fingerprint retry, same-key/different-fingerprint conflict, two simultaneous requests for one clientRequestId, 49/50 album admission, expired pending excluded from reservations, unexpired pending included, stale and fresh finalizing both included until Stage 05 reclaims or terminalizes them, bounded P2034 retries with no duplicate session, authenticated route throttling, response loss before the client receives the URL, repeated re-signing at several clock instants, retry exactly at/after expiry, signing failure, and the absence of any invented daily/per-admin quota. Parse every returned URL and assert `X-Amz-Date + X-Amz-Expires = persisted presignExpiresAt`, `X-Amz-Expires <= 3600`, and retries never move that absolute instant.

- [ ] **Step 2: Run focused tests and observe failure**

```powershell
npm test --workspace=backend -- image-upload-fingerprint.spec.ts image-upload-presign-expiry.spec.ts storage.service.spec.ts images.service.spec.ts --runInBand
npm run test:integration --workspace=backend -- image-concurrency.integration-spec.ts
```

Expected: FAIL before fingerprint and ledger behavior exist.

- [ ] **Step 3: Implement serializable admission**

In one serializable transaction:

1. Re-read the album and deletion state.
2. Insert or lock the idempotency record.
3. Reject a fingerprint or owner mismatch with non-enumerating `upload_request_conflict` and never return the existing record.
4. Count completed images plus active session reservations for this album, where active is exactly an unexpired `pending` row or any `finalizing` row regardless of lease age. Never release a stale-finalizing reservation in admission code; only the Stage 05 reclaim/terminalization CAS may do that.
5. Require the sum, including the candidate reservation, to remain at most 50. Run the transaction through the repository's bounded serializable-retry helper; an exhausted serialization retry creates no ledger/session/signing side effect and must not be misreported as album capacity.
6. Truncate the transaction clock to a whole UTC second, create exactly one `ImageUpload` with owner, current policy snapshot, digest, upload key, final key, and immutable `presignExpiresAt=expiresAt=issuedSecond+3600 seconds`.

After the transaction, `signFixedExpiryPut` truncates its injected current clock to a whole second, calculates `remainingSeconds=(presignExpiresAt-now)/1000`, requires an integer in `1..3600`, and passes both `signingDate=now` and `expiresIn=remainingSeconds` to the presigner. Every retry reuses the persisted timestamp; it never writes a later expiry. At or after expiry, atomically terminalize the still-pending owned session as `failed/upload_expired`, enter durable temporary cleanup, and return no URL. Parse the generated query and fail closed unless its effective expiry equals the persisted timestamp.

Generate the presigned URL after the transaction and return the persisted expiry used by the signer. Unit/integration tests inspect the signed request and prove wrong Content-Length, wrong Content-Type, a missing/changed signed required header, a different object key, and an expired URL are rejected without session promotion. If the provider cannot enforce any claimed signed constraint, staging must fail closed and the contract must be reconciled before implementation proceeds. If signing fails after the session transaction, conditionally CAS only the still-`pending` session owned by the same admin to `failed/upload_presign_failed`, enter durable temporary cleanup, atomically store the idempotency `terminalOutcome` and `failureCode='upload_presign_failed'`, and return the closed failed `PresignResponse` without exposing the provider error. A zero-count CAS re-reads and returns the concurrent retry winner's closed outcome; never overwrite or delete a winner created by another retry.

- [ ] **Step 4: Verify concurrency and idempotency**

```powershell
npm test --workspace=backend -- image-upload-fingerprint.spec.ts image-upload-presign-expiry.spec.ts storage.service.spec.ts images.service.spec.ts --runInBand
npm run test:integration --workspace=backend -- image-concurrency.integration-spec.ts
```

Expected: exactly one session and stable outcome per clientRequestId; every ready retry may return a newly signed URL but its effective absolute expiry is unchanged and no URL is returned at/after expiry.

### Task 4: Implement status and abandonment

**Files:**

- Modify: `apps/backend/src/images/images.service.ts`
- Modify: `apps/backend/src/images/images.service.spec.ts`
- Modify: `apps/backend/test/images.e2e-spec.ts`

- [ ] **Step 1: Write failing state and ownership tests**

Cover:

- status for `pending`, `finalizing`, `consumed`, `failed`, `gone`, `deleted`, and `unavailable` results;
- consumed responses replay the same persisted `retentionExpiresAt=terminalAt+30 days`;
- after that instant status and idempotent presign return `gone` without creating a replacement session;
- a different admin and an unknown upload receive the same non-enumerating response envelope;
- abandon changes only owned `pending` to `failed/abandoned` and atomically enters durable temporary cleanup;
- a valid PUT arriving after abandon cannot close cleanup early: final absent HEAD is allowed only after `presignExpiresAt + clockSkew`;
- abandon loses to a finalization claim and returns `upload_finalizing`;
- consumed abandon returns `upload_consumed`;
- repeat abandon is stable and may retry only temporary-object deletion.

- [ ] **Step 2: Implement CAS transitions**

Every state-changing query includes upload ID, owner ID, expected state, source ETag when present, and lease token when present. Every terminal transition writes `temporaryCleanupState=pending`, resets/schedules `temporaryCleanupNextAttemptAt`, and retains `presignExpiresAt`. Every zero-count result re-reads the winner before returning a response.

- [ ] **Step 3: Verify status and abandon behavior**

```powershell
npm test --workspace=backend -- images.service.spec.ts --runInBand
npm run test:e2e --workspace=backend -- images.e2e-spec.ts --runInBand
```

Expected: all state, ownership, and race tests PASS.

### Task 5: Close serialization, logging, and deletion controls

**Files:**

- Modify: `apps/backend/src/images/image-presenter.service.ts`
- Modify: `apps/backend/src/images/image-presenter.service.spec.ts`
- Modify: `apps/backend/src/albums/albums.service.ts`
- Modify: `apps/backend/src/albums/albums.service.spec.ts`
- Modify: `apps/backend/src/images/image-deletion.service.ts`
- Modify: `apps/backend/src/images/images-deletion.spec.ts`
- Modify: `apps/backend/src/images/storage.service.ts`
- Modify: `apps/backend/src/images/upload-cleanup.service.ts`
- Modify: `apps/backend/src/main.ts`
- Modify: `apps/backend/test/images.e2e-spec.ts`

- [ ] **Step 1: Write failing allowlist and redaction tests**

Assert public/admin album and upload responses expose only documented `PublicImageResponse` fields. Capture logs for signing, validation, CopyObject, Queue, DeleteObject, and successful upload paths; reject filenames, full keys, digests, presigned URLs, tokens, and credentials.

- [ ] **Step 2: Write failing body-limit and deletion tests**

Assert JSON and URL-encoded bodies above 1 MiB return 413. Deleting a consumed image atomically stamps `resultDeletedAt` in live/idempotency tombstones, verifies the promotion is `committed`, and upserts `ImageObjectDeletion` with `authority='current_result'`, canonical `objectKeyHash`, and null `legacyImageSnapshotSha256/providerDisposition` before deleting `Image`. A committed promotion without a live Image remains valid only through that exact result/deletion evidence. Album deletion returns `album_cleanup_pending` while an active upload or promotion disposition `pending|cleanup_required` exists.

- [ ] **Step 3: Implement controls**

Route all image serialization through `ImagePresenterService`, configure both body parsers to 1 MiB, replace sensitive logs with server IDs or truncated key hashes, and recheck upload/promotion conflicts inside the serializable album-delete transaction; after the gate passes, complete album deletion as `deleteStatus='deleted'` soft-delete and retain the Album, ImageUpload, ImageUploadIdempotency, promotion, and ImageObjectDeletion evidence rows. Keep user-requested `ImageObjectDeletion` authority separate from failed-promotion `cleanup_required`; never transition a committed promotion during result deletion. For an `Image` with no committed upload promotion, create a `legacy_image` deletion-authority snapshot containing image ID, provider, object-key hash, and album ownership; do not require a fabricated `ImageUploadIdempotency` row. Every non-R2 deletion writer (including album deletion and legacy Cloudflare cleanup) must instead write `authority='non_r2_deferred'` and a closed `providerDisposition='legacy_deferred'` in the same transaction; it must never rely on the `current_result` default. The reconciler processes R2 authority only through the provider-specific deletion branch.

- [ ] **Step 4: Verify controls**

```powershell
npm test --workspace=backend -- image-presenter.service.spec.ts storage.service.spec.ts --runInBand
npm run test:e2e --workspace=backend -- images.e2e-spec.ts --runInBand
```

Expected: allowlist, redaction, 413, tombstone, and album-deletion tests PASS.

### Task 6: Stage gate and commit

- [ ] **Step 1: Run backend checks**

```powershell
npm test --workspace=backend -- --runInBand
npm run test:e2e --workspace=backend -- --runInBand
npm run test:integration --workspace=backend
npm run build --workspace=backend
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Commit**

```powershell
git add apps/backend docker-compose.yml package-lock.json
git commit -m "feat(images): add current upload session APIs"
```
