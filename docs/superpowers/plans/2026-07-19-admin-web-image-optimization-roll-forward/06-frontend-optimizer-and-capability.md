# Frontend Optimizer and Capability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build a browser optimizer that fails closed, stays within surface limits, and encodes one policy-compliant WebP.

**Architecture:** Capability probing binds real decoder orientation behavior before file selection. The optimizer preflights and classifies every source before decode, uses target-size ImageDecoder for large sources, and tracks every owned surface/resource explicitly.

**Tech Stack:** Next.js 16, React 19, TypeScript, WebCodecs ImageDecoder, OffscreenCanvas, Web Worker, Node tests.

---

## Normative exported interfaces

Use these names and discriminants across Stages 06-08; tests import the real exports and use `satisfies`/exhaustive switches so drift fails compilation:

```ts
export type UploadCapability =
    | {
          outcome: 'supported';
          chromiumMajor: number;
          orientationMode: 'raw' | 'display';
          targetSizeDecode: true;
          webpEncode: true;
          srgbOutput: true;
      }
    | {
          outcome: 'unsupported';
          code:
              | 'browser_version_unsupported'
              | 'image_decoder_unavailable'
              | 'orientation_probe_failed'
              | 'target_size_decode_unavailable'
              | 'webp_encode_unavailable'
              | 'srgb_output_unproven';
      };

export type OptimizedImage = {
    blob: Blob;
    filename: string;
    contentType: 'image/jpeg' | 'image/png' | 'image/webp';
    fileSize: number;
    processedSha256: string;
    width: number;
    height: number;
    policyVersion: string;
    disposition: 'passed-through' | 'normalized';
};

export interface ImageResourceRegistry {
    reserve(itemId: string, kind: ImageResourceKind): ResourceLease;
    transfer(lease: ResourceLease, nextOwner: string): ResourceLease;
    release(lease: ResourceLease): void;
    snapshot(): Readonly<ResourceSnapshot>;
}

export function probeUploadCapability(
    policy: ImageUploadPolicy,
    signal?: AbortSignal,
): Promise<UploadCapability>;

export function optimizeImage(
    file: File,
    policy: ImageUploadPolicy,
    capability: Extract<UploadCapability, { outcome: 'supported' }>,
    registry: ImageResourceRegistry,
    signal?: AbortSignal,
): Promise<OptimizedImage>;
```

`ImageResourceKind`, `ResourceLease`, and `ResourceSnapshot` are closed types defined in `resource-registry.ts`. A lease has exactly one current owner; transfer invalidates the old lease token; release is idempotent for the current token and rejects cross-item tokens. `optimizeImage` validates pass-through and normalized bytes with the Stage 02 `validateStored` export before hashing or returning.

### Task 1: Define optimizer and resource contracts

**Files:**

- Create: apps/frontend/src/lib/image-upload/types.ts
- Create: apps/frontend/src/lib/image-upload/resource-registry.ts
- Create: apps/frontend/test/image-upload-resource-registry.test.ts
- Modify: apps/frontend/package.json

- [x] **Step 1: Add failing resource ownership tests**

Assert a maximum of two decoded/visible surfaces and two resident output Blobs. Count ImageBitmap, canvas, worker surface, thumbnail, preview img, Blob, and object URL owners.

- [x] **Step 2: Implement explicit registry ownership and exact-file test entrypoint**

Add `"test:focused": "node --import tsx --test"` to `apps/frontend/package.json`; it preserves the repository's TypeScript loader and has no glob, so each focused command below runs only the explicit path passed after `--`. Keep the existing `test` script as the full-suite command. Add a regression assertion that runs one existing extensionless TypeScript import through `test:focused`; bare `node --test` is invalid for this workspace because it does not resolve the existing TypeScript module graph. Provide reserve, transfer, and release operations keyed by queue item and resource type. Do not depend on garbage collection or object-URL revocation as proof of bitmap release.

- [x] **Step 3: Verify registry tests**

    npm run test:focused --workspace=frontend -- test/image-upload-resource-registry.test.ts

Expected: all ownership, transfer, pause, and release tests PASS.

### Task 2: Implement browser capability probing

**Files:**

- Create: apps/frontend/src/lib/image-upload/capability-probe.ts
- Create: apps/frontend/test/image-upload-capability.test.ts

- [x] **Step 1: Add failing probe tests**

Use orientation 2-8 corner-signature fixtures. Assert Chromium major below 136, missing ImageDecoder, ambiguous orientation, wrong pixels, failed target resize, wrong WebP MIME, or failed sRGB output disables uploads.

- [x] **Step 2: Implement probe**

Detect Chromium major, run each production decode path, inspect corner pixels and dimensions, bind raw/display orientation mode, verify target-size decode plus WebP encode, and return a closed capability result.

- [x] **Step 3: Verify unit probe tests**

    npm run test:focused --workspace=frontend -- test/image-upload-capability.test.ts

Expected: supported/unsupported/ambiguous cases PASS.

### Task 3: Implement the worker encoder

**Files:**

- Create: apps/frontend/src/lib/image-upload/optimizer.worker.ts
- Create: apps/frontend/test/image-upload-encoder.test.ts

- [x] **Step 1: Add failing encoder tests**

Assert one convertToBlob call with image/webp and snapshot webpQuality=0.84, no iterative encode, non-empty correct MIME, AbortSignal termination, and rejected output above 5242880 bytes.

- [x] **Step 2: Implement worker protocol**

Accept a display-oriented bounded surface plus immutable policy. Create an sRGB destination, call convertToBlob exactly once, validate output through validate-stored, and transfer only the valid Blob/result metadata.

- [x] **Step 3: Implement main-thread compatibility adapter**

Call HTMLCanvasElement.toBlob exactly once. Check abort before and after the callback and discard late results.

- [x] **Step 4: Verify encoder tests**

    npm run test:focused --workspace=frontend -- test/image-upload-encoder.test.ts

Expected: call-count, quality, MIME, cancellation, and hard-cap tests PASS.

### Task 4: Implement source preflight/classification/optimization

**Files:**

- Create: apps/frontend/src/lib/image-upload/optimizer.ts
- Create: apps/frontend/test/image-upload-policy.test.ts

- [x] **Step 1: Add failing optimizer tests**

Cover source size 100 MiB, edge 16384, 80 million pixels, 8 MiB parser memory, pass-through <=3 MiB, orientation/metadata normalization, large target-size decode, no original preview, exact digest, and fail-closed output.

- [x] **Step 2: Implement ordered pipeline**

Run header preflight, complete classify-source stream, pass-through decision, target dimension calculation, bounded decode, orientation once, sRGB draw, one WebP encode, validate-stored, and SHA-256 over exact final bytes.

- [x] **Step 3: Remove unsafe compression fallback**

Do not call imageCompression(file, options) with maxSizeMB. Remove browser-image-compression if no focused helper remains.

- [x] **Step 4: Verify optimizer tests and static search**

    npm run test:focused --workspace=frontend -- test/image-upload-policy.test.ts
    $matches = rg -n "maxSizeMB|imageCompression\(" apps/frontend/src/lib/image-upload apps/frontend/src/app/admin
    $rgExit = $LASTEXITCODE
    if ($rgExit -eq 0) { $matches; throw "iterative production encode call found" }
    if ($rgExit -ne 1) { throw "rg tooling failure: exit $rgExit" }

Expected: tests PASS; `rg` exit 1 means no iterative production encode call exists, a match fails explicitly, and every other exit is a tooling failure.

### Task 5: Stage gate and commit

- [x] **Step 1: Run frontend checks**

    npm test --workspace=frontend
    npm run build --workspace=frontend
    git diff --check

Expected: commands exit 0.

- [ ] **Step 2: Commit**

    git add apps/frontend package-lock.json
    git commit -m "feat(images): add bounded browser image optimizer"
