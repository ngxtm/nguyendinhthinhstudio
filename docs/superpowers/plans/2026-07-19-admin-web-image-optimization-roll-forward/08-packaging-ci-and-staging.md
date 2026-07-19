# Packaging, CI, and Staging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the shared policy and role-specific backend entrypoints correctly, enforce real browser checks, and qualify CopyObject/Queue behavior against isolated non-production resources.

**Architecture:** Docker builders compile workspace packages before applications and runners preserve public package exports. CI requires bundled Chromium and pinned Stable Chrome. Staging uses long-lived non-production R2/Queue resources, a unique run prefix, a disposable PostgreSQL database, and one orchestrator with guaranteed cleanup.

**Tech Stack:** Docker, Docker Compose/Dokploy, GitHub Actions, Playwright, Testcontainers, Cloudflare R2/Queues, PowerShell.

---

### Task 1: Package workspace artifacts and process roles

**Files:**

- Modify: `apps/backend/Dockerfile`
- Modify: `apps/frontend/Dockerfile`
- Modify: `docker-compose.yml`
- Create: `apps/backend/src/images/docker-runtime-contract.spec.ts`

- [ ] **Step 1: Write failing Docker runtime contract checks**

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
/app/apps/backend/package.json
```

- [ ] **Step 2: Run the contract test and observe failure**

```powershell
npm test --workspace=backend -- docker-runtime-contract.spec.ts --runInBand
```

Expected: FAIL because Dockerfiles do not yet package the workspace or new entrypoints.

- [ ] **Step 3: Update builders and runners**

Before `npm ci`, copy root lockfiles and every consumed workspace `package.json`. Build the policy package, then backend/frontend. Copy the compiled package into its exact workspace location; keep `/app/node_modules/@ndt/image-upload-policy` resolving there.

Do not test or copy nonexistent `dist/index.js`.

- [ ] **Step 4: Add role-specific Compose services**

`backend` has `IMAGE_UPLOAD_PROCESS_ROLE=api` and no Queue/operator token. `images-upload-reconciler` uses the same immutable image, runs:

```text
node /app/dist/scripts/reconcile-image-uploads.js
```

and has `IMAGE_UPLOAD_PROCESS_ROLE=reconciler`, Queue read/write secret, scoped R2 reconciliation credentials, advisory lock, heartbeat, restart policy, and one replica. Duplicate lock ownership fails closed.

- [ ] **Step 5: Build and smoke production images**

Inside both runners run:

```text
node -e "require('@ndt/image-upload-policy')"
node -e "require('@ndt/image-upload-policy/fixtures')"
node --input-type=module -e "await import('@ndt/image-upload-policy')"
```

Inside the backend runner also run:

```text
node --check /app/dist/scripts/reconcile-image-uploads.js
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
- Modify: `apps/frontend/package.json`
- Modify: `apps/frontend/playwright.config.ts`
- Create: `apps/frontend/test/benchmark/image-upload-memory.benchmark.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Write the failing workflow contract script**

The script parses the workflow and requires jobs named exactly:

```text
frontend-playwright-chromium
frontend-stable-chrome
```

Neither job may use `continue-on-error`, conditional skipping, or an unpinned browser channel. The benchmark must emit absolute memory delta, control delta, and relative ratio.

- [ ] **Step 2: Add pinned browsers and fail-closed projects**

Use Playwright bundled Chromium and a Chrome for Testing version pinned in workflow config with major at least 136. Missing binary, failed capability probe, or skipped required project fails the job.

- [ ] **Step 3: Implement the benchmark gate**

Run three fresh contexts and require each:

```text
optimized memory delta <= 536870912 bytes
optimized memory delta <= 0.50 × full-decode control delta
```

Before the local fixture is used:

```powershell
git check-ignore -q -- 0W9A1500.jpg
git status --short -- 0W9A1500.jpg
```

Expected: first exits 0 and second prints nothing. Add exact root rule `/0W9A1500.jpg` to `.gitignore`; never force-add the fixture.

- [ ] **Step 4: Verify CI contracts locally**

```powershell
node scripts/verify-image-upload-workflow.mjs
npm test --workspace=frontend
npm exec --workspace=frontend playwright test test/image-upload.browser.spec.ts --project=chromium
```

Expected: workflow contract, frontend tests, and bundled Chromium pass.

### Task 3: Apply and prove the GitHub ruleset

**Files:**

- Create: `docs/runbooks/image-upload-github-ruleset.json`
- Create: `docs/runbooks/image-upload-github-ruleset.md`
- Create: `scripts/verify-image-upload-ruleset.mjs`

- [ ] **Step 1: Add the reviewed ruleset payload**

The payload targets `refs/heads/main`, uses `enforcement=active`, has no bypass actors, and requires exactly:

```json
[{ "context": "frontend-playwright-chromium" }, { "context": "frontend-stable-chrome" }]
```

- [ ] **Step 2: Preview and apply only with operator approval**

```powershell
gh api repos/ngxtm/nguyendinhthinhstudio/rulesets
gh api --method POST repos/ngxtm/nguyendinhthinhstudio/rulesets --input docs/runbooks/image-upload-github-ruleset.json
```

Expected: the POST runs only after explicit operator approval and returns the created ruleset ID.

- [ ] **Step 3: Read back rule details by ID**

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

- [ ] **Step 1: Write failing staging resource preflight tests**

Require explicit variables:

```text
NDT_STAGING_ACCOUNT_ID
NDT_STAGING_R2_ENDPOINT
NDT_STAGING_R2_BUCKET
NDT_STAGING_R2_ACCESS_KEY_ID
NDT_STAGING_R2_SECRET_ACCESS_KEY
NDT_STAGING_IMGPROXY_ACCESS_KEY_ID
NDT_STAGING_IMGPROXY_SECRET_ACCESS_KEY
NDT_STAGING_QUEUE_NAME
NDT_STAGING_QUEUE_ID
NDT_STAGING_DLQ_NAME
NDT_STAGING_DLQ_ID
NDT_STAGING_HTTP_CONSUMER_ID
NDT_STAGING_DLQ_HTTP_CONSUMER_ID
NDT_STAGING_QUEUE_TOKEN
NDT_STAGING_EVENT_RULE_ID
NDT_STAGING_CF_READ_TOKEN
```

The preflight rejects production bucket, Queue ID, DLQ ID, rule ID, either missing consumer ID, Queue/DLQ equality, recursive DLQ binding, shared API/imgproxy credentials, placeholder values, or any operator write token in child runtime environments.

- [ ] **Step 2: Document one-time provider provisioning**

The long-lived staging Queue has an HTTP-pull consumer with explicit DLQ name, max retries, retry delay, batch size, and visibility timeout. The DLQ has a separate HTTP-pull inspection consumer with no recursive DLQ binding. The R2 event rule uses action exactly `CopyObject` and prefix `staging/`. Data credentials are scoped separately for API read/write and imgproxy read-only. The read token can inspect configuration but cannot mutate resources.

- [ ] **Step 3: Implement exact readback preflight**

Use `NDT_STAGING_CF_READ_TOKEN` only in the preflight process to verify Queue/DLQ names and IDs, both consumer IDs/types, source consumer settings/DLQ binding, absence of recursive DLQ binding, event rule ID/action/prefix, and retention. Strip it before starting API or reconciler children.

- [ ] **Step 4: Verify the preflight against sanitized fixtures**

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

- [ ] **Step 1: Write failing orchestration and interruption tests**

Assert one command owns the sequence:

```text
preflight → disposable database → migrate → backend suites
→ frontend/browser suites → real R2/Queue smoke → cleanup
```

Inject failures at every boundary plus SIGINT/SIGTERM. Cleanup must run exactly once in the orchestrator; CI may invoke the idempotent cleanup fallback with `if: always()`.

- [ ] **Step 2: Define run identity and receipt**

Use a CI-provided or generated UUID run ID and prefixes:

```text
staging/{runId}/uploads/
staging/{runId}/albums/
```

Persist a non-secret run receipt outside the repository containing run ID, prefix, disposable database identity, consumed event IDs, and cleanup status. On POSIX use mode 0600; on Windows apply an owner-only ACL. Long-lived provider resource IDs are configuration, not deleted per run.

- [ ] **Step 3: Implement the single command**

Add scripts:

```json
{
    "test:staging:preflight": "tsx test/staging-resource-contract.ts",
    "test:staging:run": "tsx test/run-image-upload-staging.ts run",
    "test:staging:cleanup": "tsx test/run-image-upload-staging.ts cleanup"
}
```

The orchestrator uses Testcontainers PostgreSQL and refuses ambient `DATABASE_URL`/`DIRECT_URL`. API and reconciler children receive only their role-specific secrets and the unique run prefix.

- [ ] **Step 4: Exercise real provider behavior**

Required real cases:

- ordinary successful COPY with event after commit;
- event before the Image transaction;
- CopyObject response loss;
- crash after durable dispatch before the HTTP call;
- create-only destination condition and HTTP 412 recovery;
- duplicate event;
- stale lease recovery;
- consumed event ACK without delete;
- cleanup-required final deletion;
- malformed/unmatched message to DLQ;
- restart after DB commit before ACK;
- imgproxy rendering of every canonical variant.

Before cleanup require no unresolved run promotion, no run message in source Queue/DLQ, and no unreferenced canonical object.

- [ ] **Step 5: Implement idempotent cleanup**

In `finally`, delete only the run prefix, stop/drop the disposable database, and update the receipt. Do not delete the long-lived Queue, DLQ, consumer, rule, or credentials. A cleanup rerun derives scope from the retained run ID/receipt and exits 0 only after prefix and run messages are absent.

CI adds:

```yaml
concurrency:
  group: image-upload-staging
  cancel-in-progress: false

- name: Cleanup staging run
  if: always()
  run: npm run test:staging:cleanup --workspace=backend
```

- [ ] **Step 6: Verify orchestrator tests**

```powershell
npm run test:integration --workspace=backend -- run-image-upload-staging.integration-spec.ts
npm run test:staging:run --workspace=backend
```

Expected: injected failures clean up locally; the real run passes and leaves no run-scoped resource.

### Task 6: Stage gate and commit

- [ ] **Step 1: Run packaging and CI checks**

```powershell
node scripts/verify-image-upload-workflow.mjs
node scripts/verify-image-upload-ruleset.mjs
docker build -f apps/backend/Dockerfile .
docker build -f apps/frontend/Dockerfile .
docker compose config --quiet
git diff --check
```

Expected: workflow/ruleset contracts, images, Compose, and diff checks pass.

- [ ] **Step 2: Commit**

```powershell
git add .github apps/backend/Dockerfile apps/backend/package.json apps/backend/src/images/docker-runtime-contract.spec.ts apps/backend/src/images/staging-resource-contract.spec.ts apps/backend/test apps/frontend/Dockerfile apps/frontend/package.json docker-compose.yml docs/runbooks scripts .gitignore package-lock.json
git commit -m "ci(images): package roles and qualify staging"
```
