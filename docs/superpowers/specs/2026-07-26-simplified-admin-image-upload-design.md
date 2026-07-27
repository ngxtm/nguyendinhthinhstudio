# Simplified Admin Image Upload Design

**Date:** 2026-07-26  
**Status:** Approved  
**Decision:** [ADR 0002](../../adr/0002-simplify-admin-image-upload.md)

## Objective

Replace the versioned image-policy and custom image-grammar system with a small, deterministic upload pipeline:

1. The admin browser decodes each accepted source.
2. The browser encodes exactly one static WebP.
3. R2 receives the temporary WebP through the existing presigned upload flow.
4. The backend downloads the temporary object and full-decodes it with Sharp.
5. The existing digest, promotion, settlement, cleanup, and database finalization flow continues.

The final system must not contain application-owned ICC parsing, JPEG/PNG/WebP grammar validation, dynamic policy negotiation, or policy snapshots.

## Fixed Compression Recipe

The compression recipe is frontend-owned constants, not a remotely versioned policy:

| Setting                    |                                   Value |
| -------------------------- | --------------------------------------: |
| Accepted source MIME types | `image/jpeg`, `image/png`, `image/webp` |
| Maximum source bytes       |             100 MiB (104,857,600 bytes) |
| Output MIME                |                            `image/webp` |
| WebP quality               |                                    0.84 |
| Maximum output edge        |                                 2560 px |
| Maximum output bytes       |                 5 MiB (5,242,880 bytes) |
| Batch size                 |                                50 files |
| Queue concurrency          |                                       2 |

Every accepted source is decoded and encoded once. There is no pass-through path, even when the source is already WebP or already below the output limits. An encode or decode failure rejects only that file; the original is never uploaded as a fallback.

## Browser Processing

Browser support is based on feature detection rather than browser name or version. The implementation uses native image decoding and an `OffscreenCanvas` when available, with a regular canvas fallback. If the browser cannot decode the source or encode WebP, the UI reports a browser-processing error for that file.

Native decoding owns color and orientation behavior:

- Application code does not read, parse, hash, allowlist, reject, or strip ICC data.
- Application code does not parse EXIF orientation.
- The native decoder may use embedded color and orientation metadata before drawing pixels.
- The encoder may emit color metadata; neither frontend nor backend inspects it.
- PNG/WebP alpha is preserved.
- Animated WebP is flattened to its first decoded frame and stored as a static WebP.

The output filename retains the normalized source basename and replaces its extension with `.webp`.

## Presign Request and Error Handling

The presign request keeps:

- `clientRequestId`
- `albumId`
- normalized `filename`
- `contentType` (always `image/webp`)
- `fileSize`
- `processedSha256`

The request removes `policyVersion`. The backend no longer returns `policy_refresh_required`, and the frontend no longer loads `GET /images/upload-policy`.

The frontend must preserve structured API errors. For HTTP 429 it reads `code: upload_rate_limited` and `retryAfter`, shows the absolute or remaining wait time, and does not classify the response as an image-processing error or retry automatically.

The `upload_url` rate limit becomes 60 requests per rolling 10 minutes per admin. Existing confirm, status, and abandon route limits remain unchanged.

## Minimal Backend Inspection

Before promotion, the backend retains the existing HEAD, ETag/If-Match, digest, lease, and bounded object-read boundaries. Inspection then performs only these application checks:

1. The downloaded object is no larger than 5 MiB (5,242,880 bytes).
2. Sharp recognizes the actual format as WebP.
3. Sharp full-decodes the object successfully.
4. The decoded width and height are recorded.
5. The inspected SHA-256 matches the browser-declared processed digest.

There is no application-specific maximum width, height, decoded-pixel rule, metadata rule, page-count rule, ICC rule, or custom binary grammar. Sharp's own decoder safety behavior remains enabled. A failed inspection fails the upload and prevents promotion.

## Removal Scope

Implementation removes all policy and grammar coupling, including:

- `packages/image-upload-policy`
- Workspace dependencies on `@ndt/image-upload-policy`
- Frontend pretest/build/Docker steps that build or copy the policy package
- Backend build/Docker/operator-smoke steps that build or copy the policy package
- `ImageUploadPolicyService` and `GET /images/upload-policy`
- `preflightImage`, `classifySource`, `validateStored`, grammar readers, format grammars, ICC helpers, fixture corpus, fuzz tests, and policy hashing
- Policy capability/version checks in the frontend optimizer
- Policy-derived error codes and policy response types
- `policyVersion` from presign requests, session fingerprints, services, promotion records, scripts, smoke checks, and responses
- `ImageUpload.policyVersion`
- `ImageUpload.policySnapshot`
- `ImageUploadPromotion.policyVersion`

Tests and documentation that assert the superseded policy/grammar contract must be removed or rewritten for this design. Unrelated upload invariants—authentication, admin authorization, idempotency, rate-limit atomicity, R2 settlement, ETag conditional reads, digest comparison, promotion recovery, cleanup, and album capacity—remain in scope and must not be weakened.

## Cold Cutover

The release is an immediate contract replacement:

1. Apply the migration that drops the three policy columns as part of the same release.
2. Deploy the matching frontend, backend, and reconciler containers.
3. The sole admin refreshes the page after deployment before uploading.

A brief upload interruption or error while the deployment replaces containers is accepted. There is no separate presign disable/re-enable step or manual backend/reconciler stop step. Old admin tabs and old presign request bodies are unsupported. Uploads that already have an `uploadId` may finish through the new Sharp inspection path when their remaining session data is otherwise valid.

## Acceptance Criteria

- The supplied `Chụp Mẫu4328.JPG` uploads successfully after frontend compression when the admin is below the rate limit.
- JPEG, PNG with alpha, static WebP, and animated WebP inputs produce static WebP outputs.
- Output dimensions preserve aspect ratio and do not exceed 2560 px on either edge.
- Output size above 5 MiB (5,242,880 bytes) is rejected without uploading the original.
- Invalid or truncated output is rejected by Sharp full decode before promotion.
- ICC-bearing and EXIF-oriented sources are not rejected for metadata; native decoding determines rendered pixels.
- A browser lacking the required decode/encode features receives a clear per-file error.
- A 50-file batch runs with concurrency 2 without crossing the new 60/10-minute presign limit.
- A 429 response displays `retryAfter` and is not shown as an image corruption error.
- No active runtime, build, Docker, type, Prisma, or test dependency on `@ndt/image-upload-policy`, policy versions/snapshots, custom grammar, or ICC validation remains. Historical design documents may retain references when they are explicitly superseded by ADR 0002 and this spec.
- Focused frontend tests, backend tests, Prisma validation/migration checks, and production builds pass.

## Non-goals

- Uploading originals
- Preserving animation
- Supporting GIF, SVG, HEIC, or AVIF sources
- Supporting stale admin tabs during cutover
- Server-side source normalization
- Reintroducing dynamic compression settings through another policy abstraction
