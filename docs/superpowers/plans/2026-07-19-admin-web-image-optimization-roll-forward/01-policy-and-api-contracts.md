# Policy and API Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create deterministic shared upload-policy hashing and closed current-version upload API contracts.

**Architecture:** A compiled `@ndt/image-upload-policy` package owns immutable policy normalization, RFC 8785 hashing, grammar, and fixtures. `@ndt/types` owns type-only response unions. The backend accepts only the current `web-v1` request shape after cutover.

**Tech Stack:** TypeScript 5.8, Node 24, npm workspaces, Node test runner, SHA-256.

---

### Task 1: Scaffold the compiled policy package

**Files:**

- Create: `packages/image-upload-policy/package.json`
- Create: `packages/image-upload-policy/tsconfig.json`
- Create: `packages/image-upload-policy/tsconfig.types.json`
- Create: `packages/image-upload-policy/tsconfig.esm.json`
- Create: `packages/image-upload-policy/tsconfig.cjs.json`
- Create: `packages/image-upload-policy/scripts/write-cjs-package.mjs`
- Create: `packages/image-upload-policy/src/index.ts`
- Create: `packages/image-upload-policy/test/package-exports.test.ts`
- Modify: `package-lock.json`

- [ ] **Step 1: Write the failing package-resolution test**

Create subprocess cases equivalent to:

```ts
const cases = [
    ['import', `import('@ndt/image-upload-policy')`],
    ['require', `require('@ndt/image-upload-policy')`],
    ['fixtures-import', `import('@ndt/image-upload-policy/fixtures')`],
    ['fixtures-require', `require('@ndt/image-upload-policy/fixtures')`],
];
```

Assert every subprocess exits 0 after implementation and no resolved filename contains `/src/` or `\\src\\`.

- [ ] **Step 2: Run the test and observe the expected failure**

```powershell
npm test --workspace=@ndt/image-upload-policy
```

Expected: FAIL because the workspace and exports do not exist.

- [ ] **Step 3: Add exact build scripts and exports**

Use:

```json
{
    "type": "module",
    "scripts": {
        "build": "npm run build:types && npm run build:esm && npm run build:cjs && node scripts/write-cjs-package.mjs",
        "build:types": "tsc -p tsconfig.types.json",
        "build:esm": "tsc -p tsconfig.esm.json",
        "build:cjs": "tsc -p tsconfig.cjs.json",
        "test": "node --import tsx --test test/**/*.test.ts"
    },
    "exports": {
        ".": {
            "types": "./dist/index.d.ts",
            "import": "./dist/esm/index.js",
            "require": "./dist/cjs/index.js"
        },
        "./fixtures": {
            "types": "./dist/fixtures.d.ts",
            "import": "./dist/esm/fixtures.js",
            "require": "./dist/cjs/fixtures.js"
        }
    }
}
```

`write-cjs-package.mjs` writes exactly `{ "type": "commonjs" }` to `dist/cjs/package.json`.

- [ ] **Step 4: Build and verify the real artifact set**

```powershell
npm install
npm run build --workspace=@ndt/image-upload-policy
npm test --workspace=@ndt/image-upload-policy
$required = @(
  "packages/image-upload-policy/dist/esm/index.js",
  "packages/image-upload-policy/dist/cjs/index.js",
  "packages/image-upload-policy/dist/index.d.ts",
  "packages/image-upload-policy/dist/cjs/package.json"
)
$required | ForEach-Object { if (-not (Test-Path -LiteralPath $_)) { throw "missing artifact: $_" } }
```

Expected: all commands exit 0. Do not require `dist/index.js`; no build emits it.

### Task 2: Define the deterministic current policy

**Files:**

- Create: `packages/image-upload-policy/src/policy.ts`
- Create: `packages/image-upload-policy/src/policy-hash.ts`
- Create: `packages/image-upload-policy/test/policy-hash.test.ts`
- Modify: `packages/image-upload-policy/src/index.ts`

- [ ] **Step 1: Write failing deterministic vectors**

Assert the initial normalized values:

```ts
const expected = {
    minimumChromiumMajor: 136,
    softTargetBytes: 3_145_728,
    maxStoredBytes: 5_242_880,
    maxSourceBytes: 104_857_600,
    maxWidth: 2560,
    maxHeight: 2560,
    maxDecodedPixels: 7_000_000,
    webpQuality: 0.84,
    normalizedColorSpace: 'srgb',
    metadataRulesetVersion: 'web-metadata-v1',
};
```

Also test sorted/deduplicated digest lists, rejected non-finite numbers, stable object-key ordering, and a stable `web-v1-<64 lowercase hex>` version.

- [ ] **Step 2: Verify the vectors fail**

```powershell
npm test --workspace=@ndt/image-upload-policy -- policy-hash.test.ts
```

Expected: FAIL because policy normalization and hashing are absent.

- [ ] **Step 3: Implement normalization and hashing**

Define an explicit `ImageUploadPolicy`. Hash a schema/version prefix plus RFC 8785 canonical UTF-8 JSON. Include all content/browser compatibility fields. Exclude process role, process count, decode permits, R2 timeouts, presign enablement, Queue settings, and browser benchmark thresholds.

- [ ] **Step 4: Verify stable vectors**

```powershell
npm test --workspace=@ndt/image-upload-policy -- policy-hash.test.ts
npm run build --workspace=@ndt/image-upload-policy
```

Expected: all policy vectors PASS and repeated builds produce the same version.

### Task 3: Define closed current-version API contracts

**Files:**

- Create: `packages/types/src/image-upload.ts`
- Create: `packages/types/src/image-upload.type-test.ts`
- Create: `packages/types/tsconfig.json`
- Modify: `packages/types/src/index.ts`
- Modify: `packages/types/package.json`

- [ ] **Step 1: Write failing exhaustiveness tests**

The request is current-only:

```ts
export type UploadPresignRequest = {
    clientRequestId: string;
    albumId: string;
    filename: string;
    contentType: CanonicalImageMime;
    fileSize: number;
    processedSha256: string;
    policyVersion: string;
};
```

Define closed unions for `PublicImageResponse`, `PolicyResponse`, `PresignResponse`, `ConfirmResponse`, `UploadSessionStatusResponse`, `AbandonResponse`, and `UploadErrorResponse`. Include exact outcomes `pending`, `finalizing`, `consumed`, `failed`, `gone`, `deleted`, and `unavailable` where relevant. The corresponding stable error codes remain `upload_result_deleted` and `upload_result_unavailable`. A consumed response includes the persisted absolute `retentionExpiresAt` for the exact 30-day result window.

The type test must prove there is no request variant without `clientRequestId`, `processedSha256`, or `policyVersion`; do not define `legacy-v0` or `legacy-head-only`.

- [ ] **Step 2: Run the type check and observe failure**

```powershell
npx tsc --noEmit --project packages/types/tsconfig.json
```

Expected: FAIL until the type module and config exist.

- [ ] **Step 3: Implement and export type-only contracts**

`packages/types` exports TypeScript types only. Application consumers use `import type`; do not add runtime validators or emitted values.

- [ ] **Step 4: Verify builds contain no runtime `@ndt/types` import**

```powershell
npx tsc --noEmit --project packages/types/tsconfig.json
npm run build --workspace=backend
npm run build --workspace=frontend
$matches = rg -n "require\(['\"]@ndt/types|from ['\"]@ndt/types" apps/backend/dist
$rgExit = $LASTEXITCODE
if ($rgExit -eq 0) { $matches; throw "runtime @ndt/types import found" }
if ($rgExit -ne 1) { throw "rg tooling failure: exit $rgExit" }
```

Expected: type check and builds exit 0; `rg` exit 1 proves absence.

### Task 4: Stage gate and commit

- [ ] **Step 1: Run the complete contract suite**

```powershell
npm test --workspace=@ndt/image-upload-policy
npm run build --workspace=@ndt/image-upload-policy
npx tsc --noEmit --project packages/types/tsconfig.json
npm run build --workspace=backend
npm run build --workspace=frontend
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Commit**

```powershell
git add packages/image-upload-policy packages/types package-lock.json
git commit -m "feat(images): add current upload policy contracts"
```
