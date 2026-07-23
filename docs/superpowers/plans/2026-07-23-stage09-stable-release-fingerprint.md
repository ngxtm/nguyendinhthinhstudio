# Stage 09 Stable Release Fingerprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the circular Docker-output heartbeat identity with a stable fingerprint derived from the exact merged release commit while retaining the actual running Docker image ID as separate deployment evidence.

**Architecture:** One small Node CLI owns the version-1 fingerprint algorithm and is reused by CI, the production evidence verifier, and the runbook. The backend base image is pinned by digest, the production receipt binds `commitSha`, `releaseFingerprint`, and the independently observed `imageDigest`, and Dokploy may rebuild without changing the heartbeat identity for that release.

**Tech Stack:** Node.js 24, node:test, Docker/BuildKit, GitHub Actions, JSON Schema/Ajv, Docker Compose/Dokploy, PostgreSQL.

---

### Task 1: Implement the canonical release-fingerprint CLI

**Files:**

- Create: `scripts/image-upload-release-fingerprint.mjs`
- Create: `scripts/image-upload-release-fingerprint.test.mjs`

- [ ] **Step 1: Write failing algorithm and CLI tests**

Create `scripts/image-upload-release-fingerprint.test.mjs` with node:test coverage that:

```js
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createReleaseFingerprint } from './image-upload-release-fingerprint.mjs';

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const cli = resolve(scriptsDirectory, 'image-upload-release-fingerprint.mjs');
const commit = 'b'.repeat(40);
const expected = `sha256:${createHash('sha256').update(commit, 'utf8').digest('hex')}`;

test('hashes the exact lowercase full commit with no newline', () => {
    assert.equal(createReleaseFingerprint(commit), expected);
});

for (const invalid of ['main', 'b'.repeat(12), 'B'.repeat(40), `${commit}\n`, `sha256:${commit}`]) {
    test(`rejects noncanonical commit input ${JSON.stringify(invalid)}`, () => {
        assert.throws(() => createReleaseFingerprint(invalid), /40-character lowercase Git commit/);
    });
}

test('CLI prints only the canonical fingerprint', () => {
    const result = spawnSync(process.execPath, [cli, commit], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `${expected}\n`);
});

test('CLI rejects missing or multiple arguments', () => {
    for (const args of [[], [commit, commit]]) {
        const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /exactly one full Git commit/);
    }
});
```

- [ ] **Step 2: Run the tests and observe the expected RED state**

Run:

```powershell
node --test scripts/image-upload-release-fingerprint.test.mjs
```

Expected: FAIL because `scripts/image-upload-release-fingerprint.mjs` does not exist.

- [ ] **Step 3: Implement the minimal canonical helper and CLI**

Create `scripts/image-upload-release-fingerprint.mjs`:

```js
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function createReleaseFingerprint(commitSha) {
    if (!/^[a-f0-9]{40}$/.test(commitSha)) {
        throw new Error('release fingerprint requires one 40-character lowercase Git commit');
    }
    return `sha256:${createHash('sha256').update(commitSha, 'utf8').digest('hex')}`;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    if (process.argv.length !== 3) {
        process.stderr.write('expected exactly one full Git commit\n');
        process.exitCode = 1;
    } else {
        try {
            process.stdout.write(`${createReleaseFingerprint(process.argv[2])}\n`);
        } catch (error) {
            process.stderr.write(`${error instanceof Error ? error.message : 'release fingerprint failed'}\n`);
            process.exitCode = 1;
        }
    }
}
```

- [ ] **Step 4: Run focused tests and observe GREEN**

Run:

```powershell
node --test scripts/image-upload-release-fingerprint.test.mjs
```

Expected: all algorithm and CLI tests PASS.

- [ ] **Step 5: Commit the helper**

```powershell
git add scripts/image-upload-release-fingerprint.mjs scripts/image-upload-release-fingerprint.test.mjs
git commit -m "feat(images): add stable release fingerprint helper"
```

### Task 2: Bind production evidence to commit, fingerprint, and image ID

**Files:**

- Modify: `scripts/schemas/image-upload-production-evidence.schema.json`
- Modify: `scripts/fixtures/image-upload-production-gates/pass.json`
- Create: `scripts/fixtures/image-upload-production-gates/fail/release-fingerprint-binding.json`
- Modify: `scripts/verify-image-upload-production-gates.mjs`
- Test: `scripts/verify-image-upload-production-gates.test.mjs`

- [ ] **Step 1: Add the failing evidence fixture and schema expectations**

Add `releaseFingerprint` to the `release.required` array and properties in the schema:

```json
"releaseFingerprint": {
    "type": "string",
    "pattern": "^sha256:[a-f0-9]{64}$"
}
```

Add this exact passing value beside `commitSha` in `pass.json`:

```json
"releaseFingerprint": "sha256:e26d2da3ab585c9840b157a4a9b5639fda905c2ad33d04d2c598be8883b51236"
```

Create `scripts/fixtures/image-upload-production-gates/fail/release-fingerprint-binding.json`:

```json
{
    "base": "../pass.json",
    "expectedGate": "releaseFingerprintBinding",
    "set": {
        "release.releaseFingerprint": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
}
```

- [ ] **Step 2: Run verifier tests and observe the expected RED state**

Run:

```powershell
node --test scripts/verify-image-upload-production-gates.test.mjs
```

Expected: FAIL because the verifier does not yet reject the mismatched release fingerprint.

- [ ] **Step 3: Enforce the semantic binding**

Import the canonical helper into `scripts/verify-image-upload-production-gates.mjs`:

```js
import { createReleaseFingerprint } from './image-upload-release-fingerprint.mjs';
```

At the beginning of `assertSemanticGates(receipt)`, before policy binding, add:

```js
if (
    receipt.release.releaseFingerprint !==
    createReleaseFingerprint(receipt.release.commitSha)
) {
    fail('releaseFingerprintBinding', 'release commit/fingerprint binding differs');
}
```

- [ ] **Step 4: Run verifier tests and observe GREEN**

Run:

```powershell
node --test scripts/image-upload-release-fingerprint.test.mjs scripts/verify-image-upload-production-gates.test.mjs
```

Expected: pass fixture succeeds, release-fingerprint mismatch fails at `releaseFingerprintBinding`, and all verifier tests PASS.

- [ ] **Step 5: Commit production evidence binding**

```powershell
git add scripts/schemas/image-upload-production-evidence.schema.json scripts/fixtures/image-upload-production-gates/pass.json scripts/fixtures/image-upload-production-gates/fail/release-fingerprint-binding.json scripts/verify-image-upload-production-gates.mjs scripts/verify-image-upload-production-gates.test.mjs
git commit -m "feat(images): bind release evidence fingerprint"
```

### Task 3: Pin the backend base and derive CI fingerprint from the checkout

**Files:**

- Modify: `apps/backend/Dockerfile`
- Modify: `.github/workflows/image-upload.yml`
- Test: `apps/backend/src/images/docker-runtime-contract.spec.ts`

- [ ] **Step 1: Write failing Docker and workflow contract tests**

Extend `docker-runtime-contract.spec.ts` to require:

```ts
expect(dockerfile).toContain(
  'FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS base',
);
expect(dockerfile).not.toContain('FROM node:24-alpine AS base');
expect(workflow).toContain(`release_commit="$(git rev-parse HEAD)"`);
expect(workflow).toContain(
  `fingerprint="$(node scripts/image-upload-release-fingerprint.mjs "$release_commit")"`,
);
expect(workflow).not.toContain(
  `fingerprint="$(docker image inspect --format '{{.Id}}' "$BACKEND_IMAGE")"`,
);
```

Retain the existing assertions that `BACKEND_IMAGE` and `IMAGE_UPLOAD_BUILD_FINGERPRINT` are separate Compose inputs.

- [ ] **Step 2: Run the focused test and observe RED**

Run:

```powershell
npm test --workspace=backend -- --runInBand --runTestsByPath src/images/docker-runtime-contract.spec.ts
```

Expected: FAIL on the mutable base reference and Docker-output workflow derivation.

- [ ] **Step 3: Pin the base image and update packaging CI**

Change the backend Dockerfile base line to:

```dockerfile
FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS base
```

Replace the packaging workflow fingerprint step with:

```yaml
- name: Bind Compose heartbeat fingerprint to checked-out release
  run: |
      release_commit="$(git rev-parse HEAD)"
      fingerprint="$(node scripts/image-upload-release-fingerprint.mjs "$release_commit")"
      echo "IMAGE_UPLOAD_BUILD_FINGERPRINT=$fingerprint" >> "$GITHUB_ENV"
      echo "RELEASE_COMMIT=$release_commit" >> "$GITHUB_ENV"
- name: Record produced Docker image ID
  run: docker image inspect --format 'IMAGE_ID={{.Id}}' "$BACKEND_IMAGE"
```

- [ ] **Step 4: Run focused tests and Docker packaging**

Run:

```powershell
npm run build --workspace=@ndt/image-upload-policy
npm test --workspace=backend -- --runInBand --runTestsByPath src/images/docker-runtime-contract.spec.ts src/scripts/reconcile-image-uploads.spec.ts
docker build -f apps/backend/Dockerfile -t ndt-stable-release-fingerprint:test .
```

Expected: contract tests PASS, the pinned base resolves, runtime alias guards pass, and the image builds successfully.

- [ ] **Step 5: Commit packaging changes**

```powershell
git add apps/backend/Dockerfile .github/workflows/image-upload.yml apps/backend/src/images/docker-runtime-contract.spec.ts
git commit -m "fix(images): stabilize reconciler release identity"
```

### Task 4: Synchronize Stage 09 plan and operator runbook

**Files:**

- Modify: `docs/superpowers/plans/2026-07-19-admin-web-image-optimization-roll-forward/09-production-cold-cutover-and-roll-forward.md`
- Modify: `docs/runbooks/image-upload-roll-forward.md`
- Verify: `docs/superpowers/specs/2026-07-19-admin-web-image-optimization-roll-forward-design.md`

- [ ] **Step 1: Replace Docker-output fingerprint instructions**

Document this exact release preparation flow in the runbook:

```sh
RELEASE_COMMIT="$(git rev-parse HEAD)"
IMAGE_UPLOAD_BUILD_FINGERPRINT="$(
  node scripts/image-upload-release-fingerprint.mjs "$RELEASE_COMMIT"
)"
printf '%s\n' "RELEASE_COMMIT=$RELEASE_COMMIT"
printf '%s\n' "IMAGE_UPLOAD_BUILD_FINGERPRINT=$IMAGE_UPLOAD_BUILD_FINGERPRINT"
```

State explicitly that the resulting fingerprint is copied into Dokploy before deploy, while the post-build `docker image inspect .Id` is stored separately as `release.imageDigest` evidence.

- [ ] **Step 2: Correct Stage 09 Task 5 and evidence wording**

Require the heartbeat to match `release.releaseFingerprint`, the API/migration/reconciler containers to share the actual `release.imageDigest`, and the receipt verifier to recompute `releaseFingerprint` from `commitSha`. In the Stage 09 closed-contract table, add `releaseFingerprint` immediately after `commitSha` in the `productionReceipt.release` tuple. Remove every instruction that makes `IMAGE_UPLOAD_BUILD_FINGERPRINT` equal Docker output identity.

- [ ] **Step 3: Scan for contradictory fingerprint instructions**

Run:

```powershell
rg -n "IMAGE_UPLOAD_BUILD_FINGERPRINT|resolved immutable ID|docker image inspect|releaseFingerprint|imageDigest" docs/runbooks/image-upload-roll-forward.md docs/superpowers/specs/2026-07-19-admin-web-image-optimization-roll-forward-design.md docs/superpowers/plans/2026-07-19-admin-web-image-optimization-roll-forward/09-production-cold-cutover-and-roll-forward.md
git diff --check
```

Expected: no Docker-output heartbeat instruction and no whitespace error.

- [ ] **Step 4: Commit synchronized documentation**

```powershell
git add docs/runbooks/image-upload-roll-forward.md docs/superpowers/plans/2026-07-19-admin-web-image-optimization-roll-forward/09-production-cold-cutover-and-roll-forward.md docs/superpowers/specs/2026-07-19-admin-web-image-optimization-roll-forward-design.md docs/superpowers/plans/2026-07-23-stage09-stable-release-fingerprint.md
git commit -m "docs(images): synchronize stable release fingerprint rollout"
```

### Task 5: Verify and publish the corrective PR

**Files:**

- Verify: all files changed in Tasks 1–4

- [ ] **Step 1: Install the locked workspace and run complete verification**

Run:

```powershell
npm ci
npm run build --workspace=@ndt/image-upload-policy
npm run build --workspace=backend
node --test scripts/image-upload-release-fingerprint.test.mjs scripts/verify-image-upload-production-gates.test.mjs
npm test --workspace=backend -- --runInBand
docker build -f apps/backend/Dockerfile -t ndt-stable-release-fingerprint:test .
git diff --check
git status --short --branch
```

Expected: backend build exits 0, all script/backend tests pass, Docker packaging passes with the pinned base, and only planned files differ from `origin/main`.

- [ ] **Step 2: Request independent code review**

Review `origin/main...HEAD` against the canonical spec. Fix every Critical or Important finding and rerun the affected focused plus full verification.

- [ ] **Step 3: Push and create the PR**

```powershell
git push -u origin fix/stage09-stable-release-fingerprint
$body = "Stable commit-derived heartbeat fingerprint; actual Docker image ID remains separate evidence. Presign remains disabled. Includes identical 61,200-file content-hash evidence, production evidence binding, pinned backend base image, CI contracts, backend/script tests, and Docker packaging verification."
gh pr create --base main --head fix/stage09-stable-release-fingerprint --title "fix(images): stabilize Stage 09 release fingerprint" --body $body
```

The PR body records the production-safe state (`IMAGE_UPLOAD_PRESIGN_ENABLED=false`), the identical 61,200-file content-hash evidence, the old/new image-ID mismatch that motivated the correction, and all verification commands. Do not merge automatically; the operator merges after required checks pass.

### Task 6: Redeploy the corrected release and verify heartbeat evidence

**Files:**

- Runtime only: Dokploy production environment and protected Stage 09 evidence

- [ ] **Step 1: Prepare the merged release identity on the VPS**

From a clean production checkout of merged `main`, run:

```sh
git fetch origin main
git merge --ff-only origin/main
RELEASE_COMMIT="$(git rev-parse HEAD)"
IMAGE_UPLOAD_BUILD_FINGERPRINT="$(
  node scripts/image-upload-release-fingerprint.mjs "$RELEASE_COMMIT"
)"
BACKEND_IMAGE="ndt-studio-backend:$(printf '%s' "$RELEASE_COMMIT" | cut -c1-12)"
printf '%s\n' "RELEASE_COMMIT=$RELEASE_COMMIT"
printf '%s\n' "BACKEND_IMAGE=$BACKEND_IMAGE"
printf '%s\n' "IMAGE_UPLOAD_BUILD_FINGERPRINT=$IMAGE_UPLOAD_BUILD_FINGERPRINT"
```

Expected: one full 40-character commit, one unique image tag, and one canonical `sha256:<64 lowercase hex>` release fingerprint.

- [ ] **Step 2: Configure Dokploy and redeploy once**

Set the printed `BACKEND_IMAGE` and `IMAGE_UPLOAD_BUILD_FINGERPRINT`, keep `IMAGE_UPLOAD_PRESIGN_ENABLED=false`, save, and redeploy. Do not enable upload ingress or perform PUT/COPY/DELETE smoke in this step.

- [ ] **Step 3: Verify container and heartbeat bindings**

Require:

```text
backend-migrate exit code = 0
backend health = healthy
frontend health = healthy
backend, migration, and reconciler actual Docker image IDs are equal
reconciler environment fingerprint = recomputed release fingerprint
database heartbeat buildFingerprint = recomputed release fingerprint
exactly one advisory-lock owner
all five loop completion timestamps are non-null and advance
IMAGE_UPLOAD_PRESIGN_ENABLED=false
```

Read the heartbeat without printing the database URL:

```sh
RECONCILER_CONTAINER="$(
  docker ps --format '{{.Names}}' |
  grep -E 'images-upload-reconciler-1$' |
  head -n 1
)"
docker exec "$RECONCILER_CONTAINER" node -e '
const { Client } = require("pg");
(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const result = await client.query(`
    SELECT "ownerId", "buildFingerprint", "heartbeatAt",
           "pendingSessionExpiryCompletedAt", "promotionRecoveryCompletedAt",
           "temporaryCleanupCompletedAt", "imageDeletionCompletedAt",
           "rateLimitCleanupCompletedAt"
    FROM "ImageUploadReconcilerHeartbeat"
    WHERE "id" = $1
  `, ["singleton"]);
  process.stdout.write(JSON.stringify(result.rows[0]) + "\n");
  await client.end();
})().catch((error) => {
  process.stderr.write(error.message + "\n");
  process.exitCode = 1;
});
'
```

- [ ] **Step 4: Record evidence and remove only the diagnostic image**

Record the release commit, release fingerprint, Docker tag, actual image ID, container-role binding, heartbeat snapshot, and five-loop snapshot. After acceptance and explicit operator confirmation, remove only `ndt-runtime-diagnostic:e5def03130fe`; do not remove the running release image or either encrypted database backup.

Expected: Stage 09 Task 5 Step 1 has fresh evidence and no Docker-ID/fingerprint redeploy loop remains.
