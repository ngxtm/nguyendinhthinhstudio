# Image Grammar and Fixtures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Implement one bounded JPEG/PNG/WebP grammar and deterministic fixture corpus shared by browser and backend validation.

**Architecture:** The parser exposes header preflight, classify-source, and validate-stored modes. Parsing is streaming and bounded to preflightWorkingBytes; fixtures and stable error codes are compiled through the dedicated fixtures export.

**Tech Stack:** TypeScript, Web Streams-compatible adapters, Node streams, CRC32, SHA-256, Node test runner.

---

## Normative exported interface

Stage 02 must export this closed surface from `@ndt/image-upload-policy`; later stages import it rather than defining adapters with different names or result shapes:

```ts
export type ImageInput = AsyncIterable<Uint8Array>;

export type ImageFacts = {
    mime: 'image/jpeg' | 'image/png' | 'image/webp';
    width: number;
    height: number;
    pagesOrFrames: 1;
    orientation: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | null;
    metadataBytes: number;
    iccSha256: string | null;
};

export type ImagePreflightResult =
    | {
          outcome: 'accepted';
          facts: {
              mime: ImageFacts['mime'];
              width: number;
              height: number;
              declaredAnimation: boolean;
              declaredPagesOrFrames: number | null;
          };
      }
    | { outcome: 'rejected'; code: StoredImageErrorCode };

export type ImageGrammarResult =
    | { outcome: 'allowed'; facts: ImageFacts }
    | { outcome: 'requiresNormalization'; facts: ImageFacts }
    | { outcome: 'rejected'; code: StoredImageErrorCode };

export function preflightImage(
    input: ImageInput,
    policy: ImageUploadPolicy,
    signal?: AbortSignal,
): Promise<ImagePreflightResult>;

export function classifySource(
    input: ImageInput,
    policy: ImageUploadPolicy,
    signal?: AbortSignal,
): Promise<ImageGrammarResult>;

export function validateStored(
    input: ImageInput,
    policy: ImageUploadPolicy,
    signal?: AbortSignal,
): Promise<ImageGrammarResult>;
```

Each call owns only its reader/parser state, releases/cancels the reader in `finally`, starts at byte zero, and does not reuse a partially consumed input. Browser and backend adapters may wrap Blob/Node streams but may not weaken the input, result, memory, EOF, or abort contract.

### Task 1: Define grammar constants and stable results

**Files:**

- Create: packages/image-upload-policy/src/grammar.ts
- Create: packages/image-upload-policy/src/grammar-types.ts
- Create: packages/image-upload-policy/test/grammar.test.ts
- Modify: packages/image-upload-policy/src/index.ts

- [ ] **Step 1: Add failing result-contract tests**

Assert explicit result unions for allowed, requiresNormalization, and rejected. Import the closed `StoredImageErrorCode` created in Stage 01; map truncated, bad-length, bad-CRC, bad-padding, illegal-order, duplicate, animation, multi-page, unknown-record, metadata-budget, trailing-bytes, unsupported format, invalid dimensions, source dimension/pixel overflow, invalid ICC, and disallowed metadata to their exact literals. Compile-time exhaustiveness must fail for a missing member, and grammar modules may not return `string` or define an extra code.

- [ ] **Step 2: Verify failure**

    npm test --workspace=@ndt/image-upload-policy -- grammar.test.ts

Expected: FAIL because grammar APIs do not exist.

- [ ] **Step 3: Implement bounded reader primitives**

Implement checked unsigned arithmetic, exact-length reads, bounded metadata accumulation, incremental digest/CRC handling, and AbortSignal checks. Never retain more than policy.preflightWorkingBytes.

- [ ] **Step 4: Verify primitive tests**

    npm test --workspace=@ndt/image-upload-policy -- grammar.test.ts

Expected: primitive boundary and abort tests PASS.

### Task 2: Implement JPEG, PNG, and WebP modes

**Files:**

- Create: packages/image-upload-policy/src/jpeg-grammar.ts
- Create: packages/image-upload-policy/src/png-grammar.ts
- Create: packages/image-upload-policy/src/webp-grammar.ts
- Modify: packages/image-upload-policy/src/grammar.ts
- Modify: packages/image-upload-policy/test/grammar.test.ts

- [ ] **Step 1: Add failing format vectors**

Cover legal baseline/progressive JPEG scans; PNG signature/IHDR/IDAT/IEND order and CRC; WebP RIFF sizes, padding, VP8X flags, VP8/VP8L/ALPH combinations; EXIF/XMP/ICC/text metadata; animation; duplicates; unknown records; and bytes after terminators.

- [ ] **Step 2: Verify vectors fail**

    npm test --workspace=@ndt/image-upload-policy -- grammar.test.ts

Expected: format vectors FAIL before implementations exist.

- [ ] **Step 3: Implement classify-source**

Recognized source-only metadata returns requiresNormalization. Unsafe unknown, malformed, animated, multi-page, over-budget, and unsupported structures reject.

- [ ] **Step 4: Implement validate-stored**

Accept only the strict web-metadata-v1 allowlist, canonical orientation absence, bounded ICC digests, one page/frame, and exact terminal grammar.

- [ ] **Step 5: Verify all format vectors**

    npm test --workspace=@ndt/image-upload-policy -- grammar.test.ts

Expected: all JPEG/PNG/WebP mode-specific vectors PASS.

### Task 3: Add header preflight and fixture corpus

**Files:**

- Create: packages/image-upload-policy/src/preflight.ts
- Create: packages/image-upload-policy/src/fixtures.ts
- Create: packages/image-upload-policy/test/preflight.test.ts
- Create: packages/image-upload-policy/test/fixture-corpus.test.ts
- Modify: packages/image-upload-policy/package.json
- Modify: packages/image-upload-policy/test/package-exports.test.ts

- [ ] **Step 1: Add failing preflight tests**

Assert rejection before decode for source edge above 16384, pixels above 80000000, invalid zero dimensions, declared multi-page/animation, and metadata state above 8388608 bytes.

- [ ] **Step 2: Add deterministic non-sensitive fixtures and the real export**

Include orientation 1-8 corner-signature images, sRGB/wide-gamut examples, allowed/recognized-disallowed/unknown metadata, intrinsic-alpha VP8L, malformed lengths, CRC/padding failures, and terminal-byte failures.

Only after `src/fixtures.ts` exists, add:

```json
{
    "exports": {
        "./fixtures": {
            "types": "./dist/fixtures.d.ts",
            "import": "./dist/esm/fixtures.js",
            "require": "./dist/cjs/fixtures.js"
        }
    }
}
```

Merge this subpath with the existing root export; do not replace `exports["."]`. Extend `package-exports.test.ts` with fixture import/require subprocesses and assert no resolved filename contains `/src/` or `\\src\\`.

- [ ] **Step 3: Implement bounded preflight**

Preflight reads only required headers and returns raw/display facts. It must not allocate a decoder surface or buffer the whole source.

- [ ] **Step 4: Run corpus, preflight, and export tests**

    npm run build --workspace=@ndt/image-upload-policy
    npm test --workspace=@ndt/image-upload-policy -- preflight.test.ts fixture-corpus.test.ts package-exports.test.ts

Expected: every fixture has a stable expected decision/code in both modes and both fixture export modes resolve compiled artifacts.

### Task 4: Add deterministic fuzz/property coverage

**Files:**

- Create: packages/image-upload-policy/test/grammar-fuzz.test.ts

- [ ] **Step 1: Implement seeded mutation tests**

Use a fixed seed and mutate lengths, order, CRC, padding, flags, terminators, and truncation points. Assert bounded memory, termination, no uncaught RangeError, and stable rejection categories.

- [ ] **Step 2: Run twice and compare results**

    npm test --workspace=@ndt/image-upload-policy -- grammar-fuzz.test.ts
    npm test --workspace=@ndt/image-upload-policy -- grammar-fuzz.test.ts

Expected: both runs PASS with identical seed/vector counts.

### Task 5: Stage gate and commit

- [ ] **Step 1: Run all shared-package checks**

    npm test --workspace=@ndt/image-upload-policy
    npm run build --workspace=@ndt/image-upload-policy
    git diff --check

Expected: commands exit 0.

- [ ] **Step 2: Commit**

    git add packages/image-upload-policy
    git commit -m "feat(images): add bounded image grammar and fixtures"
