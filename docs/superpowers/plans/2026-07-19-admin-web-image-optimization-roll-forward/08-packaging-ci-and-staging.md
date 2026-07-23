# Packaging, CI, and Staging Implementation Plan

> **Free-compatible amendment:** Execute Task A4 and Task A6 in `free-compatible-polling-amendment.md`. Queue/DLQ/event-rule resource contracts and staging cases below are superseded and must not be provisioned or verified.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the shared policy and role-specific backend entrypoints correctly, enforce real browser checks, and qualify CopyObject/Queue behavior against isolated non-production resources.

**Architecture:** Docker builders compile workspace packages before applications and runners preserve public package exports. CI requires bundled Chromium and pinned Stable Chrome. Live staging uses long-lived non-production R2 resources, a dedicated non-production Supabase project whose ref must differ from production, a unique run prefix, and one orchestrator with guaranteed run-scoped cleanup. Testcontainers independently proves the full migration chain from an empty Supabase-compatible database.

**Tech Stack:** Docker, Docker Compose/Dokploy, GitHub Actions, Playwright, Testcontainers, Cloudflare R2/Queues, PowerShell.

---

### Task 1: Package workspace artifacts and process roles

**Files:**

- Modify: `apps/backend/Dockerfile`
- Modify: `apps/frontend/Dockerfile`
- Modify: `docker-compose.yml`
- Create: `apps/backend/src/images/docker-runtime-contract.spec.ts`

- [x] **Step 1: Write failing Docker runtime contract checks**

Assert both builders copy workspace manifests before `npm ci`, build `@ndt/image-upload-policy` before application compilation, and both runners contain:

```text
/app/packages/image-upload-policy/package.json
/app/packages/image-upload-policy/dist/esm/index.js
/app/packages/image-upload-policy/dist/cjs/index.js
/app/packages/image-upload-policy/dist/index.d.ts
/app/packages/image-upload-policy/dist/cjs/package.json
```

The backend runner additionally contains:

```text
/app/dist/src/main.js
/app/dist/scripts/reconcile-image-uploads.js
/app/dist/scripts/resolve-image-upload-promotion-conflict.js
/app/dist/scripts/resolve-image-upload-provider-event-quarantine.js
/app/apps/backend/package.json
```

- [x] **Step 2: Run the contract test and observe failure**

```powershell
npm test --workspace=backend -- docker-runtime-contract.spec.ts --runInBand
```

Expected: FAIL because Dockerfiles do not yet package the workspace or new entrypoints.

- [x] **Step 3: Update builders and runners**

Before `npm ci`, copy root lockfiles and every consumed workspace `package.json`. Build the policy package, then backend/frontend. Copy the compiled package into its exact workspace location; keep `/app/node_modules/@ndt/image-upload-policy` resolving there.

Do not test or copy nonexistent `dist/index.js`.

- [x] **Step 4: Add role-specific Compose services**

`backend` has `IMAGE_UPLOAD_PROCESS_ROLE=api` and no Queue/operator token. `images-upload-reconciler` uses the same immutable image, runs:

```text
node /app/dist/scripts/reconcile-image-uploads.js
```

and has `IMAGE_UPLOAD_PROCESS_ROLE=reconciler`, a Queue read/write secret, and a separate bucket-scoped R2 Object Read & Write credential because it performs HEAD/COPY/DELETE. It acquires the PostgreSQL session advisory lock through one dedicated `pg.Client`, publishes `ImageUploadReconcilerHeartbeat`, and runs the six bounded loops for Queue settlement, pending-session expiry CAS, promotion recovery, temporary-session cleanup, `ImageObjectDeletion`, and rate-limit-event cleanup. Configure restart policy and one replica; duplicate lock ownership or loss of the lock connection fails closed and aborts in-flight work.

- [x] **Step 5: Build and smoke production images**

Inside both runners run:

```text
node -e "require('@ndt/image-upload-policy')"
node -e "require('@ndt/image-upload-policy/fixtures')"
node --input-type=module -e "await import('@ndt/image-upload-policy')"
```

Inside the backend runner also run:

```text
node --check /app/dist/scripts/reconcile-image-uploads.js
node --check /app/dist/scripts/resolve-image-upload-promotion-conflict.js
node --check /app/dist/scripts/resolve-image-upload-provider-event-quarantine.js
```

Then execute:

```powershell
docker build -f apps/backend/Dockerfile .
docker build -f apps/frontend/Dockerfile .
docker compose config --quiet
```

Expected: both builds and all applicable runtime checks exit 0.

### Task 2: Add required browser CI and memory gate

**Files:**

- Create: `.github/workflows/image-upload.yml`
- Create: `scripts/verify-image-upload-workflow.mjs`
- Modify: `package.json`
- Modify: `apps/backend/package.json`
- Modify: `apps/frontend/package.json`
- Modify: `apps/frontend/playwright.config.ts`
- Create: `apps/frontend/test/benchmark/image-upload-memory.benchmark.ts`
- Create: `apps/backend/test/generate-image-upload-memory-fixture.ts`
- Modify: `.gitignore`

- [x] **Step 1: Write the failing workflow contract script**

The script parses the workflow and requires jobs named exactly:

```text
backend-image-upload
image-upload-packaging
frontend-playwright-chromium
```

Each required job must also set its effective workflow `name` to the exact context above. Add backend package scripts named exactly `test:image-upload:unit`, `test:image-upload:integration`, and `test:image-upload:ci`; the first two contain closed explicit committed test-path lists and the aggregate script invokes both. The verifier must prove from each job's `run` steps that `backend-image-upload` executes `npm run test:image-upload:ci --workspace=backend`, reject a bare generic Jest invocation as sufficient coverage, prove `test:focused` invokes `node --import tsx --test` and receives explicit frontend test paths rather than inheriting the full-suite glob, and reject bare `node --test` because it cannot resolve the workspace's extensionless TypeScript imports. It also proves `image-upload-packaging` builds both production images and validates Compose, and that the required browser job executes bundled Chromium. No required job may use job/step `continue-on-error`, a change-based conditional skip, or an unpinned browser channel. `frontend-stable-chrome` and `frontend-image-memory` must not exist as workflow jobs; their test/config assets remain manual release gates, and the benchmark must still emit absolute memory delta, control delta, and relative ratio.

- [x] **Step 2: Add pinned browsers and fail-closed projects**

Use Playwright bundled Chromium in required CI and keep a Chrome for Testing version pinned in workflow config with major at least 136 for the manual stable-Chrome release gate. Missing bundled Chromium, failed capability probe, skipped required Chromium project, or a required job that never executes its contract command fails the workflow verifier and the job. Missing `CFT_EXECUTABLE_PATH` fails the manual stable-Chrome project closed.

- [x] **Step 3: Implement the benchmark gate**

Generate the required input with Sharp 0.35.3 into the runner temp directory using this exact fixture contract:

```ts
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const width = 8192;
const height = 8192;
const channels = 3;
const raw = Buffer.allocUnsafe(width * height * channels);
let state = 0x4e445431 >>> 0;

for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        const noise = state & 31;
        raw[i++] = (x * 3 + y * 5 + noise) & 255;
        raw[i++] = (x * 7 + y * 11 + (noise << 1)) & 255;
        raw[i++] = (x * 13 + y * 17 + (noise << 2)) & 255;
    }
}

const jpegOptions = {
    quality: 90,
    chromaSubsampling: '4:2:0',
    progressive: false,
    mozjpeg: false,
    optimiseCoding: false,
} as const;

const jpeg = await sharp(raw, {
    raw: { width, height, channels },
})
    .jpeg(jpegOptions)
    .toBuffer();
const digest = createHash('sha256').update(jpeg).digest('hex');
assert.equal(jpeg.byteLength, 53_114_115);
assert.equal(digest, '1ac11dd1c64d39e79bdd3682bb11871ee2619b07a86fb923ba8412ab6dc3d581');
```

Do not call `withMetadata`; the output must contain no optional metadata. With the pinned Sharp build, require exactly 53,114,115 bytes and SHA-256 `1ac11dd1c64d39e79bdd3682bb11871ee2619b07a86fb923ba8412ab6dc3d581`. Any byte count or digest drift fails and prints the observed values. The generator refuses repository output paths and prints only the temp path, byte count, and digest; the manual release command passes that path to the benchmark.

Serve the benchmark with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`; assert `crossOriginIsolated === true`. For each of three pairs, launch separate browser processes for optimized and full-decode control; do not reuse a Playwright browser/context. In each process, fetch and retain the same fixture ArrayBuffer, run CDP `HeapProfiler.collectGarbage`, wait two animation frames plus 250 ms, and take the baseline with `performance.measureUserAgentSpecificMemory()`. The optimized process executes the production target-size path and holds its final output Blob and bounded thumbnail. The control process decodes without target sizing and holds the full decoded frame. Repeat garbage collection/wait/measurement, then compute `delta=after.bytes-before.bytes`.

Missing, rejected, non-finite, negative-delta, or non-isolated measurements fail closed. Emit the fixture digest, both measurements, both deltas, and ratio for each pair. Require every pair:

```text
optimized memory delta <= 536870912 bytes
optimized memory delta <= 0.50 × full-decode control delta
```

`0W9A1500.jpg` is optional local visual-quality evidence only and is never a required CI/benchmark input. Keep the exact root rule `/0W9A1500.jpg` in `.gitignore`; never read it from a required test, copy it into an image, upload it as an artifact, or force-add it.

- [x] **Step 4: Verify CI contracts locally**

```powershell
node scripts/verify-image-upload-workflow.mjs
if ($LASTEXITCODE -ne 0) { throw "workflow contract verification failed" }
npm run build --workspace=@ndt/image-upload-policy
if ($LASTEXITCODE -ne 0) { throw "image-upload policy build failed" }
npm test --workspace=frontend
if ($LASTEXITCODE -ne 0) { throw "frontend unit tests failed" }
Push-Location apps/frontend
try {
    npx --no-install playwright test test/image-upload.browser.spec.ts --project=chromium
    if ($LASTEXITCODE -ne 0) { throw "bundled Chromium gate failed" }
    $env:CFT_EXECUTABLE_PATH = "<path-to-pinned-Chrome-for-Testing-148.0.7778.96/chrome.exe>"
    npx --no-install playwright test test/image-upload.browser.spec.ts --project=stable-chrome
    if ($LASTEXITCODE -ne 0) { throw "pinned stable-Chrome gate failed" }
} finally {
    Pop-Location
}
$env:IMAGE_UPLOAD_MEMORY_FIXTURE = Join-Path $env:TEMP ("ndt-image-upload-memory-fixture-{0}.jpg" -f [guid]::NewGuid())
npm exec --workspace=backend -- tsx -- test/generate-image-upload-memory-fixture.ts --output $env:IMAGE_UPLOAD_MEMORY_FIXTURE
if ($LASTEXITCODE -ne 0) { throw "deterministic memory fixture generation failed" }
Push-Location apps/frontend
try {
    npx --no-install playwright test test/benchmark/image-upload-memory.benchmark.ts --project=chromium
    if ($LASTEXITCODE -ne 0) { throw "browser memory benchmark failed" }
} finally {
    Pop-Location
}
```

Expected: the three-job required workflow contract and bundled Chromium pass in CI; the explicit local commands also prove pinned stable-Chrome compatibility, the deterministic fixture digest, and memory thresholds before release.

### Task 3: Apply and prove the GitHub ruleset

**Files:**

- Create: `docs/runbooks/image-upload-github-ruleset.json`
- Create: `docs/runbooks/image-upload-github-ruleset.md`
- Create: `scripts/verify-image-upload-ruleset.mjs`

- [x] **Step 1: Add the reviewed ruleset payload**

The payload targets `refs/heads/main`, uses `enforcement=active`, has no bypass actors, and requires exactly:

```json
[
    { "context": "backend-image-upload" },
    { "context": "image-upload-packaging" },
    { "context": "frontend-playwright-chromium" }
]
```

- [x] **Step 2: Preview and apply only with operator approval**

```powershell
gh api repos/ngxtm/nguyendinhthinhstudio/rulesets
gh api --method POST repos/ngxtm/nguyendinhthinhstudio/rulesets --input docs/runbooks/image-upload-github-ruleset.json
```

Expected: the POST runs only after explicit operator approval and returns the created ruleset ID.

- [x] **Step 3: Read back rule details by ID**

The verifier must:

1. List `/repos/{owner}/{repo}/rulesets` and select `main-image-upload-required-checks`.
2. GET `/repos/{owner}/{repo}/rulesets/{ruleset_id}`.
3. Validate target, active enforcement, exact main ref condition, required contexts, strict status policy, and bypass actors.
4. Optionally GET `/repos/{owner}/{repo}/rules/branches/main` as applied-rule confirmation.
5. Treat `/branches/main/protection` 404 as acceptable only after ruleset verification succeeds.

```powershell
node scripts/verify-image-upload-ruleset.mjs
```

Expected: exit 0 only when the effective rules are proven.

### Task 4: Define long-lived non-production staging resources

**Files:**

- Create: `docs/runbooks/image-upload-staging-resources.md`
- Create: `apps/backend/test/staging-resource-contract.ts`
- Create: `apps/backend/src/images/staging-resource-contract.spec.ts`
- Modify: `apps/backend/package.json`

- [x] **Step 1: Write failing staging resource preflight tests**

Require explicit variables:

```text
NDT_STAGING_ACCOUNT_ID
NDT_STAGING_R2_ENDPOINT
NDT_STAGING_R2_BUCKET
NDT_STAGING_R2_CORS_ALLOWED_ORIGINS
NDT_STAGING_R2_ACCESS_KEY_ID
NDT_STAGING_R2_SECRET_ACCESS_KEY
NDT_STAGING_RECONCILER_R2_ACCESS_KEY_ID
NDT_STAGING_RECONCILER_R2_SECRET_ACCESS_KEY
NDT_STAGING_CUTOVER_R2_ACCESS_KEY_ID
NDT_STAGING_CUTOVER_R2_SECRET_ACCESS_KEY
NDT_STAGING_IMGPROXY_ACCESS_KEY_ID
NDT_STAGING_IMGPROXY_SECRET_ACCESS_KEY
NDT_STAGING_QUEUE_NAME
NDT_STAGING_QUEUE_ID
NDT_STAGING_DLQ_NAME
NDT_STAGING_DLQ_ID
NDT_STAGING_HTTP_CONSUMER_ID
NDT_STAGING_DLQ_HTTP_CONSUMER_ID
NDT_STAGING_QUEUE_TOKEN
NDT_STAGING_CUTOVER_QUEUE_TOKEN
NDT_STAGING_OPERATOR_TOKEN
NDT_STAGING_EVENT_RULE_ID
NDT_STAGING_CF_READ_TOKEN
NDT_STAGING_DENY_CANARY_R2_ENDPOINT
NDT_STAGING_DENY_CANARY_R2_BUCKET
NDT_PRODUCTION_R2_BUCKET
NDT_PRODUCTION_QUEUE_ID
NDT_PRODUCTION_DLQ_ID
NDT_PRODUCTION_EVENT_RULE_ID
NDT_PRODUCTION_API_R2_ACCESS_KEY_ID
NDT_PRODUCTION_RECONCILER_R2_ACCESS_KEY_ID
NDT_PRODUCTION_CUTOVER_R2_ACCESS_KEY_ID
NDT_PRODUCTION_IMGPROXY_ACCESS_KEY_ID
```

The preflight rejects a staging bucket, Queue ID, DLQ ID, rule ID, or role access-key ID equal to its explicit production counterpart; either missing consumer ID; Queue/DLQ equality; recursive DLQ binding; any shared API/reconciler/cutover/imgproxy credential; placeholder values; or any operator token in API/reconciler runtime environments. The deny-canary bucket must be an existing dedicated non-production bucket different from both staging and production. Active canaries prove each staging role credential has only its documented capability in the exact staging bucket/environment and is rejected against the deny-canary bucket; no negative canary targets production. Create-only overwrite protection is proved separately by exercising the application `cf-copy-destination-if-none-match: *` command path against a pre-existing destination and requiring the second COPY to fail without changing bytes or ETag. Prefix safety is proved separately at the application boundary: closed key builders and command allowlists accept only `uploads/staging/{runId}/` sources and create-only `albums/staging/{runId}/` destinations, reject traversal/cross-run/other-prefix keys before an SDK call, and allow temporary-source DELETE only. Do not require a long-lived R2 token to deny prefixes that Cloudflare scopes only through temporary credentials. The reconciler credential separately proves bucket-scoped Object Read & Write capability for HEAD/COPY/DELETE, the cutover credential proves only the operator conflict-resolution HEAD/DELETE paths exposed by its entrypoint, and the imgproxy credential proves read-only behavior. The preflight also reads back exact R2 CORS: the explicit staging admin/browser origins from `NDT_STAGING_R2_CORS_ALLOWED_ORIGINS`, method `PUT`, allowed header `Content-Type`, no wildcard origin/header, no non-local HTTP origin, and no unrelated exposed header. Tests use the exact names `NDT_STAGING_QUEUE_TOKEN`, `NDT_STAGING_CUTOVER_QUEUE_TOKEN`, `NDT_STAGING_OPERATOR_TOKEN`, and `NDT_STAGING_CF_READ_TOKEN`; the obsolete `NDT_STAGING_CF_TOKEN` spelling is forbidden from docs, fixtures, and runtime config.

- [x] **Step 2: Document one-time provider provisioning**

The long-lived staging Queue has an HTTP-pull consumer with explicit DLQ name, max retries, retry delay, batch size, and visibility timeout. The DLQ has a separate HTTP-pull inspection consumer with no recursive DLQ binding. The R2 event rule uses action exactly `CopyObject` and canonical prefix `albums/`; each run is isolated below it by `albums/staging/{runId}/`. Data credentials are bucket-scoped separately for API operations, reconciler Object Read & Write, cutover conflict-resolution HEAD/DELETE, and imgproxy read-only; prefix restrictions remain application invariants. Provision the exact staging CORS policy for direct browser PUT and record its rule/readback identity. The read token can inspect configuration, including CORS, but cannot mutate resources. Record the non-secret production identities and provision the existing non-production deny-canary bucket separately; the staging run never creates or deletes that bucket.

- [x] **Step 3: Implement exact readback preflight**

Use `NDT_STAGING_CF_READ_TOKEN` only in the preflight process to verify Queue/DLQ names and IDs, both consumer IDs/types, source consumer settings/DLQ binding, absence of recursive DLQ binding, event rule ID/action/prefix, retention, and the exact CORS origins/method/header policy. Strip it before starting API or reconciler children.

- [x] **Step 4: Verify the preflight against sanitized fixtures**

```powershell
npm test --workspace=backend -- staging-resource-contract.spec.ts --runInBand
npm run test:staging:preflight --workspace=backend
```

Expected: fixture tests pass; with live staging secrets present, exact provider readback also exits 0.

### Task 5: Build one staging orchestrator with guaranteed cleanup

**Files:**

- Create: `apps/backend/test/run-image-upload-staging.ts`
- Create: `apps/backend/test/run-image-upload-staging.integration-spec.ts`
- Modify: `apps/backend/package.json`
- Modify: `.github/workflows/image-upload.yml`

- [x] **Step 1: Write failing orchestration and interruption tests**

Assert one command owns the sequence:

```text
preflight → validate dedicated Supabase staging identity → migrate → backend suites
→ frontend/browser suites → real R2/Queue smoke → cleanup
```

Inject failures at every boundary plus SIGINT/SIGTERM. Cleanup must run exactly once in the orchestrator; CI may invoke the idempotent cleanup fallback with `if: always()`.

- [x] **Step 2: Define run identity and receipt**

Use a CI-provided or generated UUID run ID and prefixes:

```text
uploads/staging/{runId}/
albums/staging/{runId}/
```

Persist a non-secret run receipt outside the repository containing run ID, both exact prefixes, the SHA-256 fingerprint of the staging Supabase project ref, consumed event IDs, and cleanup status. On POSIX use mode 0600; on Windows apply an owner-only ACL. Long-lived provider resource IDs and the Supabase staging project are configuration, not deleted per run.

> **Polling receipt amendment:** The closed `image-upload-staging-receipt/v1-polling` replaces the historical event field with the exact release commit, workflow run ID/attempt, hashed database identity, qualification status, and cleanup status. The workflow uploads it after cleanup with `actions/upload-artifact@v4`, fails when it is missing, and retains it for 30 days. Production never accepts a reconstructed log digest.

- [x] **Step 3: Implement the single command**

Add scripts:

```json
{
    "test:staging:preflight": "tsx test/staging-resource-contract.ts",
    "test:staging:run": "tsx test/run-image-upload-staging.ts run",
    "test:staging:cleanup": "tsx test/run-image-upload-staging.ts cleanup"
}
```

The live orchestrator refuses ambient `DATABASE_URL`/`DIRECT_URL` and requires `NDT_STAGING_DATABASE_URL`, `NDT_STAGING_DIRECT_URL`, `NDT_STAGING_SUPABASE_PROJECT_REF`, and `NDT_PRODUCTION_SUPABASE_PROJECT_REF`. It validates that both connection identities contain the staging ref, rejects equal staging/production refs, and exposes only child `DATABASE_URL`/`DIRECT_URL`; receipts contain only a hash of the staging ref. Testcontainers is retained only for the empty-database migration regression, where a minimal Supabase-compatible auth schema and roles are bootstrapped before `prisma migrate deploy`. It maps `NDT_STAGING_OPERATOR_TOKEN` only to cutover-only `IMAGE_UPLOAD_OPERATOR_TOKEN`; API and reconciler children receive neither operator nor cutover secrets. The reconciler uses a dedicated `pg.Client` for the session advisory lock, publishes the singleton heartbeat, and must prove all bounded loops and their heartbeat timestamps before the orchestrator accepts the run.

- [ ] **Step 4: Exercise real provider behavior**

Required real cases:

- ordinary successful COPY whose exact response settles and commits even when no event arrives during the test window;
- response-loss presign retries at several clock instants whose parsed effective URL expiry always equals the original persisted `presignExpiresAt`, followed by no URL at/after expiry;
- client cancellation during optimization/presign/PUT and confirm response loss after verification begins, proving cancellation never aborts an in-flight confirm and recovery follows status/finalization;
- a later event attaches separate evidence to response-settled state;
- event before the Image transaction;
- CopyObject response loss followed by Queue settlement;
- crash after durable dispatch before the HTTP call;
- create-only destination-condition 412 recovery plus source-condition 412 reaching `dispatch_rejected + not_created` only after two absent destination HEADs, one visibility timeout, no event/Image, and a missing or mismatched source;
- canonical ETag normalization across quoted HEAD/Copy responses and unquoted, case-preserving events;
- recovery after restart using only promotion-persisted digest, bytes, MIME, dimensions, policy, canonical source ETag, destination, and lease;
- duplicate event while finalizing, after committed, and during cleanup-required, each re-entering the current state matrix;
- stale lease recovery;
- consumed/committed event ACK without delete;
- cleanup-required failed-promotion final deletion;
- legitimate committed-result deletion through `ImageObjectDeletion` while promotion remains `committed`;
- legacy R2 Image deletion through `authority=legacy_image` without fabricated upload authority, plus exclusion of existing `cloudflare_legacy/deferred` rows from R2 unresolved work;
- malformed, unmatched, and late-legacy-without-promotion messages creating durable quarantine records before reaching DLQ, with fingerprint `SHA-256(JCS({ providerEventId }))` for stable IDs or fallback exactly `SHA-256(JCS({ sourceQueueId, bodySha256 }))`, and no ephemeral message/lease input;
- one malformed message with null canonical envelope hash relocating source Queue -> DLQ with a different ephemeral ID, one valid unmatched event with a non-null canonical envelope hash, plus two independent same-body messages sharing one quarantine but producing distinct location/action histories; isolated `quarantined_ack` and `replay_requested` runs must ACK every pre-replay lease, reject hash-only replay when no fresh body exists, publish an `image-upload-replay/v1` envelope with stable `replayRequestId`, survive crash after partial ACK, ACK-before-outcome append, and publish-before-`replay_published`, no-envelope-after-visibility republish reusing the same intent/request ID, deterministically retain one replay request identity across source->DLQ relocation, reopen the same quarantine with a new resolution-attempt ID if the unwrapped replay is still malformed while preserving the prior immutable snapshot, retire and ACK the old replay envelope in the next attempt, reject orphan/action-location/provider-outcome drift, acquire the singleton lock and survive lock loss, wait a full visibility timeout so a previously hidden lease can reappear, exhaustively rescan both queues, and refuse `resolved` while any other matching message remains;
- an audit-observed message crossing `max_retries` into DLQ, then being found there and ACKed with a fresh DLQ lease after the matching database commit;
- late event after `dispatch_rejected + not_created`, durable conflict creation, DLQ inspection, and each of `confirmed_absent_ack`, `cleanup_authorized`, and `committed_authorized` in isolated fixtures;
- a real cross-origin browser presigned PUT from every allowed staging origin, plus rejection of a disallowed origin, every non-local HTTP origin, and wildcard-only configuration;
- presigned PUT rejection for wrong Content-Length, wrong Content-Type, missing/changed required signed header, wrong key, and expired URL;
- consumed-session temporary DeleteObject timeout/retry plus final verification only after presign expiry and clock skew;
- abandon followed by a late valid PUT, proving cleanup does not close until the post-expiry final absent HEAD;
- restart after DB commit before ACK;
- dedicated advisory-lock connection loss and singleton heartbeat freshness;
- expired-pending CAS terminalization versus confirm/abandon races, including one-time reservation release and cleanup scheduling;
- bounded deletion of rate-limit events older than ten minutes;
- restart/idempotency of Queue settlement, pending-session expiry, promotion recovery, temporary-session cleanup, `ImageObjectDeletion`, and rate-limit cleanup loops;
- imgproxy rendering of every canonical variant.

Before cleanup require exact CORS readback, no unresolved run promotion, no open run promotion conflict, no `open | resolving` or internally inconsistent provider-event quarantine/location/action evidence, no expired pending session, no due/unverified terminal temporary cleanup, no applicable R2 image-deletion work, no run message in source Queue/DLQ except the exact recorded `replayRequestId` envelope for an isolated replay case, and no unreferenced canonical object.

- [x] **Step 5: Implement idempotent cleanup**

In `finally`, delete only `uploads/staging/{runId}/` and `albums/staging/{runId}/`, require each suite to remove or roll back its run-scoped database fixtures, and update the receipt. Never drop, reset, or destroy the dedicated Supabase staging project. Do not delete the deny-canary bucket or credentials. A cleanup rerun derives scope from the retained run ID/receipt and exits 0 only after both R2 prefixes and run-scoped test data are absent.

CI adds a fourth, non-ruleset staging job that runs only for explicit `workflow_dispatch`, targets a protected `staging` environment, and is serialized independently from the three required pull-request jobs:

```yaml
image-upload-staging:
    if: github.event_name == 'workflow_dispatch'
    environment: staging
    concurrency:
        group: image-upload-staging
        cancel-in-progress: false
    steps:
        - name: Run staging qualification
          run: npm run test:staging:run --workspace=backend
        - name: Cleanup staging run
          if: always()
          run: npm run test:staging:cleanup --workspace=backend
```

The protected environment owns the staging secrets and requires operator approval before release. The workflow verifier permits this explicit event guard only for `image-upload-staging`; none of the three ruleset-required jobs may be conditionally skipped.

- [x] **Step 6: Verify orchestrator tests**

```powershell
npm run test:integration --workspace=backend -- run-image-upload-staging.integration-spec.ts
npm run test:staging:run --workspace=backend
```

Expected: injected failures clean up locally; the real run passes and leaves no run-scoped resource.

### Task 6: Stage gate and commit

- [x] **Step 1: Run packaging and CI checks**

```powershell
node scripts/verify-image-upload-workflow.mjs
node scripts/verify-image-upload-ruleset.mjs
docker build -f apps/backend/Dockerfile .
docker build -f apps/frontend/Dockerfile .
docker compose config --quiet
git diff --check
```

Expected: workflow/ruleset contracts, images, Compose, and diff checks pass.

- [x] **Step 2: Commit**

```powershell
git add .github apps/backend/Dockerfile apps/backend/package.json apps/backend/src/images/docker-runtime-contract.spec.ts apps/backend/src/images/staging-resource-contract.spec.ts apps/backend/src/scripts apps/backend/test apps/frontend/Dockerfile apps/frontend/package.json docker-compose.yml docs/runbooks scripts .gitignore package-lock.json
git commit -m "ci(images): package roles and qualify staging"
```
