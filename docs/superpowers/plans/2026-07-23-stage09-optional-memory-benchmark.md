# Stage 09 Optional Memory Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove memory evidence from production admission while preserving the deterministic browser-memory benchmark as an optional diagnostic.

**Architecture:** Phase 1 remains a closed schema but no longer accepts a `memory` object. The verifier removes all memory constants and semantic gates; the benchmark assets and pinned stable-Chrome configuration remain unchanged and outside required CI.

**Tech Stack:** Node.js 24, JSON Schema draft-07, Ajv, Node test runner, Playwright, Prettier.

---

### Task 1: Remove memory from the closed Phase 1 contract

**Files:**

- Modify: `scripts/verify-image-upload-production-gates.test.mjs`
- Modify: `scripts/schemas/image-upload-production-evidence.schema.json`
- Modify: `scripts/verify-image-upload-production-gates.mjs`
- Modify: `scripts/fixtures/image-upload-production-gates/pass.json`
- Delete: `scripts/fixtures/image-upload-production-gates/fail/memory-delta.json`
- Delete: `scripts/fixtures/image-upload-production-gates/fail/memory-fixture.json`
- Create: `scripts/fixtures/image-upload-production-gates/fail/legacy-memory-field.json`

- [ ] **Step 1: Write the failing schema-ordering test**

Extend the post-start contract test with:

```js
assert.equal(schema.required.includes('memory'), false);
assert.equal(Object.hasOwn(schema.properties, 'memory'), false);
assert.equal(Object.hasOwn(passFixture, 'memory'), false);
```

Add `legacy-memory-field.json` with `expectedGate: "schema"` and the former complete memory object. The test proves an old receipt is rejected instead of silently accepted.

- [ ] **Step 2: Run the production verifier test and observe RED**

Run:

```powershell
node --test scripts/verify-image-upload-production-gates.test.mjs
```

Expected: FAIL because `memory` is still required and present in the pass fixture.

- [ ] **Step 3: Remove the memory schema and semantic gate**

Delete `memory` from the schema required list and properties. Remove `REQUIRED_MEMORY_CONTEXTS`, `MEMORY_FIXTURE_SHA256`, and the memory block from `assertSemanticGates`. Remove the memory object from the pass fixture and replace the two threshold fixtures with the legacy-field schema fixture.

- [ ] **Step 4: Run focused tests and observe GREEN**

Run:

```powershell
node --test scripts/verify-image-upload-production-gates.test.mjs scripts/verify-image-upload-final-ingress-gates.test.mjs
```

Expected: all tests pass; `legacy-memory-field.json` fails only at `gate=schema` in fixture verification.

- [ ] **Step 5: Commit Task 1**

```powershell
git add scripts
git commit -m "fix(images): make memory benchmark optional"
```

### Task 2: Correct release documentation without deleting diagnostics

**Files:**

- Modify: `scripts/verify-image-upload-final-ingress-gates.test.mjs`
- Modify: `docs/superpowers/specs/2026-07-19-admin-web-image-optimization-roll-forward-design.md`
- Modify: `docs/superpowers/plans/2026-07-19-admin-web-image-optimization-roll-forward/README.md`
- Modify: `docs/superpowers/plans/2026-07-19-admin-web-image-optimization-roll-forward/08-packaging-ci-and-staging.md`
- Modify: `docs/superpowers/plans/2026-07-19-admin-web-image-optimization-roll-forward/09-production-cold-cutover-and-roll-forward.md`
- Modify: `docs/superpowers/plans/2026-07-19-admin-web-image-optimization-roll-forward/free-compatible-polling-amendment.md`
- Modify: `docs/runbooks/image-upload-roll-forward.md`

- [ ] **Step 1: Write a failing documentation/asset contract**

Add assertions that canonical release documentation contains `optional memory diagnostic`, does not contain `memory evidence is required for Phase 1`, and that these files still exist:

```text
apps/backend/test/generate-image-upload-memory-fixture.ts
apps/frontend/test/benchmark/image-upload-memory.benchmark.ts
```

Also assert workflow verification still rejects required jobs named `frontend-stable-chrome` or `frontend-image-memory`.

- [ ] **Step 2: Run the contract and observe RED**

Run:

```powershell
node --test scripts/verify-image-upload-final-ingress-gates.test.mjs
```

Expected: FAIL because canonical docs still call the benchmark a release gate.

- [ ] **Step 3: Amend canonical release language**

State exactly:

```text
The deterministic fixture, pinned stable Chrome, and memory thresholds remain an optional memory diagnostic. They are not CI, Phase 1, Phase 2, smoke, drill, or ingress gates.
```

Remove memory from production-hard-gate lists and receipt descriptions. Preserve benchmark commands only in an explicitly optional diagnostics section. State that missing optional results do not block admission.

- [ ] **Step 4: Verify docs and assets GREEN**

Run final-ingress tests, workflow verification, Prettier on changed docs/tests, and `git diff --check`.

- [ ] **Step 5: Commit Task 2**

```powershell
git add docs scripts/verify-image-upload-final-ingress-gates.test.mjs
git commit -m "docs(images): make memory checks diagnostic only"
```

### Task 3: Full local verification and handoff

**Files:** No new files.

- [ ] **Step 1: Run all release verifier tests**

```powershell
node --test scripts/image-upload-release-fingerprint.test.mjs scripts/verify-image-upload-production-gates.test.mjs scripts/verify-image-upload-final-ingress-gates.test.mjs
node scripts/verify-image-upload-workflow.mjs
```

Expected: all tests and the three-job workflow contract pass.

- [ ] **Step 2: Build the policy and backend**

```powershell
npm run build --workspace=@ndt/image-upload-policy
npm run build --workspace=backend
```

Expected: both builds exit 0.

- [ ] **Step 3: Run image-upload regression coverage**

```powershell
npm run test:image-upload:ci --workspace=backend
```

Expected: all unit, integration, and e2e image-upload suites pass.

- [ ] **Step 4: Verify the optional assets and production-code absence**

```powershell
Test-Path apps/backend/test/generate-image-upload-memory-fixture.ts
Test-Path apps/frontend/test/benchmark/image-upload-memory.benchmark.ts
rg -n "REQUIRED_MEMORY_CONTEXTS|MEMORY_FIXTURE_SHA256|receipt\.memory" scripts/verify-image-upload-production-gates.mjs
```

Expected: both paths print `True`; `rg` returns no matches.

- [ ] **Step 5: Verify formatting and branch state**

Run Prettier on changed files, parse every changed JSON file, run `git diff --check origin/main...HEAD`, and require an empty `git status --short`.

- [ ] **Step 6: Prepare handoff**

Report commits and verification. Do not push, open a PR, merge, dispatch staging, delete the old receipt, redeploy, enable presign, or open ingress without the next explicit operator decision.
