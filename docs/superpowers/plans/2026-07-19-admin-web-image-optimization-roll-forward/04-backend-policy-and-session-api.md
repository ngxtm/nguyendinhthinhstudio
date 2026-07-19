# Backend Policy and Session API Implementation Plan

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
```

- [ ] **Step 2: Write failing process-role isolation tests**

Use this exact role contract:

```ts
type ImageUploadProcessRole = 'api' | 'reconciler' | 'cutover';
```

Assert:

- `api` requires database, R2 data-plane, imgproxy, policy, and presign configuration;
- `api` rejects `IMAGE_UPLOAD_SETTLEMENT_API_TOKEN` and `NDT_STAGING_CF_TOKEN`;
- `reconciler` requires database, R2 HEAD/DELETE credentials, account ID, Queue ID, DLQ ID, source HTTP consumer ID, DLQ inspection consumer ID, bucket, prefix, and Queue read/write token;
- `reconciler` rejects the operator event-rule token;
- `cutover` is the only role allowed to receive provisioning credentials;
- Queue and DLQ IDs differ;
- canonical prefix is exactly `albums/` in production;
- placeholders, cross-environment values, and unknown roles fail startup.

- [ ] **Step 3: Run focused tests and observe failure**

```powershell
npm test --workspace=backend -- image-upload-policy.service.spec.ts image-upload-runtime-config.spec.ts --runInBand
```

Expected: FAIL because policy and role-aware validation do not exist.

- [ ] **Step 4: Implement role-specific bootstraps**

`main.ts` boots only the API role. The scheduled script created in Stage 05 boots only the reconciler application context. The cutover script created in Stage 09 boots only cutover services. Each exposes a sanitized fingerprint containing role, non-secret IDs, policy hash, timeout values, process count, and permit count.

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
- Modify: `apps/backend/test/images.e2e-spec.ts`

- [ ] **Step 1: Write failing route and rejection tests**

Cover authenticated admin-only policy, upload-url, confirm, status, and abandon routes. A presign body missing `clientRequestId`, `processedSha256`, or `policyVersion` must return the closed `UploadErrorResponse` with `code=policy_refresh_required`; it must not create a session.

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
npm test --workspace=backend -- images.controller.spec.ts --runInBand
npm run test:e2e --workspace=backend -- images.e2e-spec.ts --runInBand
```

Expected: FAIL because current-only routes and closed errors are incomplete.

- [ ] **Step 3: Implement strict DTOs and maintenance gating**

When `IMAGE_UPLOAD_PRESIGN_ENABLED=false`, every new or repeated `POST /images/upload-url` returns HTTP 503 `upload_presign_disabled` before capacity, ledger, session, or signing work. Policy, status, confirm, abandon, cleanup, and reconciliation remain separately available for controlled draining.

- [ ] **Step 4: Verify route contracts**

```powershell
npm test --workspace=backend -- images.controller.spec.ts --runInBand
npm run test:e2e --workspace=backend -- images.e2e-spec.ts --runInBand
```

Expected: authorization, strict-shape, policy-refresh, and maintenance tests PASS.

### Task 3: Implement ownership, quota, and idempotent presign

**Files:**

- Create: `apps/backend/src/images/image-upload-fingerprint.ts`
- Create: `apps/backend/src/images/image-upload-fingerprint.spec.ts`
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

Cover same-key/same-fingerprint retry, same-key/different-fingerprint conflict, two simultaneous requests for one clientRequestId, 50-image album admission, per-admin active limits, rolling daily byte/count quota, response loss, and signing failure.

- [ ] **Step 2: Run focused tests and observe failure**

```powershell
npm test --workspace=backend -- image-upload-fingerprint.spec.ts images.service.spec.ts --runInBand
npm run test:integration --workspace=backend -- image-concurrency.integration-spec.ts
```

Expected: FAIL before fingerprint and ledger behavior exist.

- [ ] **Step 3: Implement serializable admission**

In one serializable transaction:

1. Re-read the album and deletion state.
2. Insert or lock the idempotency record.
3. Reject a fingerprint or owner mismatch.
4. Count active sessions and quota usage.
5. Reserve one album slot.
6. Create exactly one `ImageUpload` with owner, current policy snapshot, digest, upload key, final key, and expiry.

Generate the presigned URL after the transaction. If signing fails, conditionally mark the session failed and store the terminal outcome; never delete a winner created by another retry.

- [ ] **Step 4: Verify concurrency and idempotency**

```powershell
npm test --workspace=backend -- image-upload-fingerprint.spec.ts images.service.spec.ts --runInBand
npm run test:integration --workspace=backend -- image-concurrency.integration-spec.ts
```

Expected: exactly one session and stable response/outcome per clientRequestId.

### Task 4: Implement status and abandonment

**Files:**

- Modify: `apps/backend/src/images/images.service.ts`
- Modify: `apps/backend/src/images/images.service.spec.ts`
- Modify: `apps/backend/test/images.e2e-spec.ts`

- [ ] **Step 1: Write failing state and ownership tests**

Cover:

- status for `pending`, `finalizing`, `consumed`, `failed`, `gone`, deleted, and unavailable results;
- a different admin receives `upload_session_forbidden` without existence leakage;
- abandon changes only owned `pending` to `failed/abandoned`;
- abandon loses to a finalization claim and returns `upload_finalizing`;
- consumed abandon returns `upload_consumed`;
- repeat abandon is stable and may retry only temporary-object deletion.

- [ ] **Step 2: Implement CAS transitions**

Every state-changing query includes upload ID, owner ID, expected state, source ETag when present, and lease token when present. Every zero-count result re-reads the winner before returning a response.

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
- Modify: `apps/backend/src/images/storage.service.ts`
- Modify: `apps/backend/src/images/upload-cleanup.service.ts`
- Modify: `apps/backend/src/main.ts`
- Modify: `apps/backend/test/images.e2e-spec.ts`

- [ ] **Step 1: Write failing allowlist and redaction tests**

Assert public/admin album and upload responses expose only documented `PublicImageResponse` fields. Capture logs for signing, validation, CopyObject, Queue, DeleteObject, and successful upload paths; reject filenames, full keys, digests, presigned URLs, tokens, and credentials.

- [ ] **Step 2: Write failing body-limit and deletion tests**

Assert JSON and URL-encoded bodies above 1 MiB return 413. Deleting a consumed image stamps `resultDeletedAt` before deleting `Image`. Album deletion returns `album_cleanup_pending` while an active upload or promotion disposition `pending|cleanup_required` exists.

- [ ] **Step 3: Implement controls**

Route all image serialization through `ImagePresenterService`, configure both body parsers to 1 MiB, replace sensitive logs with server IDs or truncated key hashes, and recheck upload/promotion conflicts inside the serializable album-delete transaction.

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
