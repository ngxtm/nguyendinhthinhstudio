# Stage 09 Two-Phase Release Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retain verifiable staging evidence, remove the Stage 09 post-start/drill dependency cycle, add a fail-closed final-ingress gate, and document evidence-driven cleanup.

**Architecture:** Phase 1 verifies the presign-disabled release and authorizes only operator-only smoke. Phase 2 independently binds the successful Phase 1 evidence, operator smoke, a roll-forward drill ending at the active release, and two final zero snapshots before general ingress. Staging qualification produces a closed polling-only receipt that is uploaded after cleanup and supplied as a protected verifier input.

**Tech Stack:** Node.js 24, TypeScript, JSON Schema draft-07, Ajv, Node test runner, GitHub Actions, Prettier.

---

### Task 1: Retain a closed polling-only staging receipt

**Files:**

- Modify: `apps/backend/test/run-image-upload-staging.ts`
- Modify: `apps/backend/test/run-image-upload-staging.integration-spec.ts`
- Modify: `.github/workflows/image-upload.yml`
- Modify: `scripts/verify-image-upload-workflow.mjs`
- Create: `scripts/schemas/image-upload-staging-receipt.schema.json`

- [ ] **Step 1: Write failing staging receipt tests**

Extend the staging orchestrator tests to require this closed receipt shape:

```ts
{
  schemaVersion: 'image-upload-staging-receipt/v1-polling',
  runId,
  releaseCommitSha: 'a'.repeat(40),
  workflowRunId: '29847372686',
  workflowRunAttempt: 1,
  sourcePrefix: `uploads/staging/${runId}/`,
  destinationPrefix: `albums/staging/${runId}/`,
  databaseIdentity: `supabase:${'b'.repeat(64)}`,
  qualificationStatus: 'passed',
  cleanupStatus: 'complete',
  updatedAt: '<RFC3339>'
}
```

Assert that `consumedEventIds` is absent, successful verification records `qualificationStatus='passed'`, failure records `qualificationStatus='failed'`, and final cleanup persists `cleanupStatus='complete'`.

- [ ] **Step 2: Run the staging tests and observe RED**

Run:

```powershell
npm exec --workspace=backend -- jest --config ./test/jest-integration.json --runInBand --runTestsByPath test/run-image-upload-staging.integration-spec.ts
```

Expected: FAIL because the staging receipt lacks the new closed identity/status fields and still contains `consumedEventIds`.

- [ ] **Step 3: Implement the minimal staging receipt contract**

Remove the unused queue-era `consumedEventIds` field. Require canonical `GITHUB_SHA`, numeric `GITHUB_RUN_ID`, and positive `GITHUB_RUN_ATTEMPT` outside unit tests; accept explicit values through `StagingQualificationOptions` in tests. Mark qualification passed only after every suite and invariant succeeds, mark it failed in `catch`, and persist cleanup status in `finally`.

Create a closed JSON schema with exact prefix patterns, lowercase 40-hex commit, numeric workflow run ID, positive attempt, hashed database identity, closed statuses, and RFC3339 timestamp.

- [ ] **Step 4: Write a failing workflow artifact contract**

Add workflow-verifier requirements for:

```yaml
- name: Upload sanitized staging receipt
  if: always()
  uses: actions/upload-artifact@v4
  with:
      name: image-upload-staging-receipt-${{ github.run_id }}-${{ github.run_attempt }}
      path: ${{ runner.temp }}/ndt-image-upload-staging-receipt.json
      if-no-files-found: error
      retention-days: 30
```

The verifier must also prove the upload step appears after cleanup and that qualification, cleanup, and upload use the same path.

- [ ] **Step 5: Run workflow verification and observe RED**

Run `node scripts/verify-image-upload-workflow.mjs`.

Expected: FAIL with `image-upload-staging must upload sanitized receipt after cleanup`.

- [ ] **Step 6: Add the artifact upload step and verify GREEN**

Add the exact upload step after cleanup. Run the staging test and workflow verifier again.

Expected: both pass.

- [ ] **Step 7: Commit Task 1**

```powershell
git add apps/backend/test/run-image-upload-staging.ts apps/backend/test/run-image-upload-staging.integration-spec.ts .github/workflows/image-upload.yml scripts/verify-image-upload-workflow.mjs scripts/schemas/image-upload-staging-receipt.schema.json
git commit -m "fix(images): retain sanitized staging receipt"
```

### Task 2: Make the post-start gate a real Phase 1 boundary

**Files:**

- Modify: `scripts/schemas/image-upload-production-evidence.schema.json`
- Modify: `scripts/verify-image-upload-production-gates.mjs`
- Modify: `scripts/verify-image-upload-production-gates.test.mjs`
- Modify: `scripts/fixtures/image-upload-production-gates/pass.json`
- Delete: `scripts/fixtures/image-upload-production-gates/fail/roll-forward-drill.json`
- Create: `scripts/fixtures/image-upload-production-gates/fail/staging-binding.json`

- [ ] **Step 1: Write failing Phase 1 ordering tests**

Require the production schema to use:

```text
image-upload-production-gate-receipt/v3-post-start-polling
```

Assert `rollForwardDrillDecision`, operator-smoke fields, and final-ingress fields are neither required nor allowed. Extend production-mode invocation to require a fourth protected distinct input:

```text
--staging-receipt <absolute path>
```

Create a real staging receipt in the production-mode test and bind `stagingReceiptPathSha256` and `stagingReceiptSha256` to its path and bytes. Test changed bytes, wrong prefix/run ID, failed qualification, incomplete cleanup, broad permissions on POSIX, and aliasing with another evidence path.

- [ ] **Step 2: Run production-gate tests and observe RED**

Run:

```powershell
node --test scripts/verify-image-upload-production-gates.test.mjs
```

Expected: FAIL because the old schema still requires the drill and the CLI rejects `--staging-receipt`.

- [ ] **Step 3: Implement Phase 1 schema and staging binding**

Remove `rollForwardDrillDecision`, bump receipt and approval schema versions to v3 post-start, accept only the four production evidence inputs, compile the staging schema with Ajv, require a closed successful/clean staging receipt, validate its run-bound prefixes, and recompute the bound path/byte digests.

Keep fixture mode test-only; it verifies schema and semantic fields but does not pretend to read protected production inputs.

- [ ] **Step 4: Verify Phase 1 GREEN**

Run the production-gate test, release-fingerprint test, and workflow verifier.

Expected: all pass and the removed drill fail fixture no longer exists.

- [ ] **Step 5: Commit Task 2**

```powershell
git add scripts/schemas scripts/verify-image-upload-production-gates.mjs scripts/verify-image-upload-production-gates.test.mjs scripts/fixtures/image-upload-production-gates
git commit -m "fix(images): separate post-start admission from drill"
```

### Task 3: Add the fail-closed Phase 2 final-ingress verifier

**Files:**

- Create: `scripts/schemas/image-upload-final-ingress-evidence.schema.json`
- Create: `scripts/schemas/image-upload-operator-smoke-receipt.schema.json`
- Create: `scripts/schemas/image-upload-roll-forward-drill-receipt.schema.json`
- Create: `scripts/verify-image-upload-final-ingress-gates.mjs`
- Create: `scripts/verify-image-upload-final-ingress-gates.test.mjs`
- Create: `scripts/fixtures/image-upload-final-ingress-gates/pass.json`
- Create: `scripts/fixtures/image-upload-final-ingress-gates/fail/*.json`
- Modify: `package.json`

- [ ] **Step 1: Write failing closed-schema tests**

Define a final receipt with schema version `image-upload-final-ingress-receipt/v1-polling`. Require path/byte bindings for Phase 1 receipt and approval, smoke authorization/receipt, and drill receipt/approval; bind the active release tuple; require exactly two final polling snapshots and `rollForwardDrillDecision='pass'`.

Define the operator-smoke receipt with twelve explicit boolean checks, all `const: true`: browser upload, absolute-expiry retry, allowed CORS, denied CORS, response-first settlement, copy-response-loss HEAD settlement, unchanged destination retry, fail-closed conflict, committed deletion, failed-promotion cleanup, expiry-plus-skew cleanup, and imgproxy rendering.

Define the drill receipt with distinct `fromRelease` and `toRelease`, presign-disabled/ingress-blocked start evidence, forward-only migration decision, Phase 1 binding for `toRelease`, successful operator smoke, and decision `pass`.

Tests must reject unknown or sensitive fields, nonzero snapshots, a barrier below 30 seconds, evidence aliases, changed bytes, wrong canonical hashes, broad permissions, release drift, a drill that does not end at the active release, missing approvals, and any false smoke check.

- [ ] **Step 2: Run final-ingress tests and observe RED**

Run:

```powershell
node --test scripts/verify-image-upload-final-ingress-gates.test.mjs
```

Expected: FAIL because the verifier and schemas do not exist.

- [ ] **Step 3: Implement minimal final-ingress verification**

Reuse the established stable canonical JSON, SHA-256, protected absolute path, owner-only POSIX permission, timestamp, zero-gate, and forbidden-material rules. Do not import production verifier internals unless they are first extracted into a small tested evidence utility; avoid duplicating divergent security checks.

The production CLI requires explicit distinct absolute arguments for final receipt, final approval, Phase 1 receipt/approval, smoke authorization/receipt, and drill receipt/approval. Fixture mode remains restricted to `NODE_ENV=test` and the committed fixture root.

- [ ] **Step 4: Add a package command and verify GREEN**

Add:

```json
"verify:image-upload-final-ingress": "node scripts/verify-image-upload-final-ingress-gates.mjs"
```

Run both production and final-ingress verifier tests.

Expected: all fixtures report their exact expected gate and the pass fixtures exit 0.

- [ ] **Step 5: Commit Task 3**

```powershell
git add package.json scripts/schemas scripts/verify-image-upload-final-ingress-gates.mjs scripts/verify-image-upload-final-ingress-gates.test.mjs scripts/fixtures/image-upload-final-ingress-gates
git commit -m "feat(images): add final ingress evidence gate"
```

### Task 4: Correct the canonical ordering and add cleanup lifecycle

**Files:**

- Modify: `docs/superpowers/specs/2026-07-19-admin-web-image-optimization-roll-forward-design.md`
- Modify: `docs/superpowers/plans/2026-07-19-admin-web-image-optimization-roll-forward/README.md`
- Modify: `docs/superpowers/plans/2026-07-19-admin-web-image-optimization-roll-forward/08-packaging-ci-and-staging.md`
- Modify: `docs/superpowers/plans/2026-07-19-admin-web-image-optimization-roll-forward/09-production-cold-cutover-and-roll-forward.md`
- Modify: `docs/superpowers/plans/2026-07-19-admin-web-image-optimization-roll-forward/free-compatible-polling-amendment.md`
- Modify: `docs/runbooks/image-upload-roll-forward.md`
- Create: `docs/runbooks/image-upload-evidence-cleanup.md`

- [ ] **Step 1: Add a failing documentation contract test**

Create assertions in the final-ingress verifier test that the runbook order is exactly:

```text
post-start Phase 1 approval
operator-only ingress and smoke
roll-forward drill ending at active release
two final zero snapshots
final-ingress approval
general ingress
rollback-window cleanup
```

Also require documentation to forbid cleanup of encrypted backups and running/rollback images.

- [ ] **Step 2: Run the documentation contract and observe RED**

Expected: FAIL because the current runbook requires the drill before the receipt that authorizes it and has no closed cleanup lifecycle.

- [ ] **Step 3: Amend canonical docs and cleanup runbook**

Replace the single cyclic gate with the two phases. Document that the forthcoming correction release itself can be the forward target of the drill: the drill begins at the currently deployed release and passes only when it ends at the newly approved active release without starting a prior generation.

The cleanup runbook must inventory first, emit a retain/purge manifest, default to dry-run, require explicit operator confirmation for mutation, refuse encrypted backup paths, refuse images referenced by any container, retain one rollback image until the rollback window closes, and require credential revocation/readback before removing config-read secrets.

- [ ] **Step 4: Verify docs and formatting GREEN**

Run final-ingress tests, `npx prettier --check` on all changed Markdown/JSON/JS/YAML files, and `git diff --check`.

- [ ] **Step 5: Commit Task 4**

```powershell
git add docs
git commit -m "docs(images): define two-phase admission and cleanup"
```

### Task 5: Full local verification and handoff

**Files:** No new files.

- [ ] **Step 1: Run focused release verification**

```powershell
node --test scripts/image-upload-release-fingerprint.test.mjs scripts/verify-image-upload-production-gates.test.mjs scripts/verify-image-upload-final-ingress-gates.test.mjs
node scripts/verify-image-upload-workflow.mjs
npm exec --workspace=backend -- jest --config ./test/jest-integration.json --runInBand --runTestsByPath test/run-image-upload-staging.integration-spec.ts
```

Expected: every test passes and the workflow verifier reports exactly three required ruleset jobs.

- [ ] **Step 2: Run repository formatting and static checks**

```powershell
npx prettier --check .github/workflows/image-upload.yml package.json scripts apps/backend/test docs/runbooks docs/superpowers/specs docs/superpowers/plans
git diff --check origin/main...HEAD
git status --short
```

Expected: formatting and diff checks pass; status is clean.

- [ ] **Step 3: Review the complete branch diff**

Confirm no Queue/DLQ/Event Notification contract returned, no secret/value was committed, manual memory remains outside required CI, no production action is embedded in tests, and cleanup defaults to non-mutating inventory.

- [ ] **Step 4: Prepare user handoff**

Report commits, exact tests, remaining operational sequence, and the fact that no push, PR, merge, deploy, staging rerun, presign enablement, or cleanup occurred automatically.
