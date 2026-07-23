# Production Operator Smoke Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fail-closed operator-only upload ingress mode and a packaged production runner that executes, cleans up, and receipts all twelve Stage 09 smoke checks.

**Architecture:** The API keeps `IMAGE_UPLOAD_PRESIGN_ENABLED` as a hard kill and adds an explicit `disabled | operator-smoke | general` ingress state. A temporary one-shot Debian image built from the same release commit supplies Node 24 and matching Playwright Chromium while the long-lived Alpine backend stays lean. Its CLI validates protected Phase 1/authorization evidence, binds itself to the release fingerprint and observed backend image digest, journals exact runner-owned IDs and keys, drives real API/browser/provider checks, uses closed PostgreSQL/R2 adapters for otherwise-unreachable fault states, cleans up idempotently, and writes the existing official receipt only after all checks and cleanup pass.

**Tech Stack:** TypeScript 5.8, NestJS 11, Jest 30, Prisma/PostgreSQL, AWS SDK v3 for R2, Playwright Chromium, Node.js 24, JSON Schema evidence contracts, Docker Compose.

---

## File structure

- Create `apps/backend/src/images/image-upload-ingress.ts`: parse the closed ingress state and perform constant-time smoke-header admission.
- Create `apps/backend/src/images/image-upload-ingress.spec.ts`: state-table, entropy, role-boundary, and header-comparison tests.
- Modify `apps/backend/src/images/image-upload-runtime-config.ts`: bind ingress mode and token fingerprint into API runtime/fingerprint without exposing secret bytes.
- Modify `apps/backend/src/images/image-upload-runtime-config.spec.ts`: cover all valid/invalid runtime combinations.
- Modify `apps/backend/src/images/images.module.ts`: inject the parsed ingress runtime into the controller.
- Modify `apps/backend/src/images/images.controller.ts`: enforce operator admission before rate admission on the four upload-workflow routes while preserving disabled-mode drain behavior.
- Modify `apps/backend/src/images/images.controller.spec.ts` and `apps/backend/test/images.e2e-spec.ts`: prove auth/role/gate/rate order and fail-closed responses.
- Modify `apps/backend/src/main.ts`: allow the smoke header name through CORS.
- Create `apps/backend/src/scripts/image-upload-production-smoke-contract.ts`: strict environment/evidence parsing, stable hashing, protected journal and receipt persistence.
- Create `apps/backend/src/scripts/image-upload-production-smoke-contract.spec.ts`: closed-input, ACL, canonical, `wx`, and redaction tests.
- Create `apps/backend/src/scripts/image-upload-production-smoke-orchestrator.ts`: twelve-check sequencing, abort handling, condition polling, cleanup, and receipt eligibility.
- Create `apps/backend/src/scripts/image-upload-production-smoke-orchestrator.spec.ts`: test the complete dependency sequence and every failure boundary.
- Create `apps/backend/src/scripts/image-upload-production-smoke-live.ts`: API, Playwright, R2 HEAD/PUT/COPY/DELETE, imgproxy, and live heartbeat adapters.
- Create `apps/backend/src/scripts/image-upload-production-smoke-live.spec.ts`: request/header/redaction, CORS, response-loss, unchanged-destination, and rendering tests with local fakes.
- Create `apps/backend/src/scripts/image-upload-production-smoke-pg.ts`: closed SQL preparation/observation/cleanup for runner-owned promotions, conflicts, expiry, and deletion state.
- Create `apps/backend/src/scripts/image-upload-production-smoke-pg.spec.ts`: query-shape and ownership-precondition unit tests.
- Create `apps/backend/test/image-upload-production-smoke.integration-spec.ts`: disposable PostgreSQL mutation-boundary and cleanup-resumption tests.
- Create `apps/backend/src/scripts/run-image-upload-production-smoke.ts`: `run`/`cleanup` CLI and live dependency assembly.
- Create `apps/backend/src/scripts/run-image-upload-production-smoke.spec.ts`: CLI mode and secret-output contract tests.
- Create `apps/backend/src/scripts/image-upload-production-smoke-dependencies.ts`: concrete Playwright, R2, PostgreSQL, polling, cleanup, and twelve-check dependency graph.
- Create `scripts/schemas/image-upload-operator-smoke-journal.schema.json`: closed sanitized resumable journal schema.
- Create `apps/backend/Dockerfile.operator-smoke` and modify `apps/backend/package.json`, `docker-compose.yml`, and `apps/backend/src/images/docker-runtime-contract.spec.ts`: package the runner with pinned Playwright Chromium in a temporary image while binding the smoke secret only to API.
- Modify `scripts/verify-image-upload-final-ingress-gates.test.mjs`: accept a runner-generated canonical receipt and reject changed bytes/checks.
- Modify `scripts/verify-image-upload-workflow.mjs`, `docs/runbooks/image-upload-roll-forward.md`, and the canonical Stage 09 plan/spec: document and enforce the executable operator-smoke path.

### Task 1: Implement the closed ingress state machine

**Files:**

- Create: `apps/backend/src/images/image-upload-ingress.ts`
- Create: `apps/backend/src/images/image-upload-ingress.spec.ts`
- Modify: `apps/backend/src/images/image-upload-runtime-config.ts`
- Modify: `apps/backend/src/images/image-upload-runtime-config.spec.ts`

- [ ] **Step 1: Write failing state-table tests**

Define the wished-for API in the test:

```ts
import { parseImageUploadIngress, smokeTokenFingerprint } from './image-upload-ingress';

const token = 'operator-smoke-token-with-at-least-32-bytes';

it.each([
    [{ IMAGE_UPLOAD_PRESIGN_ENABLED: 'false' }, 'disabled'],
    [
        {
            IMAGE_UPLOAD_PRESIGN_ENABLED: 'false',
            IMAGE_UPLOAD_INGRESS_MODE: 'disabled',
        },
        'disabled',
    ],
    [
        {
            IMAGE_UPLOAD_PRESIGN_ENABLED: 'true',
            IMAGE_UPLOAD_INGRESS_MODE: 'operator-smoke',
            IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN: token,
        },
        'operator-smoke',
    ],
    [
        {
            IMAGE_UPLOAD_PRESIGN_ENABLED: 'true',
            IMAGE_UPLOAD_INGRESS_MODE: 'general',
        },
        'general',
    ],
])('accepts valid ingress state %#', (env, mode) => {
    expect(parseImageUploadIngress(env, 'api').mode).toBe(mode);
});

it.each([
    { IMAGE_UPLOAD_PRESIGN_ENABLED: 'true' },
    { IMAGE_UPLOAD_PRESIGN_ENABLED: 'true', IMAGE_UPLOAD_INGRESS_MODE: 'disabled' },
    { IMAGE_UPLOAD_PRESIGN_ENABLED: 'false', IMAGE_UPLOAD_INGRESS_MODE: 'general' },
    { IMAGE_UPLOAD_PRESIGN_ENABLED: 'true', IMAGE_UPLOAD_INGRESS_MODE: 'operator-smoke' },
    {
        IMAGE_UPLOAD_PRESIGN_ENABLED: 'true',
        IMAGE_UPLOAD_INGRESS_MODE: 'general',
        IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN: token,
    },
])('rejects unsafe ingress state %#', (env) => {
    expect(() => parseImageUploadIngress(env, 'api')).toThrow();
});

it('stores only a token fingerprint', () => {
    const parsed = parseImageUploadIngress(
        {
            IMAGE_UPLOAD_PRESIGN_ENABLED: 'true',
            IMAGE_UPLOAD_INGRESS_MODE: 'operator-smoke',
            IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN: token,
        },
        'api',
    );
    expect(parsed.smokeTokenSha256).toBe(smokeTokenFingerprint(token));
    expect(JSON.stringify(parsed)).not.toContain(token);
});
```

- [ ] **Step 2: Run the new test and observe RED**

Run:

```powershell
npm test --workspace=backend -- --runInBand --runTestsByPath src/images/image-upload-ingress.spec.ts
```

Expected: FAIL because `image-upload-ingress.ts` does not exist.

- [ ] **Step 3: Implement the minimal parser and constant-time admission primitive**

Implement these exports:

```ts
export type ImageUploadIngressMode = 'disabled' | 'operator-smoke' | 'general';
export type ImageUploadIngressRuntime = Readonly<{
    presignEnabled: boolean;
    mode: ImageUploadIngressMode;
    smokeTokenSha256?: string;
}>;
export const IMAGE_UPLOAD_OPERATOR_SMOKE_HEADER = 'x-image-upload-smoke-token' as const;
export function smokeTokenFingerprint(token: string): string;
export function parseImageUploadIngress(
    env: Readonly<Record<string, string | undefined>>,
    role: 'api' | 'reconciler' | 'cutover',
): ImageUploadIngressRuntime;
export function matchesOperatorSmokeToken(
    runtime: ImageUploadIngressRuntime,
    header: string | string[] | undefined,
): boolean;
```

Use SHA-256 digests and `timingSafeEqual`; require one header value, at least 32 UTF-8 bytes, at most 256 bytes, and reject control characters/placeholders. Reconciler and cutover reject `IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN` and any non-disabled ingress mode.

- [ ] **Step 4: Bind ingress into runtime config and sanitized fingerprint**

Add `ingressMode` and optional `operatorSmokeTokenSha256` to `RuntimeFingerprint`, and add `ingress` to `ImageUploadRuntimeConfig`. Call `parseImageUploadIngress(env, role)` after role validation. Never add the raw token to `values`.

- [ ] **Step 5: Run focused tests and observe GREEN**

Run:

```powershell
npm test --workspace=backend -- --runInBand --runTestsByPath src/images/image-upload-ingress.spec.ts src/images/image-upload-runtime-config.spec.ts
```

Expected: both suites pass with no secret value in snapshots/output.

- [ ] **Step 6: Commit**

```powershell
git add apps/backend/src/images/image-upload-ingress.ts apps/backend/src/images/image-upload-ingress.spec.ts apps/backend/src/images/image-upload-runtime-config.ts apps/backend/src/images/image-upload-runtime-config.spec.ts
git commit -m "feat(images): add fail-closed upload ingress modes"
```

### Task 2: Enforce operator admission in API and CORS

**Files:**

- Modify: `apps/backend/src/images/images.module.ts`
- Modify: `apps/backend/src/images/images.controller.ts`
- Modify: `apps/backend/src/images/images.controller.spec.ts`
- Modify: `apps/backend/test/images.e2e-spec.ts`
- Modify: `apps/backend/src/main.ts`

- [ ] **Step 1: Write failing controller tests for gate ordering**

Extend the controller test runtime factory with `mode` and `smokeTokenSha256`. Add cases proving:

```ts
const smokeToken = 'operator-smoke-token-with-at-least-32-bytes';
const validBody = {
    clientRequestId: '00000000-0000-4000-8000-000000000010',
    albumId: '00000000-0000-4000-8000-000000000020',
    filename: 'smoke.webp',
    contentType: 'image/webp',
    fileSize: 1024,
    processedSha256: 'a'.repeat(64),
    policyVersion: 'policy-v1',
};
const adminRequestWithoutSmokeHeader = {
    user: { sub: 'admin-1', role: 'admin' },
    headers: {},
};
const adminRequestWithSmokeHeader = {
    user: { sub: 'admin-1', role: 'admin' },
    headers: { 'x-image-upload-smoke-token': smokeToken },
};

await expect(
    operatorController().getUploadUrl(validBody, adminRequestWithoutSmokeHeader),
).rejects.toMatchObject({
    response: { statusCode: 403, code: 'upload_operator_smoke_required' },
});
expect(rateLimit.admit).not.toHaveBeenCalled();
expect(images.getUploadUrl).not.toHaveBeenCalled();

await expect(
    operatorController().getUploadUrl(validBody, adminRequestWithSmokeHeader),
).resolves.toEqual({ uploadId: 'upload-1' });

await expect(
    disabledController().getUploadStatus(
        { uploadId: '00000000-0000-4000-8000-000000000030' },
        adminRequest,
    ),
).resolves.toBeDefined();
```

Add the same missing/wrong/correct/duplicated header coverage to the e2e routes after JWT/role coverage.

- [ ] **Step 2: Run controller/e2e tests and observe RED**

Run:

```powershell
npm test --workspace=backend -- --runInBand --runTestsByPath src/images/images.controller.spec.ts
npm run test:e2e --workspace=backend -- --runInBand --runTestsByPath test/images.e2e-spec.ts
```

Expected: operator-mode cases fail because no gate is enforced.

- [ ] **Step 3: Implement admission before rate limiting**

Replace the injected `{ presignEnabled }` runtime with `ImageUploadIngressRuntime`. Add a private method receiving the Express request and `{ creation: boolean }`:

```ts
private assertUploadIngress(
  request: Request,
  options: { creation: boolean },
): void {
  if (!this.runtime.presignEnabled) {
    if (!options.creation) return;
    throw ImagesController.uploadError(
      503,
      'upload_presign_disabled',
      'Image upload presigning is temporarily disabled',
    );
  }
  if (
    this.runtime.mode === 'operator-smoke' &&
    !matchesOperatorSmokeToken(
      this.runtime,
      request.headers[IMAGE_UPLOAD_OPERATOR_SMOKE_HEADER],
    )
  ) {
    throw ImagesController.uploadError(
      403,
      'upload_operator_smoke_required',
      'Operator smoke authorization is required',
    );
  }
}
```

Call it before `rateLimit.admit` in upload-url, confirm, status, and abandon; use `creation: true` only for upload-url. Keep policy and public read routes unchanged.

- [ ] **Step 4: Inject parsed ingress and allow only the header name through CORS**

`ImagesModule` calls `parseImageUploadIngress(process.env, 'api')`. `main.ts` adds `X-Image-Upload-Smoke-Token` to `allowedHeaders`. No response or logger prints the value.

- [ ] **Step 5: Run focused and authorization-coverage tests**

Run:

```powershell
npm test --workspace=backend -- --runInBand --runTestsByPath src/images/image-upload-ingress.spec.ts src/images/images.controller.spec.ts src/auth/authorization-coverage.spec.ts
npm run test:e2e --workspace=backend -- --runInBand --runTestsByPath test/images.e2e-spec.ts
```

Expected: all suites pass; missing/wrong header creates no rate event/session.

- [ ] **Step 6: Commit**

```powershell
git add apps/backend/src/images/images.module.ts apps/backend/src/images/images.controller.ts apps/backend/src/images/images.controller.spec.ts apps/backend/test/images.e2e-spec.ts apps/backend/src/main.ts
git commit -m "feat(images): enforce operator-only smoke admission"
```

### Task 3: Add protected smoke contract, journal, and receipt writer

**Files:**

- Create: `scripts/schemas/image-upload-operator-smoke-journal.schema.json`
- Create: `apps/backend/src/scripts/image-upload-production-smoke-contract.ts`
- Create: `apps/backend/src/scripts/image-upload-production-smoke-contract.spec.ts`

- [ ] **Step 1: Write failing contract tests**

Define tests for `parseProductionSmokeEnvironment`, `readProtectedEvidence`, `createSmokeJournal`, `updateSmokeJournal`, and `writeSmokeReceipt`. Use a temporary directory and assert:

```ts
expect(() => parseProductionSmokeEnvironment(validEnv)).not.toThrow();
expect(() =>
    parseProductionSmokeEnvironment(
        Object.assign({}, validEnv, {
            NDT_PRODUCTION_SMOKE_TOKEN: '',
        }),
    ),
).toThrow('NDT_PRODUCTION_SMOKE_TOKEN is required');
await expect(createSmokeJournal(path, draft)).resolves.toMatchObject({
    schemaVersion: 'image-upload-operator-smoke-journal/v1',
    lifecycle: 'authorized',
    cleanupStatus: 'pending',
});
await expect(createSmokeJournal(path, draft)).rejects.toThrow(/exist/i);
expect(JSON.stringify(await readFile(path, 'utf8'))).not.toContain(
    validEnv.NDT_PRODUCTION_SMOKE_TOKEN,
);
```

Test broad POSIX mode, relative paths, aliased evidence paths, changed canonical authorization, release drift, false checks, incomplete cleanup, and existing receipt output.

- [ ] **Step 2: Run the contract test and observe RED**

```powershell
npm test --workspace=backend -- --runInBand --runTestsByPath src/scripts/image-upload-production-smoke-contract.spec.ts
```

Expected: FAIL because the contract module and journal schema are absent.

- [ ] **Step 3: Implement closed types and canonical persistence**

Use these core types:

```ts
export const PRODUCTION_SMOKE_CHECKS = [
    'browserUpload',
    'absoluteExpiryRetry',
    'allowedCorsPut',
    'deniedCorsPut',
    'responseFirstSettlement',
    'copyResponseLossHeadSettlement',
    'unchangedDestinationRetry',
    'conflictFailClosed',
    'committedDeletion',
    'failedPromotionCleanup',
    'temporaryCleanupAfterExpiry',
    'imgproxyRendering',
] as const;
export type ProductionSmokeCheck = (typeof PRODUCTION_SMOKE_CHECKS)[number];
export type SmokeOwnedResource = Readonly<{
    kind: 'upload' | 'promotion' | 'conflict' | 'image' | 'deletion' | 'object';
    id: string;
    objectKeySha256?: string;
}>;
export type ProductionSmokeJournal = Readonly<{
    schemaVersion: 'image-upload-operator-smoke-journal/v1';
    runId: string;
    release: ReleaseTuple;
    adminIdSha256: string;
    lifecycle: 'authorized' | 'running' | 'checks-passed' | 'cleaning' | 'complete' | 'failed';
    completedChecks: readonly ProductionSmokeCheck[];
    resources: readonly SmokeOwnedResource[];
    cleanupStatus: 'pending' | 'running' | 'complete' | 'failed';
    updatedAt: string;
    canonicalSha256: string;
}>;
```

Implement recursively key-sorted canonical JSON; atomically create with `open(path, 'wx', 0o600)` and update through a mode-600 sibling temporary file plus same-directory rename. Reject sensitive property names recursively. The official receipt writer must conform exactly to the existing schema and derive booleans from the completed-check set.

- [ ] **Step 4: Run contract tests and schema parse**

```powershell
npm test --workspace=backend -- --runInBand --runTestsByPath src/scripts/image-upload-production-smoke-contract.spec.ts
node -e "JSON.parse(require('fs').readFileSync('scripts/schemas/image-upload-operator-smoke-journal.schema.json','utf8')); console.log('journal schema: pass')"
```

Expected: test suite and schema parse pass.

- [ ] **Step 5: Commit**

```powershell
git add scripts/schemas/image-upload-operator-smoke-journal.schema.json apps/backend/src/scripts/image-upload-production-smoke-contract.ts apps/backend/src/scripts/image-upload-production-smoke-contract.spec.ts
git commit -m "feat(images): add protected production smoke evidence contract"
```

### Task 4: Implement the fail-closed orchestrator

**Files:**

- Create: `apps/backend/src/scripts/image-upload-production-smoke-orchestrator.ts`
- Create: `apps/backend/src/scripts/image-upload-production-smoke-orchestrator.spec.ts`

- [ ] **Step 1: Write failing orchestration tests**

Define a dependency interface with `preflight`, one method for each check, `cleanup`, and `verifyCleanup`. Record events in tests and require:

```ts
expect(events).toEqual([
    'preflight',
    'browserUpload',
    'absoluteExpiryRetry',
    'allowedCorsPut',
    'deniedCorsPut',
    'responseFirstSettlement',
    'copyResponseLossHeadSettlement',
    'unchangedDestinationRetry',
    'conflictFailClosed',
    'committedDeletion',
    'failedPromotionCleanup',
    'temporaryCleanupAfterExpiry',
    'imgproxyRendering',
    'cleanup',
    'verifyCleanup',
    'receipt',
]);
```

For each preflight/check/cleanup failure, assert cleanup runs at most once, the journal remains resumable, the official receipt path is absent, and no later check runs. Test pre-aborted signal, SIGINT-compatible abort, and cleanup-only mode.

- [ ] **Step 2: Run the orchestrator test and observe RED**

```powershell
npm test --workspace=backend -- --runInBand --runTestsByPath src/scripts/image-upload-production-smoke-orchestrator.spec.ts
```

Expected: FAIL because the orchestrator is absent.

- [ ] **Step 3: Implement sequential journal-before-action orchestration**

Export:

```ts
export type ProductionSmokeDependencies = Readonly<{
    preflight: (context: SmokeRunContext, signal: AbortSignal) => Promise<void>;
    runCheck: (
        check: ProductionSmokeCheck,
        context: SmokeRunContext,
        signal: AbortSignal,
    ) => Promise<void>;
    cleanup: (context: SmokeRunContext, signal: AbortSignal) => Promise<void>;
    verifyCleanup: (context: SmokeRunContext, signal: AbortSignal) => Promise<void>;
}>;
export async function runProductionSmoke(
    options: RunProductionSmokeOptions,
): Promise<OperatorSmokeReceipt>;
export async function resumeProductionSmokeCleanup(
    options: CleanupProductionSmokeOptions,
): Promise<void>;
export async function pollUntil<T>(options: {
    observe: () => Promise<T>;
    accept: (value: T) => boolean;
    deadline: number;
    intervalMs: number;
    signal: AbortSignal;
}): Promise<T>;
```

Persist journal lifecycle/check completion after each successful boundary. Enter cleanup in `finally`; write the receipt only after `verifyCleanup` and exact check-set equality. Use condition polling and absolute deadlines.

- [ ] **Step 4: Run orchestrator tests and observe GREEN**

```powershell
npm test --workspace=backend -- --runInBand --runTestsByPath src/scripts/image-upload-production-smoke-contract.spec.ts src/scripts/image-upload-production-smoke-orchestrator.spec.ts
```

Expected: both suites pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/backend/src/scripts/image-upload-production-smoke-orchestrator.ts apps/backend/src/scripts/image-upload-production-smoke-orchestrator.spec.ts
git commit -m "feat(images): orchestrate resumable production smoke checks"
```

### Task 5: Implement real API, browser, provider, and imgproxy checks

**Files:**

- Create: `apps/backend/src/scripts/image-upload-production-smoke-live.ts`
- Create: `apps/backend/src/scripts/image-upload-production-smoke-live.spec.ts`

- [ ] **Step 1: Write failing live-adapter tests**

Use local HTTP servers, a fake Playwright launcher, and AWS SDK command-capturing clients. Prove the adapter:

- sends `Authorization: Bearer` and `X-Image-Upload-Smoke-Token` only to the configured production API origin;
- never follows redirects carrying either header to another origin;
- retries upload-url with the same `clientRequestId` and compares upload ID/absolute expiry;
- treats allowed CORS as a successful browser PUT plus present HEAD;
- treats denied CORS as browser rejection plus absent HEAD;
- polls response-first settlement by upload ID;
- compares ETag/bytes/mime/SHA metadata before and after retry;
- verifies imgproxy status, WebP content type, decoded dimensions, and signed URL host; and
- sanitizes thrown errors so URLs/query strings/tokens never appear.

- [ ] **Step 2: Run live-adapter tests and observe RED**

```powershell
npm test --workspace=backend -- --runInBand --runTestsByPath src/scripts/image-upload-production-smoke-live.spec.ts
```

Expected: FAIL because the adapter is absent.

- [ ] **Step 3: Implement bounded clients and browser checks**

Export `createProductionSmokeLiveAdapter(config, journalStore)` with methods matching the orchestrator checks. Use `redirect: 'error'`, exact-origin URL construction, generated 2x2 WebP bytes, existing policy version, request timeouts, AWS SDK `maxAttempts: 1`, and journal each server-issued ID/key before PUT/confirm. Reuse the repository's R2 create-only middleware and image metadata validators rather than duplicating key or ETag grammar.

The response-loss check must prepare an exact destination through the closed PG adapter, then observe the live reconciler after an elapsed 30–35 seconds; it must not add a live HTTP fault endpoint.

- [ ] **Step 4: Run live-adapter tests and staging canary regression tests**

```powershell
npm test --workspace=backend -- --runInBand --runTestsByPath src/scripts/image-upload-production-smoke-live.spec.ts src/images/staging-resource-contract.spec.ts
```

Expected: both suites pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/backend/src/scripts/image-upload-production-smoke-live.ts apps/backend/src/scripts/image-upload-production-smoke-live.spec.ts
git commit -m "feat(images): add live production smoke adapters"
```

### Task 6: Implement closed PostgreSQL fault preparation and cleanup

**Files:**

- Create: `apps/backend/src/scripts/image-upload-production-smoke-pg.ts`
- Create: `apps/backend/src/scripts/image-upload-production-smoke-pg.spec.ts`
- Create: `apps/backend/test/image-upload-production-smoke.integration-spec.ts`
- Modify: `apps/backend/package.json`

- [ ] **Step 1: Write failing ownership/query-shape unit tests**

Define a `ProductionSmokePgAdapter` that accepts only journal-bound typed IDs and no arbitrary SQL/key parameters. Tests must reject a row when admin ID, run-recorded upload ID, release fingerprint, source key, destination key, or creation timestamp differs. Assert no method exposes `queryRawUnsafe` to callers and no cleanup query uses prefix `LIKE` deletion.

- [ ] **Step 2: Write failing disposable-PostgreSQL integration tests**

Create one runner-owned and one foreign upload/promotion/object-deletion fixture. Test:

```ts
await adapter.prepareResponseLoss(ownedContext);
await adapter.prepareConflict(ownedConflictContext);
await adapter.makeFailedCleanupDue(ownedContext);
await adapter.makeExpiredPastSkew(ownedContext);
await adapter.cleanup(ownedJournal);

expect(await readOwnedRows()).toEqual([]);
expect(await readForeignRows()).toEqual(foreignSnapshot);
expect(await readRateLimitEvents()).toEqual(rateLimitSnapshot);
```

Also interrupt cleanup midway and prove a second call completes without touching the foreign fixture.

- [ ] **Step 3: Run new tests and observe RED**

```powershell
npm test --workspace=backend -- --runInBand --runTestsByPath src/scripts/image-upload-production-smoke-pg.spec.ts
npm run test:integration --workspace=backend -- --runInBand --runTestsByPath test/image-upload-production-smoke.integration-spec.ts
```

Expected: FAIL because the PG adapter is absent.

- [ ] **Step 4: Implement serializable, preconditioned mutations**

Use `pg.Client` with the session-capable URL and explicit transactions. Every mutation begins with a field-explicit `SELECT` against the exact journal-bound primary key using `FOR UPDATE`, then compares the complete journal binding before an exact-ID update. Implement:

```ts
prepareResponseLoss(context): Promise<void>
prepareConflict(context): Promise<void>
makeFailedCleanupDue(context): Promise<void>
makeExpiredPastSkew(context): Promise<void>
observePromotion(context): Promise<PromotionObservation>
observeConflict(context): Promise<ConflictObservation>
observeDeletion(context): Promise<DeletionObservation>
cleanup(journal): Promise<void>
verifyCleanup(journal): Promise<void>
```

Delete in foreign-key-safe exact-ID order. Do not delete `ImageUploadRateLimitEvent`; preflight computes remaining capacity and refuses to start if the full run would exceed any route limit.

- [ ] **Step 5: Run unit/integration tests and observe GREEN**

Run the same commands from Step 3. Expected: both suites pass, foreign snapshot and rate-limit snapshot remain byte-equivalent.

- [ ] **Step 6: Register integration suite and commit**

Add the new integration file to `test:image-upload:integration`, then commit:

```powershell
git add apps/backend/src/scripts/image-upload-production-smoke-pg.ts apps/backend/src/scripts/image-upload-production-smoke-pg.spec.ts apps/backend/test/image-upload-production-smoke.integration-spec.ts apps/backend/package.json
git commit -m "feat(images): add bounded production smoke fault adapter"
```

### Task 7: Assemble and package the CLI with role boundaries

**Files:**

- Create: `apps/backend/src/scripts/run-image-upload-production-smoke.ts`
- Create: `apps/backend/src/scripts/run-image-upload-production-smoke.spec.ts`
- Create: `apps/backend/Dockerfile.operator-smoke`
- Modify: `apps/backend/package.json`
- Modify: `docker-compose.yml`
- Modify: `apps/backend/src/images/docker-runtime-contract.spec.ts`

- [ ] **Step 1: Write failing CLI and packaging tests**

Test `run` and `cleanup` only, reject unknown arguments, refuse ambient output inside the repository, handle SIGINT/SIGTERM through one AbortController, and emit only sanitized progress. Extend Docker contract expectations to prove the dedicated Dockerfile uses a pinned Debian/Playwright-compatible base, installs matching Playwright Chromium without stable Chrome, labels the image with the release commit, contains the compiled CLI, and leaves the long-lived backend Dockerfile browser-free. Preserve the service secret boundary with:

```ts
expect(dockerfile).toContain('/app/dist/scripts/run-image-upload-production-smoke.js');
expect(backendEnvironment).toContain('IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN');
expect(reconcilerEnvironment).not.toContain('IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN');
expect(migrationEnvironment).not.toContain('IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN');
```

- [ ] **Step 2: Run tests and observe RED**

```powershell
npm test --workspace=backend -- --runInBand --runTestsByPath src/scripts/run-image-upload-production-smoke.spec.ts src/images/docker-runtime-contract.spec.ts
```

Expected: FAIL because CLI/package contract is absent.

- [ ] **Step 3: Implement CLI assembly and package scripts**

Wire strict environment parsing to the contract, PG, live, and orchestrator modules. Add:

```json
{
    "images:uploads:production-smoke": "node /app/dist/scripts/run-image-upload-production-smoke.js run",
    "images:uploads:production-smoke:cleanup": "node /app/dist/scripts/run-image-upload-production-smoke.js cleanup"
}
```

Add `Dockerfile.operator-smoke` coverage for the compiled CLI and matching Playwright Chromium executable. The image is run manually as a one-shot container and is not added as a long-lived Compose service. In Compose, pass `IMAGE_UPLOAD_INGRESS_MODE` to API/reconciler/migration as non-secret state, but pass `IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN` only to API. Require the CLI preflight to compare the smoke-image commit label, release fingerprint, backend image reference, and observed backend digest before mutation.

- [ ] **Step 4: Run packaging-focused tests and build**

```powershell
npm test --workspace=backend -- --runInBand --runTestsByPath src/scripts/run-image-upload-production-smoke.spec.ts src/images/docker-runtime-contract.spec.ts
npm run build --workspace=backend
Test-Path apps/backend/dist/scripts/run-image-upload-production-smoke.js
docker build -f apps/backend/Dockerfile.operator-smoke --build-arg IMAGE_UPLOAD_RELEASE_COMMIT=1111111111111111111111111111111111111111 --build-arg IMAGE_UPLOAD_BUILD_FINGERPRINT=sha256:2222222222222222222222222222222222222222222222222222222222222222 -t ndt-studio-operator-smoke:test .
docker run --rm --entrypoint node ndt-studio-operator-smoke:test -e "require('playwright').chromium.executablePath(); require('/app/dist/scripts/run-image-upload-production-smoke.js'); console.log('operator smoke packaged: pass')"
```

Expected: tests/build pass, `Test-Path` returns `True`, and the one-shot image contains both the CLI and matching Playwright Chromium without modifying the backend image.

- [ ] **Step 5: Commit**

```powershell
git add apps/backend/src/scripts/run-image-upload-production-smoke.ts apps/backend/src/scripts/run-image-upload-production-smoke.spec.ts apps/backend/Dockerfile.operator-smoke apps/backend/package.json docker-compose.yml apps/backend/src/images/docker-runtime-contract.spec.ts
git commit -m "feat(images): package operator production smoke runner"
```

### Task 8: Bind runner output to admission verification and runbooks

**Files:**

- Modify: `scripts/verify-image-upload-final-ingress-gates.test.mjs`
- Modify: `scripts/verify-image-upload-workflow.mjs`
- Modify: `scripts/verify-image-upload-workflow.test.mjs`
- Modify: `docs/runbooks/image-upload-roll-forward.md`
- Modify: `docs/superpowers/specs/2026-07-23-stage09-two-phase-release-evidence-design.md`
- Modify: `docs/superpowers/plans/2026-07-23-stage09-two-phase-release-evidence.md`

- [ ] **Step 1: Write failing verifier/workflow documentation tests**

Generate a smoke receipt through the contract writer in a fixture harness and pass those exact bytes to final-ingress verification. Mutate one check, authorization digest, release field, and canonical hash and require failure. Extend workflow/runbook tests to require the packaged CLI command, explicit ingress mode transitions, smoke-token removal, journal cleanup ordering, and no memory gate.

- [ ] **Step 2: Run tests and observe RED**

```powershell
node scripts/verify-image-upload-final-ingress-gates.test.mjs
node scripts/verify-image-upload-workflow.test.mjs
```

Expected: new runner/runbook assertions fail.

- [ ] **Step 3: Update canonical operational documentation**

Document exact commands/environment names for disabled deployment, operator-smoke canaries, `run`, resumable `cleanup`, presign disable before drill, Phase 2 verification, general enablement, and secret removal. State that old protected evidence and encrypted backups remain untouched. Keep polling/HEAD and the optional memory diagnostic unchanged.

- [ ] **Step 4: Run verifier/workflow tests and observe GREEN**

```powershell
node scripts/verify-image-upload-final-ingress-gates.test.mjs
node scripts/verify-image-upload-workflow.test.mjs
npm run verify:image-upload-workflow
```

Expected: all tests pass and workflow still reports exactly three required jobs.

- [ ] **Step 5: Commit**

```powershell
git add scripts/verify-image-upload-final-ingress-gates.test.mjs scripts/verify-image-upload-workflow.mjs scripts/verify-image-upload-workflow.test.mjs docs/runbooks/image-upload-roll-forward.md docs/superpowers/specs/2026-07-23-stage09-two-phase-release-evidence-design.md docs/superpowers/plans/2026-07-23-stage09-two-phase-release-evidence.md
git commit -m "docs(images): operationalize operator production smoke"
```

### Task 9: Full verification and PR preparation

**Files:**

- Verify all files changed by Tasks 1–8.

- [ ] **Step 1: Run formatting and diff checks**

```powershell
npx prettier --check "apps/backend/src/**/*.ts" "apps/backend/test/**/*.ts" "docs/**/*.md" "scripts/**/*.mjs" "scripts/**/*.json"
git diff --check origin/main...HEAD
```

Expected: exit 0 with no whitespace errors.

- [ ] **Step 2: Run complete relevant test suites**

```powershell
npm run build --workspace=@ndt/image-upload-policy
npm test --workspace=@ndt/image-upload-policy
npm run test:image-upload:unit --workspace=backend
npm run test:image-upload:integration --workspace=backend
node scripts/verify-image-upload-production-gates.test.mjs
node scripts/verify-image-upload-final-ingress-gates.test.mjs
node scripts/verify-image-upload-workflow.test.mjs
npm run verify:image-upload-workflow
```

Expected: every command exits 0; no production credential is required.

- [ ] **Step 3: Run builds and packaged runtime checks**

```powershell
npm run build --workspace=backend
npm run build --workspace=frontend
docker build -f apps/backend/Dockerfile -t ndt-studio-backend:operator-smoke-test .
docker build -f apps/backend/Dockerfile.operator-smoke --build-arg IMAGE_UPLOAD_RELEASE_COMMIT=1111111111111111111111111111111111111111 --build-arg IMAGE_UPLOAD_BUILD_FINGERPRINT=sha256:2222222222222222222222222222222222222222222222222222222222222222 -t ndt-studio-operator-smoke:test .
docker run --rm --entrypoint node ndt-studio-operator-smoke:test -e "require('playwright').chromium.executablePath(); require('/app/dist/scripts/run-image-upload-production-smoke.js'); console.log('operator smoke packaged: pass')"
```

Expected: both application builds and both Docker builds pass; the backend image remains browser-free, while the temporary image prints `operator smoke packaged: pass` without starting a smoke run.

- [ ] **Step 4: Audit secrets and requirements**

```powershell
rg -n "IMAGE_UPLOAD_OPERATOR_TOKEN|IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN|NDT_PRODUCTION_SMOKE_TOKEN|X-Image-Upload-Smoke-Token" apps/backend docker-compose.yml docs scripts
rg -n "TO.DO|TB.D|implement lat.er|fill in det.ails" docs/superpowers/specs/2026-07-23-production-operator-smoke-runner-design.md docs/superpowers/plans/2026-07-23-production-operator-smoke-runner.md
git status --short
git log --oneline origin/main..HEAD
```

Expected: API never receives the cutover operator token; reconciler/migration never receive the smoke token; no placeholder exists; only intended files are changed/committed.

- [ ] **Step 5: Request review, then push and create PR**

Use `superpowers:requesting-code-review`, address findings, rerun Steps 1–4, then:

```powershell
git push -u origin feat/operator-production-smoke
$body = @(
  '## Summary',
  '',
  '- add a fail-closed disabled/operator-smoke/general ingress state machine',
  '- execute and receipt all twelve bounded production smoke checks',
  '- journal exact owned resources and guarantee resumable cleanup',
  '- preserve API/reconciler/cutover secret boundaries',
  '',
  '## Test plan',
  '',
  '- image-upload policy build and tests',
  '- backend image-upload unit/integration/e2e suites',
  '- production-gate/final-ingress/workflow verifier suites',
  '- backend/frontend builds and packaged Docker runtime contract'
) -join "`n"
gh pr create --base main --head feat/operator-production-smoke --title "feat(images): add operator production smoke runner" --body $body
```

The PR body must summarize the fail-closed ingress state machine, twelve real checks, cleanup/journal guarantees, role-secret boundaries, and exact verification commands. Do not merge the PR.
