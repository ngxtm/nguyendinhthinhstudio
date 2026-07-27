# Simplified Admin Image Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace the policy, ICC, and custom-parser image-upload contract with browser-only one-pass WebP compression and minimal Sharp verification, while keeping authenticated presign, digest, promotion, settlement, cleanup, idempotency, and rate limiting.

**Architecture:** The browser owns fixed upload constants and converts every accepted JPEG, PNG, or WebP input into one static WebP. The backend accepts only that WebP and verifies byte size, actual format, full decode, dimensions, and SHA-256 before the current R2 promotion path continues. No policy endpoint/version/hash/snapshot, custom grammar, ICC inspection, or manual cutover program remains.

**Tech Stack:** Next.js 16, React 19, createImageBitmap, Canvas, NestJS 11, Sharp, Prisma/PostgreSQL, Cloudflare R2, Node test runner, Jest, Playwright, Docker Compose, GitHub Actions.

---

## Confirmed decisions and guardrails

- Source types are JPEG, PNG, and WebP; source cap is 100 MiB.
- Browser output is always static image/webp at quality 0.84, longest edge 2560 px, and maximum size 5 MiB.
- There is no pass-through, iterative quality loop, original fallback, ICC/EXIF parser, MIME grammar, source dimension rule, or browser-version gate.
- Native browser decoding owns color and orientation. Canvas preserves alpha.
- Backend checks only output bytes, actual WebP, Sharp full decode, dimensions, and output SHA-256.
- Authentication, admin authorization, idempotency, R2 ETag checks, promotion recovery, cleanup, capacity, and non-presign route limits remain.
- upload_url is 60 requests per rolling 10 minutes per admin. A 429 retains retryAfter and is never auto-retried.
- Operator smoke may remain an optional diagnostic tool, but it is not a release gate.
- The manual cutover CLI is removed. Deployment means migration plus matching frontend/backend/reconciler containers; brief upload errors while containers are replaced are accepted.
- The user file Chụp Mẫu4328.JPG remains an untracked local acceptance fixture. Do not add it to Git.

## File map

### Create

- apps/frontend/src/lib/image-upload/upload-constants.ts
- apps/backend/prisma/migrations/20260727000100_simplify_admin_image_upload/migration.sql
- docs/superpowers/plans/2026-07-27-simplified-admin-image-upload.md

### Delete

- packages/image-upload-policy/
- apps/backend/src/images/image-upload-policy.service.ts
- apps/backend/src/images/image-upload-policy.service.spec.ts
- apps/frontend/src/lib/image-upload/upload-scheduler.ts
- apps/frontend/src/lib/image-upload/resource-registry.ts
- apps/frontend/test/image-upload-policy-test-bootstrap.contract.test.ts
- apps/frontend/test/image-upload-state-machine.test.ts
- apps/frontend/test/image-upload-resource-registry.test.ts
- apps/frontend/test/benchmark/image-upload-memory.benchmark.ts
- scripts/turbo-build-path-budget.test.mjs
- apps/backend/src/images/image-upload-cutover.service.ts
- apps/backend/src/images/image-upload-cutover.service.spec.ts
- apps/backend/src/images/image-upload-cutover.pg.ts
- apps/backend/src/scripts/image-upload-cutover.ts
- apps/backend/src/scripts/image-upload-cutover.spec.ts
- apps/backend/test/image-upload-cutover.integration-spec.ts
- scripts/fixtures/image-upload-production-gates/fail/policy-binding.json

### Main modified files

- packages/types/package.json
- packages/types/src/image-upload.ts
- packages/types/src/image-upload.type-test.ts
- apps/frontend/package.json
- apps/frontend/Dockerfile
- apps/frontend/src/lib/image-upload/types.ts
- apps/frontend/src/lib/image-upload/capability-probe.ts
- apps/frontend/src/lib/image-upload/optimizer.ts
- apps/frontend/src/lib/image-upload/optimizer.worker.ts
- apps/frontend/src/lib/api/images.ts
- apps/frontend/src/app/admin/components/ImageUploadZone.tsx
- apps/frontend/src/app/admin/components/ImageUploadErrors.tsx
- apps/frontend/test/image-upload-api.test.ts
- apps/frontend/test/image-upload-capability.test.ts
- apps/frontend/test/image-upload-encoder.test.ts
- apps/frontend/test/image-upload-policy.test.ts
- apps/frontend/test/image-upload.browser.spec.ts
- apps/frontend/test/admin-album-workflows.contract.test.ts
- apps/backend/package.json
- apps/backend/Dockerfile
- apps/backend/Dockerfile.operator-smoke
- apps/backend/prisma/schema.prisma
- apps/backend/src/images/dto/upload-request.dto.ts
- apps/backend/src/images/image-upload-fingerprint.ts
- apps/backend/src/images/image-upload-rate-limit.service.ts
- apps/backend/src/images/stored-image-inspector.service.ts
- apps/backend/src/images/images.module.ts
- apps/backend/src/images/images.controller.ts
- apps/backend/src/images/images.service.ts
- apps/backend/src/images/image-upload-promotion.repository.ts
- apps/backend/src/images/storage.service.ts
- apps/backend/src/images/image-upload-promotion-recovery.service.ts
- apps/backend/src/images/image-upload-runtime-config.ts
- docker-compose.yml
- .github/workflows/image-upload.yml
- scripts/verify-image-upload-workflow.mjs
- scripts/verify-image-upload-production-gates.mjs
- scripts/verify-image-upload-final-ingress-gates.mjs
- scripts/schemas/image-upload-production-evidence.schema.json
- scripts/fixtures/image-upload-production-gates/pass.json
- docs/runbooks/image-upload-roll-forward.md
- package-lock.json

Historical 2026-07-19 documents remain as historical material because ADR 0002 and the approved simplified spec explicitly supersede them.

## Task 1: Replace the shared upload type contract

**Files:**

- Modify: packages/types/package.json
- Modify: packages/types/src/image-upload.ts
- Modify: packages/types/src/image-upload.type-test.ts
- Modify: apps/backend/src/images/dto/upload-request.dto.ts
- Modify: apps/backend/src/images/image-upload-fingerprint.ts
- Modify: apps/backend/src/images/image-upload-fingerprint.spec.ts

- [ ] **Step 1: Write the failing type assertions**

Replace policy-based examples in image-upload.type-test.ts with a WebP-only request and stale-policy rejection:

```ts
const validRequest: UploadPresignRequest = {
    clientRequestId: '00000000-0000-4000-8000-000000000001',
    albumId: '00000000-0000-4000-8000-000000000002',
    filename: 'photo.webp',
    contentType: 'image/webp',
    fileSize: 1024,
    processedSha256: 'a'.repeat(64),
};

const staleRequest = {
    ...validRequest,
    // @ts-expect-error policyVersion is no longer accepted
    policyVersion: 'web-v1-legacy',
} satisfies UploadPresignRequest;

const nonWebpRequest = {
    ...validRequest,
    // @ts-expect-error only browser-produced WebP may be presigned
    contentType: 'image/jpeg',
} satisfies UploadPresignRequest;
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
& .\node_modules\.bin\tsc.cmd --noEmit --project packages/types/tsconfig.json
```

Expected: non-zero exit because the old contract still requires policyVersion and accepts non-WebP stored MIME.

- [ ] **Step 3: Implement the policy-free contract**

Replace imports from the policy package with local literals:

```ts
export type StoredUploadMime = 'image/webp';

export type UploadPresignRequest = {
    clientRequestId: string;
    albumId: string;
    filename: string;
    contentType: StoredUploadMime;
    fileSize: number;
    processedSha256: string;
};

export type UploadFailureCode =
    | 'upload_abandoned'
    | 'upload_expired'
    | 'upload_presign_failed'
    | 'upload_digest_mismatch'
    | 'upload_source_changed'
    | 'upload_decode_failed'
    | 'upload_dispatch_rejected';
```

Remove PolicyResponse, policy_refresh_required, parser-specific failures, and policyVersion from UploadErrorResponse and UploadFailureCode. Keep upload_rate_limited with required retryAfter.

In UploadRequestDto, delete policyVersion and require exactly image/webp:

```ts
@ApiProperty({ enum: ['image/webp'] })
@IsIn(['image/webp'])
contentType!: 'image/webp'
```

Remove policyVersion from ImageUploadFingerprintInput and its canonical key list. Remove the policy-package dependency from packages/types/package.json.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
& .\node_modules\.bin\tsc.cmd --noEmit --project packages/types/tsconfig.json
& .\node_modules\.bin\jest.cmd --config apps/backend/package.json --runInBand --runTestsByPath apps/backend/src/images/image-upload-fingerprint.spec.ts
```

Expected: both commands exit 0, and idempotency still changes for admin, album, filename, MIME, bytes, or digest.

- [ ] **Step 5: Commit**

```powershell
git add -- packages/types apps/backend/src/images/dto/upload-request.dto.ts apps/backend/src/images/image-upload-fingerprint.ts apps/backend/src/images/image-upload-fingerprint.spec.ts
git commit -m "refactor(upload): remove policy from request contract"
```

## Task 2: Implement browser-owned one-pass WebP compression

**Files:**

- Create: apps/frontend/src/lib/image-upload/upload-constants.ts
- Modify: apps/frontend/src/lib/image-upload/types.ts
- Modify: apps/frontend/src/lib/image-upload/capability-probe.ts
- Modify: apps/frontend/src/lib/image-upload/optimizer.ts
- Modify: apps/frontend/src/lib/image-upload/optimizer.worker.ts
- Delete: apps/frontend/src/lib/image-upload/upload-scheduler.ts
- Delete: apps/frontend/src/lib/image-upload/resource-registry.ts
- Modify: apps/frontend/test/image-upload-policy.test.ts
- Modify: apps/frontend/test/image-upload-encoder.test.ts
- Modify: apps/frontend/test/image-upload-capability.test.ts
- Delete: the four frontend policy/scheduler/resource/benchmark tests listed in File map

- [ ] **Step 1: Write failing optimizer tests**

Rewrite current optimizer tests so they require:

1. JPEG, PNG, and WebP source MIME values are accepted; GIF and empty MIME are rejected.
2. Source bytes above 104857600 are rejected.
3. Every source, including a small WebP, invokes the encoder exactly once and returns image/webp with a .webp filename.
4. Target dimensions preserve aspect ratio and constrain only the longer edge to 2560.
5. Output above 5242880 bytes throws image_output_bytes_exceeded before presign.
6. Native decode failure throws image_decode_failed and never returns the original.
7. Offscreen canvas uses convertToBlob; DOM canvas fallback uses toBlob; both use quality 0.84.

Use an injected browser-environment seam rather than a binary parser:

```ts
const result = await optimizeImage(new File(['source'], 'portrait.webp', { type: 'image/webp' }), {
    decode: async () => ({
        image: fakeBitmap,
        width: 4000,
        height: 2000,
        close() {},
    }),
    createSurface: () => fakeOffscreenSurface,
    encode: async () => new Blob(['webp'], { type: 'image/webp' }),
});

assert.equal(result.filename, 'portrait.webp');
assert.equal(encodeCalls, 1);
assert.equal(result.contentType, 'image/webp');
assert.deepEqual([result.width, result.height], [2560, 1280]);
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm run test:focused --workspace=frontend -- test/image-upload-policy.test.ts test/image-upload-encoder.test.ts test/image-upload-capability.test.ts
```

Expected: failure from the current policy-shaped API, pass-through behavior, and Chromium gate.

- [ ] **Step 3: Add local frontend constants**

Create upload-constants.ts:

```ts
export const ACCEPTED_SOURCE_MIME_TYPES = Object.freeze([
    'image/jpeg',
    'image/png',
    'image/webp',
] as const);

export type AcceptedSourceMime = (typeof ACCEPTED_SOURCE_MIME_TYPES)[number];

export const MAX_SOURCE_BYTES = 100 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
export const MAX_OUTPUT_EDGE = 2560;
export const WEBP_QUALITY = 0.84;
export const MAX_BATCH_FILES = 50;
export const UPLOAD_CONCURRENCY = 2;
```

Do not export these values to the backend and do not reintroduce remote policy negotiation.

- [ ] **Step 4: Replace browser/version policy checks with feature detection**

Change UploadCapability to:

```ts
export type UploadCapability =
    | { outcome: 'supported' }
    | {
          outcome: 'unsupported';
          code: 'image_decoder_unavailable' | 'canvas_unavailable' | 'webp_encode_unavailable';
      };
```

Probe only:

- createImageBitmap availability;
- an OffscreenCanvas or document canvas with a 2D context;
- a real non-empty 1x1 WebP Blob.

Delete navigator.userAgent parsing, Chromium major checks, ImageDecoder requirements, EXIF orientation checks, target-size decoder checks, and sRGB proof checks.

- [ ] **Step 5: Implement native decode, draw, and one encode**

Use this target calculation:

```ts
export function computeTargetDimensions(
    width: number,
    height: number,
): { width: number; height: number } {
    const scale = Math.min(1, MAX_OUTPUT_EDGE / Math.max(width, height));
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
}
```

The production optimizer must:

1. reject unknown source MIME and source bytes over MAX_SOURCE_BYTES;
2. call createImageBitmap with imageOrientation: from-image and default color conversion;
3. draw the decoded first frame into OffscreenCanvas when available or a regular DOM canvas otherwise;
4. encode exactly once as image/webp at WEBP_QUALITY;
5. require non-empty image/webp output at or below MAX_OUTPUT_BYTES;
6. SHA-256 the output Blob and replace only the source extension with .webp;
7. close the decoded bitmap in finally.

Delete classifySource, preflightImage, validateStored, metadata stripping, RIFF parsing, ICC logic, policyVersion, disposition, source dimension/pixel limits, ImageResourceRegistry, and unused UploadScheduler. Keep the existing two-worker UI queue.

- [ ] **Step 6: Verify GREEN and commit**

Run:

```powershell
npm run test:focused --workspace=frontend -- test/image-upload-policy.test.ts test/image-upload-encoder.test.ts test/image-upload-capability.test.ts
git add -- apps/frontend/src/lib/image-upload apps/frontend/test/image-upload-policy.test.ts apps/frontend/test/image-upload-encoder.test.ts apps/frontend/test/image-upload-capability.test.ts
git rm -- apps/frontend/test/image-upload-policy-test-bootstrap.contract.test.ts apps/frontend/test/image-upload-state-machine.test.ts apps/frontend/test/image-upload-resource-registry.test.ts apps/frontend/test/benchmark/image-upload-memory.benchmark.ts
git commit -m "refactor(upload): always encode browser images to webp"
```

Expected: tests exit 0; every accepted input follows one encode path.

## Task 3: Keep structured 429 data through the frontend and show it in admin UI

**Files:**

- Modify: apps/frontend/src/lib/api/images.ts
- Modify: apps/frontend/src/app/admin/components/ImageUploadZone.tsx
- Modify: apps/frontend/src/app/admin/components/ImageUploadErrors.tsx
- Modify: apps/frontend/test/image-upload-api.test.ts
- Modify: apps/frontend/test/admin-album-workflows.contract.test.ts

- [ ] **Step 1: Write failing API/UI tests**

Add tests that prove:

- a 429 ApiError with code upload_rate_limited and retryAfter becomes UploadApiError with the same values;
- uploadImage preserves UploadApiError instead of replacing it with plain Error;
- presign body has exactly clientRequestId, albumId, filename, contentType image/webp, fileSize, and processedSha256;
- the UI renders the supplied retry time;
- 429 creates no automatic retry.

Expected presign body:

```ts
assert.deepEqual(presignInput, {
    clientRequestId,
    albumId,
    filename: 'testing.webp',
    contentType: 'image/webp',
    fileSize: file.size,
    processedSha256,
});
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm run test:focused --workspace=frontend -- test/image-upload-api.test.ts test/admin-album-workflows.contract.test.ts
```

Expected: failure because the current client fetches upload-policy, sends policyVersion, and discards the structured 429 body.

- [ ] **Step 3: Update API and UI**

Delete loadUploadPolicy and all policy arguments. Rename runCurrentPolicyUpload to runAdminImageUpload.

Map only a structured 429 like this:

```ts
function asUploadApiError(error: unknown): never {
    if (error instanceof ApiError && error.data && typeof error.data === 'object') {
        const payload = error.data as { code?: unknown; retryAfter?: unknown };
        if (
            error.status === 429 &&
            payload.code === 'upload_rate_limited' &&
            typeof payload.retryAfter === 'string'
        ) {
            throw new UploadApiError('upload_rate_limited', payload.retryAfter);
        }
    }
    throw error;
}
```

Use that mapper around presign. Never retry in that mapper. Make uploadImage return the upload promise unchanged.

In ImageUploadZone, use MAX_BATCH_FILES, UPLOAD_CONCURRENCY, and ACCEPTED_SOURCE_MIME_TYPES. Add retryAfter to the file state and preserve it on catch:

```ts
const uploadError = error instanceof UploadApiError ? error : undefined;

next[index] = {
    ...next[index],
    status: 'error',
    error: uploadError?.code ?? 'upload_failed',
    retryAfter: uploadError?.retryAfter,
};
```

Pass retryAfter to ImageUploadErrors. For upload_rate_limited show an absolute local time; keep the Retry button manual. Remove all ICC/parser/policy error copy and update help text to browser WebP compression.

- [ ] **Step 4: Verify GREEN and commit**

Run:

```powershell
npm run test:focused --workspace=frontend -- test/image-upload-api.test.ts test/admin-album-workflows.contract.test.ts test/image-upload-policy.test.ts
git add -- apps/frontend/src/lib/api/images.ts apps/frontend/src/app/admin/components/ImageUploadZone.tsx apps/frontend/src/app/admin/components/ImageUploadErrors.tsx apps/frontend/test/image-upload-api.test.ts apps/frontend/test/admin-album-workflows.contract.test.ts
git commit -m "feat(upload): show presign rate-limit retry time"
```

Expected: exit code 0; 429 is distinct from image corruption.

## Task 4: Replace backend policy inspection with minimal Sharp verification

**Files:**

- Delete: apps/backend/src/images/image-upload-policy.service.ts
- Delete: apps/backend/src/images/image-upload-policy.service.spec.ts
- Modify: apps/backend/package.json
- Modify: apps/backend/src/images/stored-image-inspector.service.ts
- Modify: apps/backend/src/images/stored-image-inspector.service.spec.ts
- Modify: apps/backend/src/images/images.module.ts
- Modify: apps/backend/src/images/images.controller.ts
- Modify: apps/backend/src/images/images.controller.spec.ts
- Modify: apps/backend/src/images/images.service.ts
- Modify: apps/backend/src/images/images.service.spec.ts

- [ ] **Step 1: Write failing Sharp-only inspector tests**

Generate actual source buffers with Sharp. Assert a valid WebP returns digest, bytes, MIME, width, and height. Assert a PNG, truncated WebP, and over-5-MiB bytes each reject as upload_decode_failed. No test may reference ICC, EXIF, grammar, dimensions cap, pixels cap, or policy.

```ts
const webp = await sharp({
    create: {
        width: 3,
        height: 2,
        channels: 4,
        background: { r: 10, g: 20, b: 30, alpha: 0.5 },
    },
})
    .webp()
    .toBuffer();

await expect(inspector.inspect(webp)).resolves.toMatchObject({
    byteSize: webp.byteLength,
    facts: { mime: 'image/webp', width: 3, height: 2 },
    digestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
});
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
& .\node_modules\.bin\jest.cmd --config apps/backend/package.json --runInBand --runTestsByPath apps/backend/src/images/stored-image-inspector.service.spec.ts
```

Expected: failure because the inspector still takes an ImageUploadPolicy and runs validateStored.

- [ ] **Step 3: Implement the policy-free inspector**

Export backend-local values:

```ts
export const MAX_STORED_IMAGE_BYTES = 5 * 1024 * 1024;
export const STORED_IMAGE_MIME = 'image/webp' as const;
```

Make inspect accept only bytes and optional AbortSignal. It must:

1. reject bytes over MAX_STORED_IMAGE_BYTES;
2. use sharp(bytes, { failOn: 'error' }).metadata() and require format webp;
3. use a separate sharp(bytes, { failOn: 'error' }).raw().toBuffer({ resolveWithObject: true }) to force full decoding;
4. require positive decoded dimensions, hash original bytes, and return them;
5. never call rotate, parse bytes, or apply project dimension/pixel/page/ICC/EXIF rules;
6. map all inspection failures to StoredImageInspectionError('upload_decode_failed').

Move sharp from devDependencies to dependencies in apps/backend/package.json.

- [ ] **Step 4: Remove policy route and guard**

Remove ImageUploadPolicyService from ImagesModule, controller injection, GET images/upload-policy, and policy_refresh_required checking. Keep ingress, auth, rate admission, DTO validation, filename normalization, and business exception mapping.

Update controller tests to prove a body containing stale policyVersion returns 400 upload_invalid_request and a valid body is WebP-only.

- [ ] **Step 5: Simplify ImagesService without weakening promotion**

Make ImageUploadPromotionRepository, ImageInspectionSemaphoreService, and StoredImageInspectorService required dependencies. Delete the legacy non-promotion confirm branch.

In getUploadUrl, remove policyVersion from fingerprint and remove policyVersion/policySnapshot persistence.

In confirmUploadWithInspection:

```ts
const inspected = await this.storedInspector.inspect(bytes, signal);

if (upload.processedSha256 && inspected.digestSha256 !== upload.processedSha256) {
    throw Object.assign(new BadRequestException('Uploaded object digest does not match'), {
        failureCode: 'upload_digest_mismatch',
    });
}
```

After terminalizing inspection failure, return the normal failed session envelope rather than leaking an untyped 500.

- [ ] **Step 6: Verify GREEN and commit**

Run:

```powershell
& .\node_modules\.bin\jest.cmd --config apps/backend/package.json --runInBand --runTestsByPath apps/backend/src/images/stored-image-inspector.service.spec.ts apps/backend/src/images/images.controller.spec.ts apps/backend/src/images/images.service.spec.ts apps/backend/src/images/image-upload-fingerprint.spec.ts
git add -- apps/backend/package.json apps/backend/src/images
git rm -- apps/backend/src/images/image-upload-policy.service.ts apps/backend/src/images/image-upload-policy.service.spec.ts
git commit -m "refactor(upload): verify stored webp with sharp only"
```

Expected: exit code 0; test coverage includes actual WebP, non-WebP, truncation, output cap, digest mismatch, and terminal failure response.

## Task 5: Remove policy persistence from promotion, R2 metadata, reconciler, and Prisma

**Files:**

- Modify: apps/backend/src/images/image-upload-promotion.repository.ts
- Modify: apps/backend/src/images/image-upload-promotion.repository.spec.ts
- Modify: apps/backend/src/images/storage.service.ts
- Modify: apps/backend/src/images/storage.service.spec.ts
- Modify: apps/backend/src/images/image-upload-promotion-recovery.service.ts
- Modify: apps/backend/src/images/image-upload-promotion-recovery.service.spec.ts
- Modify: apps/backend/prisma/schema.prisma
- Create: apps/backend/prisma/migrations/20260727000100_simplify_admin_image_upload/migration.sql
- Modify: apps/backend/test/image-upload-settlement.integration-spec.ts
- Modify: apps/backend/test/image-upload-schema.integration-spec.ts
- Modify: apps/backend/test/image-concurrency.integration-spec.ts
- Modify: apps/backend/test/images.e2e-spec.ts

- [ ] **Step 1: Write failing promotion/recovery tests**

Remove policyVersion from fixtures. Assert CopyObject metadata is exactly:

```ts
expect(copyCommand.input.Metadata).toEqual({
    sha256: inspectedSha256,
    'promotion-id': promotionId,
    bytes: '1024',
    width: '1200',
    height: '800',
});
```

Add recovery coverage where a historical destination additionally contains a policy metadata key. It must still settle; existing R2 objects are not rewritten and new recovery no longer regards that key as an invariant.

- [ ] **Step 2: Verify RED**

Run:

```powershell
& .\node_modules\.bin\jest.cmd --config apps/backend/package.json --runInBand --runTestsByPath apps/backend/src/images/image-upload-promotion.repository.spec.ts apps/backend/src/images/storage.service.spec.ts apps/backend/src/images/image-upload-promotion-recovery.service.spec.ts
```

Expected: failure because the current copy facts and invariant require policyVersion.

- [ ] **Step 3: Remove policy from durable promotion data**

Delete policyVersion from repository input/data, ImageUploadPromotionCopyFacts, CopyObject metadata, recovery metadataSha256, exactDestination, requirePromotionFacts, and the Prisma invalid-row condition. Keep ETag, byte count, MIME, digest, width, height, promotion ID, copy-state, conflict, retry, ownership, and cleanup checks unchanged.

- [ ] **Step 4: Add the destructive migration**

Remove policyVersion and policySnapshot from ImageUpload and policyVersion from ImageUploadPromotion in schema.prisma. Create migration.sql:

```sql
ALTER TABLE "ImageUploadPromotion"
  DROP CONSTRAINT "ImageUploadPromotion_current_facts_check";

ALTER TABLE "ImageUpload"
  DROP COLUMN "policyVersion",
  DROP COLUMN "policySnapshot";

ALTER TABLE "ImageUploadPromotion"
  DROP COLUMN "policyVersion";

ALTER TABLE "ImageUploadPromotion"
  ADD CONSTRAINT "ImageUploadPromotion_current_facts_check"
  CHECK (
    "origin" <> 'current' OR (
      "sourceEtag" IS NOT NULL AND
      "inspectedSha256" IS NOT NULL AND
      "inspectedByteSize" IS NOT NULL AND
      "canonicalMime" IS NOT NULL AND
      "inspectedWidth" IS NOT NULL AND
      "inspectedHeight" IS NOT NULL AND
      "copyDispatchedAt" IS NOT NULL AND
      "lastDispatchAttemptAt" IS NOT NULL AND
      "nextReconcileAt" IS NOT NULL AND
      "dispatchAttempts" >= 1
    )
  );
```

Do not modify historical migrations. Do not rewrite or delete historical R2 policy metadata.

- [ ] **Step 5: Update integration/e2e fixtures**

Use only WebP presign requests. Cover:

- GET images/upload-policy returns 404;
- stale policyVersion bodies return upload_invalid_request;
- valid WebP bodies create/reuse idempotent sessions;
- preexisting uploadId sessions finish through new Sharp inspection;
- all three columns are absent after migration.

- [ ] **Step 6: Verify GREEN and commit**

Run:

```powershell
npx --no-install prisma validate --schema apps/backend/prisma/schema.prisma
& .\node_modules\.bin\jest.cmd --config apps/backend/test/jest-integration.json --runInBand --runTestsByPath apps/backend/test/image-upload-schema.integration-spec.ts apps/backend/test/image-upload-settlement.integration-spec.ts apps/backend/test/image-concurrency.integration-spec.ts
git add -- apps/backend/src/images apps/backend/prisma apps/backend/test
git commit -m "refactor(upload): drop policy persistence and r2 metadata"
```

Expected: all selected checks exit 0.

## Task 6: Increase presign limit to 60 while preserving rolling-window behavior

**Files:**

- Modify: apps/backend/src/images/image-upload-rate-limit.service.ts
- Modify: apps/backend/src/images/image-upload-rate-limit.service.spec.ts
- Modify: apps/backend/test/image-upload-rate-limit.integration-spec.ts
- Modify: apps/backend/test/images.e2e-spec.ts

- [ ] **Step 1: Write the failing 60-request tests**

Create 60 upload_url admissions and assert the 61st rejects with:

```ts
{
  statusCode: 429,
  code: 'upload_rate_limited',
  retryAfter: new Date(oldestInside.getTime() + 600_000).toISOString(),
}
```

Keep confirm, status, and abandon limit expectations unchanged.

- [ ] **Step 2: Verify RED**

Run:

```powershell
& .\node_modules\.bin\jest.cmd --config apps/backend/package.json --runInBand --runTestsByPath apps/backend/src/images/image-upload-rate-limit.service.spec.ts
```

Expected: failure because upload_url remains 20.

- [ ] **Step 3: Change only upload_url**

```ts
upload_url: Object.freeze({ limit: 60, windowMs: 10 * 60 * 1000 }),
```

Do not change advisory locking, serializable transactions, boundary semantics, cleanup, or UploadRateLimitedException.

- [ ] **Step 4: Verify GREEN and commit**

Run:

```powershell
& .\node_modules\.bin\jest.cmd --config apps/backend/test/jest-integration.json --runInBand --runTestsByPath apps/backend/test/image-upload-rate-limit.integration-spec.ts
git add -- apps/backend/src/images/image-upload-rate-limit.service.ts apps/backend/src/images/image-upload-rate-limit.service.spec.ts apps/backend/test/image-upload-rate-limit.integration-spec.ts apps/backend/test/images.e2e-spec.ts
git commit -m "feat(upload): allow sixty presign requests per admin"
```

Expected: 60 requests succeed and the 61st preserves retryAfter.

## Task 7: Remove manual cutover runtime and policy environment coupling

**Files:**

- Delete: all image-upload-cutover files listed in File map
- Modify: apps/backend/src/images/image-upload-runtime-config.ts
- Modify: apps/backend/src/images/image-upload-runtime-config.spec.ts
- Modify: apps/backend/src/scripts/reconcile-image-uploads.spec.ts
- Modify: apps/backend/package.json
- Modify: apps/backend/Dockerfile
- Modify: apps/backend/Dockerfile.operator-smoke
- Modify: apps/backend/src/images/docker-runtime-contract.spec.ts
- Modify: docker-compose.yml
- Modify: docs/runbooks/image-upload-roll-forward.md

- [ ] **Step 1: Write failing runtime tests**

Change runtime tests so only api and reconciler are valid process roles, and neither IMAGE_UPLOAD_POLICY_VERSION nor IMAGE_UPLOAD_CUTOVER values occur in requirements, runtime values, or sanitized fingerprints.

- [ ] **Step 2: Verify RED**

Run:

```powershell
& .\node_modules\.bin\jest.cmd --config apps/backend/package.json --runInBand --runTestsByPath apps/backend/src/images/image-upload-runtime-config.spec.ts apps/backend/src/scripts/reconcile-image-uploads.spec.ts
```

Expected: failure because current runtime config still requires policy version and accepts cutover.

- [ ] **Step 3: Remove runtime cutover/policy code**

In image-upload-runtime-config.ts:

- remove policy hash/version imports, fields, required variable, validation, and fingerprint fields;
- remove cutover role, its credentials, and its required/forbidden variable lists;
- retain API/reconciler R2, proxy, ingress, and reconciler cadence validation.

Delete cutover service, PostgreSQL repository, CLI, specs, and integration test. Remove images:uploads:cutover from backend package scripts. Update test:image-upload:unit and test:image-upload:integration to remove the deleted policy/cutover spec paths while retaining every remaining upload test. Remove compiled-runtime checks for image-upload-cutover.js.

- [ ] **Step 4: Simplify Compose and runbook**

Delete both IMAGE_UPLOAD_POLICY_VERSION Compose environment lines. Do not add stop/start, health, presign toggling, or required smoke steps.

Add a short top notice to the old roll-forward runbook that says ADR 0002 and the simplified spec supersede it. Remove instructions invoking the deleted cutover CLI or requiring manual service shutdown. Keep archival history below the notice.

- [ ] **Step 5: Verify GREEN and commit**

Run:

```powershell
& .\node_modules\.bin\jest.cmd --config apps/backend/package.json --runInBand --runTestsByPath apps/backend/src/images/image-upload-runtime-config.spec.ts apps/backend/src/scripts/reconcile-image-uploads.spec.ts apps/backend/src/images/docker-runtime-contract.spec.ts
docker compose config --quiet
git add -- apps/backend docker-compose.yml docs/runbooks/image-upload-roll-forward.md
git rm -- apps/backend/src/images/image-upload-cutover.service.ts apps/backend/src/images/image-upload-cutover.service.spec.ts apps/backend/src/images/image-upload-cutover.pg.ts apps/backend/src/scripts/image-upload-cutover.ts apps/backend/src/scripts/image-upload-cutover.spec.ts apps/backend/test/image-upload-cutover.integration-spec.ts
git commit -m "refactor(upload): remove manual cutover runtime"
```

Expected: runtime and Compose checks exit 0 without policy/cutover variables.

## Task 8: Keep smoke/staging diagnostics optional but remove policy references

**Files:**

- Modify: apps/backend/src/scripts/image-upload-production-smoke-live.ts and spec
- Modify: apps/backend/src/scripts/image-upload-production-smoke-pg.ts and spec
- Modify: apps/backend/src/scripts/image-upload-production-smoke-dependencies.ts
- Modify: apps/backend/src/scripts/image-upload-production-smoke-contract.ts and spec
- Modify: apps/backend/src/scripts/image-upload-production-smoke-orchestrator.spec.ts
- Modify: apps/backend/src/scripts/run-image-upload-production-smoke.spec.ts
- Modify: apps/backend/test/image-upload-production-smoke.integration-spec.ts
- Modify: apps/backend/test/run-image-upload-staging.ts and spec
- Modify: scripts/schemas/image-upload-production-evidence.schema.json
- Modify: scripts/fixtures/image-upload-production-gates/pass.json
- Modify: scripts/verify-image-upload-production-gates.mjs and test
- Modify: scripts/verify-image-upload-final-ingress-gates.mjs and test
- Delete: policy-binding.json

- [ ] **Step 1: Write failing smoke tests**

Make smoke request fixtures exactly WebP-only:

```ts
request: {
  clientRequestId,
  albumId,
  filename: 'operator-smoke.webp',
  contentType: 'image/webp',
  fileSize: bytes.byteLength,
  processedSha256,
}
```

Assert that smoke code does not GET images/upload-policy, does not send policyVersion, does not query policy columns, and checks only digest, promotion ID, bytes, width, and height in expected R2 metadata.

- [ ] **Step 2: Verify RED**

Run:

```powershell
& .\node_modules\.bin\jest.cmd --config apps/backend/package.json --runInBand --runTestsByPath apps/backend/src/scripts/image-upload-production-smoke-live.spec.ts apps/backend/src/scripts/image-upload-production-smoke-pg.spec.ts apps/backend/src/scripts/image-upload-production-smoke-contract.spec.ts
```

Expected: failure because current smoke flow fetches policy and stores policy evidence.

- [ ] **Step 3: Simplify smoke and gate implementation**

- image-upload-production-smoke-live.ts: remove policyVersion state and policy endpoint call.
- image-upload-production-smoke-dependencies.ts: remove policy request and expected metadata.
- image-upload-production-smoke-pg.ts: remove policy columns from select/check/insert SQL.
- evidence schema: remove policyVersion and policyHash.
- production-gates verifier: delete policy equality assertion and policy-binding fixture.
- retain release commit/fingerprint, secret redaction, R2 authority, cleanup, reconciliation, and polling evidence checks.

- [ ] **Step 4: Verify GREEN and commit**

Run:

```powershell
& .\node_modules\.bin\jest.cmd --config apps/backend/package.json --runInBand --runTestsByPath apps/backend/src/scripts/image-upload-production-smoke-contract.spec.ts apps/backend/src/scripts/image-upload-production-smoke-live.spec.ts apps/backend/src/scripts/image-upload-production-smoke-pg.spec.ts apps/backend/src/scripts/image-upload-production-smoke-orchestrator.spec.ts apps/backend/src/scripts/run-image-upload-production-smoke.spec.ts
node scripts/verify-image-upload-production-gates.test.mjs
node scripts/verify-image-upload-final-ingress-gates.test.mjs
git add -- apps/backend/src/scripts apps/backend/test scripts
git rm -- scripts/fixtures/image-upload-production-gates/fail/policy-binding.json
git commit -m "refactor(upload): remove policy from smoke tooling"
```

Expected: optional diagnostics pass without being part of cutover.

## Task 9: Remove policy package, Docker, and CI coupling

**Files:**

- Delete: packages/image-upload-policy/
- Modify: apps/frontend/package.json
- Modify: apps/backend/package.json
- Modify: packages/types/package.json
- Modify: apps/frontend/Dockerfile
- Modify: apps/backend/Dockerfile
- Modify: apps/backend/Dockerfile.operator-smoke
- Modify: .github/workflows/image-upload.yml
- Modify: scripts/verify-image-upload-workflow.mjs
- Delete: scripts/turbo-build-path-budget.test.mjs
- Modify: package-lock.json

- [ ] **Step 1: Update packaging assertions first**

Make Docker/runtime/workflow contract tests require:

- frontend/backend builds do not copy or build packages/image-upload-policy;
- backend runtime has Sharp as a normal production dependency;
- runtime includes API and reconciler entrypoints but not image-upload-cutover.js;
- CI runs upload tests and browser tests without a policy build;
- no check requires Chromium major at least 136.

- [ ] **Step 2: Verify RED**

Run:

```powershell
node scripts/verify-image-upload-workflow.mjs
```

Expected: failure because Dockerfiles and workflow still build/copy the removed package.

- [ ] **Step 3: Remove package references and regenerate lock**

Remove the dependency from all workspace package manifests and delete packages/image-upload-policy. Remove Docker copy/build/runtime checks for it.

Regenerate only the lockfile:

```powershell
npm install --package-lock-only --ignore-scripts
```

In the GitHub workflow remove all policy build commands and IMAGE_UPLOAD_POLICY_VERSION. Keep a Chromium browser job, but change image-upload.browser.spec.ts to assert actual feature support only.

- [ ] **Step 4: Verify packaging and commit**

Run:

```powershell
node scripts/verify-image-upload-workflow.mjs
docker build --build-arg "IMAGE_UPLOAD_RELEASE_COMMIT=$(git rev-parse HEAD)" -f apps/backend/Dockerfile -t ndt-backend:simplified-upload .
docker build -f apps/frontend/Dockerfile -t ndt-frontend:simplified-upload .
docker compose config --quiet
git add -- package-lock.json package.json apps/frontend apps/backend packages/types .github scripts
git rm -r -- packages/image-upload-policy scripts/turbo-build-path-budget.test.mjs
git commit -m "build: remove image upload policy workspace"
```

Expected: packaging succeeds with no policy workspace in either image.

## Plan self-review

- Spec coverage: Tasks 1-3 implement static browser compression, feature detection, 50/2 batching, no pass-through, and 429 retry display. Tasks 4-6 implement Sharp verification, digest/promotion preservation, 60/10 rate limit, and three-column removal. Tasks 7-9 remove cutover/policy runtime, package, Docker, smoke, and CI coupling. The per-task focused tests remain; a separate browser/local acceptance-and-audit task is intentionally omitted by user decision.
- Non-goals remain excluded: server source normalization, original fallback, GIF/SVG/HEIC/AVIF, stale tab support, dynamic compression, and R2 rewrites.
- Placeholder scan: passed; no deferred work or vague validation instruction remains.
- Type consistency: presign uses image/webp, processedSha256, and no policy field across frontend, shared types, DTO, fingerprint, service, smoke, and tests.
