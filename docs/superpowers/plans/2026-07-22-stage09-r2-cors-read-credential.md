# Stage 09 R2 CORS Read Credential Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route production cutover CORS readback through a distinct temporary R2 Admin Read Only credential while retaining the bucket-scoped cutover credential for every object operation.

**Architecture:** The strict cutover runtime requires two additional config-read credential variables. The cutover entrypoint creates a second S3 client and injects it only into `R2CutoverObjectStore.corsMismatch()`; HEAD and DELETE stay on the existing client. Closed production evidence records only a fifth distinct credential fingerprint.

**Tech Stack:** NestJS/TypeScript, AWS SDK v3 S3 client, Jest, Node JSON Schema verifier.

---

### Task 1: Enforce cutover-only configuration

**Files:**
- Modify: `apps/backend/src/images/image-upload-runtime-config.ts`
- Test: `apps/backend/src/images/image-upload-runtime-config.spec.ts`
- Test: `apps/backend/src/scripts/image-upload-cutover.spec.ts`

- [x] **Step 1: Write failing configuration tests**

Add `IMAGE_UPLOAD_CUTOVER_R2_CONFIG_READ_ACCESS_KEY_ID` and `IMAGE_UPLOAD_CUTOVER_R2_CONFIG_READ_SECRET_ACCESS_KEY` to the valid cutover fixture. Delete each key independently and require `parseImageUploadRuntimeConfig(..., 'cutover')` to throw its name. Inject either key into valid API and reconciler fixtures and require a forbidden-role failure.

- [x] **Step 2: Run the focused tests and observe failure**

Run:

```powershell
npm test --workspace=backend -- --runInBand --runTestsByPath src/images/image-upload-runtime-config.spec.ts src/scripts/image-upload-cutover.spec.ts
```

Expected: FAIL because cutover does not require the new variables and runtime roles do not reject them.

- [x] **Step 3: Implement strict role configuration**

Add the two exact names to `roleRequired.cutover`, to `roleForbidden.api`, and to `roleForbidden.reconciler`. Keep them out of API/reconciler values and sanitized fingerprints.

- [x] **Step 4: Rerun the focused tests**

Expected: PASS.

### Task 2: Route CORS through the read-only client

**Files:**
- Modify: `apps/backend/src/images/image-upload-cutover.pg.ts`
- Test: `apps/backend/src/images/image-upload-cutover.service.spec.ts`
- Modify: `apps/backend/src/scripts/image-upload-cutover.ts`
- Test: `apps/backend/src/scripts/image-upload-cutover.spec.ts`

- [x] **Step 1: Write the failing client-routing test**

Construct `R2CutoverObjectStore` with distinct fake data-plane and config-read clients. Require `head()` to send `HeadObjectCommand` only through the data-plane client and `corsMismatch()` to send `GetBucketCorsCommand` only through the config-read client.

- [x] **Step 2: Run the focused test and observe failure**

Run:

```powershell
npm test --workspace=backend -- --runInBand --runTestsByPath src/images/image-upload-cutover.service.spec.ts
```

Expected: FAIL because `corsMismatch()` currently uses the data-plane client.

- [x] **Step 3: Implement the separate client**

Extend the constructor without breaking existing tests:

```ts
constructor(
  private readonly client: S3Client,
  private readonly bucket: string,
  private readonly expectedCorsOrigins: readonly string[] = [],
  private readonly operationTimeoutMs = 30_000,
  private readonly corsClient: S3Client = client,
) {}
```

Change only `corsMismatch()` to call `this.corsClient.send(new GetBucketCorsCommand(...))`. In `runCutoverCommand`, create `configReadClient` from the two new variables, pass it as the fifth constructor argument, and destroy both clients in `finally`.

- [x] **Step 4: Rerun focused tests**

Expected: PASS with exact command routing.

### Task 3: Close production evidence around the fifth credential

**Files:**
- Modify: `scripts/schemas/image-upload-production-evidence.schema.json`
- Modify: `scripts/fixtures/image-upload-production-gates/pass.json`
- Modify: `scripts/fixtures/image-upload-production-gates/fail/role-credential-isolation.json`
- Modify: `scripts/verify-image-upload-production-gates.mjs`
- Test: `scripts/verify-image-upload-production-gates.test.mjs`

- [x] **Step 1: Write failing schema and isolation tests**

Require provider field `cutoverR2ConfigReadCredentialFingerprintSha256`. Add it to the pass fixture with a unique SHA-256. In the isolation fail fixture, duplicate the cutover data-plane fingerprint into the new field and require gate `credentialIsolation`.

- [x] **Step 2: Run verifier tests and observe failure**

Run:

```powershell
node --test scripts/verify-image-upload-production-gates.test.mjs
```

Expected: FAIL because the schema/verifier does not know or compare the new fingerprint.

- [x] **Step 3: Implement the closed evidence field**

Add the required SHA-256 property to the provider schema and include it in `credentialFingerprints` in the semantic verifier. Unknown fields remain rejected.

- [x] **Step 4: Rerun verifier tests**

Expected: all verifier tests pass and the isolation fixture fails only at `credentialIsolation`.

### Task 4: Verify and close the amendment

**Files:**
- Modify: `docs/superpowers/plans/2026-07-19-admin-web-image-optimization-roll-forward/free-compatible-polling-amendment.md`

- [x] **Step 1: Run focused and build checks**

```powershell
npm test --workspace=backend -- --runInBand --runTestsByPath src/images/image-upload-runtime-config.spec.ts src/images/image-upload-cutover.service.spec.ts src/scripts/image-upload-cutover.spec.ts
node --test scripts/verify-image-upload-production-gates.test.mjs
npm run build --workspace=backend
git diff --check
```

Expected: every command exits 0.

- [x] **Step 2: Mark Task A5.0 implementation checkboxes complete**

Tick Steps 1 and 2 only after the focused tests and build pass. Leave provider behavior/revocation Step 3 open until the new production credential passes live read-only CORS and denied-write canaries and is later revoked.

- [x] **Step 3: Commit**

```powershell
git add apps/backend/src/images/image-upload-runtime-config.ts apps/backend/src/images/image-upload-runtime-config.spec.ts apps/backend/src/images/image-upload-cutover.pg.ts apps/backend/src/images/image-upload-cutover.service.spec.ts apps/backend/src/scripts/image-upload-cutover.ts apps/backend/src/scripts/image-upload-cutover.spec.ts scripts/schemas/image-upload-production-evidence.schema.json scripts/fixtures/image-upload-production-gates scripts/verify-image-upload-production-gates.mjs scripts/verify-image-upload-production-gates.test.mjs docs/superpowers/plans/2026-07-19-admin-web-image-optimization-roll-forward/free-compatible-polling-amendment.md
git commit -m "fix(images): separate cutover CORS read credential"
```
