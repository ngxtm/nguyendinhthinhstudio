# Frontend Queue and Admin UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Connect optimized outputs to idempotent upload APIs and expose accurate progress, cancellation, retry, and error states.

**Architecture:** UploadScheduler owns a two-item resource budget and transitions through optimizing, ready, presigning, uploading, verifying, cancelling, success, error, and cancelled. API adapters consume the shared closed unions and never infer state from message text.

**Tech Stack:** React 19, Next.js 16, XHR PUT progress, Fetch, TypeScript, Node test runner, Playwright.

---

### Task 1: Implement typed API adapters

**Files:**

- Modify: apps/frontend/src/lib/api/images.ts
- Modify: apps/frontend/src/lib/api/client.ts
- Create: apps/frontend/test/image-upload-api.test.ts

- [x] **Step 1: Add failing adapter tests**

Cover policy load, upload-url request, exact processed metadata/digest/clientRequestId, PUT progress, confirm, status, abandon, finalizing, consumed, failed, gone, deleted, unavailable, and retryable responses. Exhaustively assert the closed cross-cutting codes `upload_invalid_request`, `upload_authentication_required`, `upload_admin_required`, `upload_not_found`, `policy_refresh_required`, `upload_capacity_exceeded`, `upload_rate_limited`, `upload_rate_limit_unavailable`, `upload_request_conflict`, and `upload_presign_disabled`, plus every `UploadFailureCode` including `upload_dispatch_rejected` and `upload_cutover_aborted`. A compile-time exhaustiveness helper must fail if a new union member is not handled.

- [x] **Step 2: Implement response validation**

Validate correlated outcome/statusCode/code/retryAfter fields, including HTTP 409 + `upload_request_conflict` for owner/fingerprint disagreement, and map unknown server responses to a local `unexpected_upload_response` UI error that is not part of the server union. Switch only on typed discriminants/codes; never message text. Never expose policy snapshots, keys, tokens, or presigned URLs in queue state.

- [x] **Step 3: Verify adapter tests**

    npm run test:focused --workspace=frontend -- test/image-upload-api.test.ts

Expected: all union and error-envelope cases PASS.

### Task 2: Implement scheduler state machine

**Files:**

- Create: apps/frontend/src/lib/image-upload/upload-scheduler.ts
- Create: apps/frontend/test/image-upload-state-machine.test.ts

- [x] **Step 1: Add failing state transition tests**

Assert two slots, queued source Files without object bodies held by pending items, Blob retention only for retryable failures, policy refresh re-optimization with a new clientRequestId, and no replacement session after gone/failed/deleted/unavailable.

- [x] **Step 2: Implement sequential optimization and concurrent PUT limit**

Reserve a slot before optimization, retain valid Blob through presign/PUT/confirm and retryable errors, release all resources on permanent errors/success/removal, and cap direct PUT concurrency at two.

- [x] **Step 3: Implement cancel/retry races**

Cancel optimizing/ready/presigning/uploading with separate controllers. After PUT starts, abandon pending and wait for its result. Once verifying begins, never abort confirm; upload_finalizing/upload_consumed returns to polling.

- [x] **Step 4: Implement confirm polling**

Treat `retryAfter` only as the instant at which the client polls the status endpoint again. After that poll, reconfirm only when the returned status is exactly `pending`; the client must never infer lease expiry or reclaimability from local time, a previous response, or `retryAfter`. Continue polling while the server returns `finalizing`, and stop on every terminal outcome.

- [x] **Step 5: Verify state-machine tests**

    npm run test:focused --workspace=frontend -- test/image-upload-state-machine.test.ts

Expected: all transitions, resource ownership, cancellation races, exact `retryAfter` status polling, server-authorized `pending` reconfirmation, retries, and terminal polling tests PASS.

### Task 3: Integrate ImageUploadZone

**Files:**

- Modify: apps/frontend/src/app/admin/components/ImageUploadZone.tsx
- Modify: apps/frontend/src/app/admin/albums/[id]/page.tsx
- Create: apps/frontend/src/app/admin/components/ImageUploadProgress.tsx
- Create: apps/frontend/src/app/admin/components/ImageUploadErrors.tsx

- [x] **Step 1: Add failing component tests**

Assert unsupported browser message before file selection, original/optimized bytes, savings, canonical dimensions, optimization/upload progress, actionable stable errors, cancellation confirmation, and no large-source preview.

- [x] **Step 2: Implement UI bindings**

Replace the monolithic compression flow with scheduler events. Render bounded output or icon only, display retry/remove actions, and keep the album refresh separate from upload success reconciliation.

- [x] **Step 3: Verify component and production tests**

    npm test --workspace=frontend
    npm run build --workspace=frontend

Expected: all UI tests and build PASS.

### Task 4: Add browser-level cancellation and response-loss coverage

**Files:**

- Create: apps/frontend/test/image-upload.browser.spec.ts
- Modify: apps/frontend/package.json
- Create: `apps/frontend/playwright.config.ts`

- [x] **Step 1: Add the browser test runtime and failing browser tests**

Run `npm install --workspace=frontend --save-dev @playwright/test@1.52.0`, create `apps/frontend/playwright.config.ts` with `chromium` and `stable-chrome` projects, and then run real bundled Chromium against the capability probe. Test stable queue states, worker cancellation, no original preview, lost presign/confirm response, and status polling. The project must fail rather than skip when its required browser binary is unavailable.

- [x] **Step 2: Implement fixtures and controlled API responses**

Use tracked fixture bytes from @ndt/image-upload-policy/fixtures. Mock only network responses; do not mock ImageDecoder, Canvas, or Worker APIs.

- [x] **Step 3: Verify browser tests**

    npm exec --workspace=frontend -- playwright test test/image-upload.browser.spec.ts --project=chromium --project=stable-chrome

Expected: both required projects execute and exit 0; a missing/unsupported browser or skipped capability test fails its project and therefore the command.

### Task 5: Stage gate and commit

- [x] **Step 1: Run frontend checks**

    npm test --workspace=frontend
    npm run build --workspace=frontend
    git diff --check

Expected: commands exit 0.

- [x] **Step 2: Commit**

    git add apps/frontend
    git commit -m "feat(images): add idempotent admin upload queue"
