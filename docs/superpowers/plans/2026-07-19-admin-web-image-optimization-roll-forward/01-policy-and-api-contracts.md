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
- Modify: `apps/backend/package.json`
- Modify: `apps/frontend/package.json`
- Modify: `packages/types/package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Write the failing package-resolution test**

Create subprocess cases equivalent to:

```ts
const cases = [
    ['import', `import('@ndt/image-upload-policy')`],
    ['require', `require('@ndt/image-upload-policy')`],
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
    "name": "@ndt/image-upload-policy",
    "version": "0.1.0",
    "private": true,
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
        }
    }
}
```

`write-cjs-package.mjs` writes exactly `{ "type": "commonjs" }` to `dist/cjs/package.json`.

Declare the workspace edges explicitly so npm links matching local versions and Turbo can order `^build`:

In `apps/backend/package.json`, merge:

```json
{
    "dependencies": {
        "@ndt/image-upload-policy": "^0.1.0"
    },
    "devDependencies": {
        "@ndt/types": "^0.1.0"
    }
}
```

In `apps/frontend/package.json`, merge the same direct edges:

```json
{
    "dependencies": {
        "@ndt/image-upload-policy": "^0.1.0"
    },
    "devDependencies": {
        "@ndt/types": "^0.1.0"
    }
}
```

In `packages/types/package.json`, declare the type source it imports:

```json
{
    "dependencies": {
        "@ndt/image-upload-policy": "^0.1.0"
    }
}
```

Use standard matching semver rather than `workspace:*`: npm 11 links matching workspace versions and records ordinary ranges. Run `npm install` once after all three manifests exist and commit the resulting lockfile edges. The package-resolution test reads all three consumer manifests, asserts every direct edge, then creates `createRequire()` instances rooted at `apps/backend/package.json` and `apps/frontend/package.json`; each must resolve the public roots `@ndt/image-upload-policy` and `@ndt/types` under the repository `packages/` directory. Add `npx turbo run build --dry=json` and assert the policy build is a dependency of both application builds.

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

Expected: all commands exit 0. Do not require `dist/index.js`; no build emits it. Do not declare or test the `./fixtures` export yet: Stage 02 adds it atomically with the real fixture module so Stage 01 never advertises missing files.

### Task 2: Define the deterministic current policy

**Files:**

- Create: `packages/image-upload-policy/src/policy.ts`
- Create: `packages/image-upload-policy/src/policy-hash.ts`
- Create: `packages/image-upload-policy/src/error-codes.ts`
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
    maxSourceDimension: 16_384,
    maxSourcePixels: 80_000_000,
    preflightWorkingBytes: 8_388_608,
    maxDecodedPixels: 7_000_000,
    maxConcurrentDecodedSurfaces: 2,
    maxWidth: 2560,
    maxHeight: 2560,
    webpQuality: 0.84,
    normalizedColorSpace: 'srgb',
    allowedStoredMimes: ['image/jpeg', 'image/png', 'image/webp'],
    maxPagesOrFrames: 1,
    metadataRulesetVersion: 'web-metadata-v1',
    maxDecompressedIccBytes: 1_048_576,
    allowedIccSha256: [],
} as const satisfies ImageUploadPolicy;
```

Use the exact UTF-8 prefix `NDT_IMAGE_UPLOAD_POLICY\0web-v1\0`, where each `\0` is one NUL byte, followed immediately by the RFC 8785 canonical JSON. The initial canonical JSON is:

```json
{"allowedIccSha256":[],"allowedStoredMimes":["image/jpeg","image/png","image/webp"],"maxConcurrentDecodedSurfaces":2,"maxDecodedPixels":7000000,"maxDecompressedIccBytes":1048576,"maxHeight":2560,"maxPagesOrFrames":1,"maxSourceBytes":104857600,"maxSourceDimension":16384,"maxSourcePixels":80000000,"maxStoredBytes":5242880,"maxWidth":2560,"metadataRulesetVersion":"web-metadata-v1","minimumChromiumMajor":136,"normalizedColorSpace":"srgb","preflightWorkingBytes":8388608,"softTargetBytes":3145728,"webpQuality":0.84}
```

Require SHA-256 `18da64f64a7d4a645b549c56ebc5dce84ed830f69defdf8b6d7f2b8d9659baef` and policy version `web-v1-18da64f64a7d4a645b549c56ebc5dce84ed830f69defdf8b6d7f2b8d9659baef`. Also test sorted/deduplicated digest lists, rejected non-finite numbers, rejected missing/unknown fields, and stable object-key ordering. Mutating each of the 18 properties above must change the hash. Presigned PUT lifetime, finalization lease, process roles/counts, decode permits, R2 timeouts, Queue settings, presign enablement, and browser benchmark thresholds must not be properties of `ImageUploadPolicy` and must not change the wire hash.

The failing test requires this exact closed grammar failure contract so `@ndt/types` can compile before Stage 02:

```ts
export type StoredImageErrorCode =
    | 'image_truncated'
    | 'image_bad_length'
    | 'image_bad_crc'
    | 'image_bad_padding'
    | 'image_illegal_order'
    | 'image_duplicate_record'
    | 'image_animation_not_allowed'
    | 'image_multiple_pages_not_allowed'
    | 'image_unknown_record'
    | 'image_metadata_budget_exceeded'
    | 'image_trailing_bytes'
    | 'image_unsupported_format'
    | 'image_invalid_dimensions'
    | 'image_source_dimension_exceeded'
    | 'image_source_pixels_exceeded'
    | 'image_invalid_icc'
    | 'image_metadata_not_allowed';
```

The test imports the not-yet-created export, exhaustively checks this literal set, and rejects arbitrary strings. Stage 02 grammar results must later import this type and cannot add ad hoc codes.

- [ ] **Step 2: Verify the vectors fail**

```powershell
npm test --workspace=@ndt/image-upload-policy -- policy-hash.test.ts
```

Expected: FAIL because policy normalization and hashing are absent.

- [ ] **Step 3: Implement normalization and hashing**

Create `error-codes.ts` with the exact `StoredImageErrorCode` union from Step 1 and export it from the public root. Define the exact 18-field `ImageUploadPolicy`. Hash the UTF-8 bytes `NDT_IMAGE_UPLOAD_POLICY`, one NUL byte, `web-v1`, one NUL byte, then the RFC 8785 canonical UTF-8 JSON without a delimiter or trailing newline. Reject unknown/missing fields before hashing. Include only the content/browser compatibility fields shown above. Exclude presigned PUT lifetime, finalization lease, process role/count, decode permits, R2 timeouts, presign enablement, Queue settings, and browser benchmark thresholds.

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

Define closed unions for `PublicImageResponse`, `PolicyResponse`, `PresignResponse`, `ConfirmResponse`, `UploadSessionStatusResponse`, `AbandonResponse`, and `UploadErrorResponse`. Include exact outcomes `pending`, `finalizing`, `consumed`, `failed`, `gone`, `deleted`, and `unavailable` where relevant. The corresponding stable error codes remain `upload_result_deleted` and `upload_result_unavailable`. A ready presign response includes `expiresAt`, which is exactly the persisted `presignExpiresAt` and the signed PUT expiry; a pending status response returns the same session expiry. A consumed response includes the persisted absolute `retentionExpiresAt` for the exact 30-day result window.

Export `StoredImageErrorCode` from `@ndt/image-upload-policy` and define:

```ts
export type UploadFailureCode =
    | StoredImageErrorCode
    | 'upload_abandoned'
    | 'upload_expired'
    | 'upload_digest_mismatch'
    | 'upload_source_changed'
    | 'upload_decode_failed'
    | 'upload_dispatch_rejected'
    | 'upload_cutover_aborted';

export type UploadErrorResponse =
    | { statusCode: 400; code: 'upload_invalid_request'; message: string }
    | { statusCode: 401; code: 'upload_authentication_required'; message: string }
    | { statusCode: 403; code: 'upload_admin_required'; message: string }
    | { statusCode: 404; code: 'upload_not_found'; message: string }
    | {
          statusCode: 409;
          code: 'upload_request_conflict';
          message: string;
      }
    | {
          statusCode: 409;
          code: 'policy_refresh_required' | 'upload_capacity_exceeded';
          message: string;
      }
    | {
          statusCode: 429;
          code: 'upload_rate_limited';
          message: string;
          retryAfter: string;
      }
    | {
          statusCode: 503;
          code: 'upload_presign_disabled' | 'upload_rate_limit_unavailable';
          message: string;
          retryAfter?: string;
      };
```

The type test exhaustively switches on every `code`, including `upload_request_conflict`, proves an arbitrary string is rejected, proves `retryAfter` is required for rate limiting, and proves `failureCode` is `UploadFailureCode` rather than `string`.

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
