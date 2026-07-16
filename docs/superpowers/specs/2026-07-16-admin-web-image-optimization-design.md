# Admin Web Image Optimization Design

**Date:** 2026-07-16
**Status:** Pending written-spec review
**Scope:** Admin image selection, browser-side optimization, presigned R2 upload, backend verification, and upload observability

## Context

The application already uploads images directly from the admin browser to a temporary
R2 key, then confirms the upload through the backend. The backend verifies the
declared object size and content type with `HeadObject`, reserves album capacity in
a Serializable transaction, conditionally copies the temporary object to an immutable
`albums/` key, creates the `Image` row, and deletes the temporary object. Imgproxy
generates WebP variants at 400, 800, 1200, 1920, and 2560 pixels from that canonical
R2 object.

The current admin UI uses `browser-image-compression` only for files larger than
10 MiB. It targets 10 MiB, limits the longest edge to 4096 pixels, and attempts
quality 0.85. Compression failure is fail-open: the original file is uploaded.
Animated GIFs are always passed through. The backend accepts a declared object as
large as 100 MiB and trusts R2 object metadata rather than decoding the uploaded
bytes.

This means a 10–50 MiB source can still become the canonical R2 object. It also
means a client that bypasses the admin UI can upload bytes that match the declared
size and metadata but do not satisfy the intended web-image policy.

The site only needs web display. It does not need to preserve originals for print,
download, or later editing.

## Goals

- Store only a web-ready master for large admin uploads; never retain the original.
- Preserve the approved visual balance: maximum 2560-pixel edge and WebP quality 84.
- Keep typical optimized masters around 1–3 MiB, with a hard stored-object cap of
  5 MiB.
- Save both upload bandwidth and R2 storage by optimizing before presigning/upload.
- Make quality and size settings centrally configurable for future uploads.
- Verify actual image bytes on the backend before promotion to the canonical key.
- Preserve the existing upload-session, ETag lease, capacity, cleanup, and
  conditional-copy guarantees.
- Give admins accurate optimization/upload progress and actionable per-file errors.
- Add security controls proportionate to an authenticated photography admin surface.

## Non-goals

- Preserve or archive original image files.
- Reprocess images already stored in R2.
- Change imgproxy variant dimensions or delivery quality.
- Add RAW, TIFF, HEIC, SVG, animated GIF, or multi-page image support.
- Introduce a background image-processing worker.
- Make the backend re-encode every image.
- Split storage across multiple Cloudflare accounts to aggregate free quotas.

## Decision Summary

Use browser-first optimization with backend-owned policy and backend verification.

The browser applies the approved preset before requesting a presigned URL. The
backend remains authoritative: it publishes the policy, snapshots it into each
upload session, caps the presigned object size, decodes the uploaded object under
strict limits, and promotes only a valid image. R2 receives only the processed
payload.

Two alternatives were rejected:

1. **Synchronous backend re-encoding:** deterministic, but it uploads every
   10–50 MiB source first and adds substantial backend CPU, memory, and latency.
2. **Asynchronous worker processing:** suitable for a large media platform, but it
   requires temporary original retention, queues, worker operations, and additional
   recovery states that are unnecessary for this admin-only workload.

## Optimization Policy

The initial policy is identified as `web-v1`:

| Property | Value |
|---|---:|
| Maximum source size accepted by the admin UI | 100 MiB |
| Optimization trigger | source > 3 MiB, longest edge > 2560 px, or unsupported pass-through representation |
| Preferred stored format for optimized images | WebP |
| Maximum width or height | 2560 px |
| WebP encode quality | 0.84 |
| Expected/soft stored size | 1–3 MiB |
| Hard stored size | 5 MiB |
| Maximum decoded stored-image pixels | 7,000,000 |
| Allowed stored formats | JPEG, PNG, WebP |
| Allowed page/frame count | 1 |
| Presigned URL lifetime | existing one-hour lifetime |

Quality 0.84 is the approved preset. The optimizer must not silently switch to the
previously tested B-lite quality 0.76. It performs one encode at quality 0.84 and
rejects the file if that result exceeds 5 MiB. A later policy version may change
these values deliberately.

A JPEG, PNG, or WebP may pass through without another lossy encode only when its
decoded dimensions are already at most 2560 × 2560 and its size is at most 3 MiB.
Every other accepted source is normalized to WebP. GIF, SVG, animated, and
multi-page inputs are rejected with a clear admin message.

Policy changes affect future upload sessions only. Each session stores the policy
version and enforcement snapshot used when its presigned URL was issued, so an
operator change does not invalidate an in-flight upload.

## Architecture and Component Boundaries

### Backend policy owner

A focused image-upload policy service reads validated environment settings and
returns an admin-only policy document. It owns defaults, cross-field invariants,
and the immutable snapshot placed on an upload session.

The policy endpoint is authenticated with the existing JWT and `admin` role
guards. The frontend caches the response for the current admin page session. It
does not expose credentials, bucket details, or signing information.

Environment validation rejects unsafe or internally inconsistent values, including
a maximum edge above imgproxy's intended source limit, a hard size above the
server inspection budget, a quality outside `0 < quality <= 1`, or a soft target
larger than the hard cap.

### Frontend optimizer

Image optimization moves out of the large `ImageUploadZone` component into a
focused module with these responsibilities:

- decide whether a file may pass through or needs optimization;
- normalize EXIF orientation;
- resize without cropping or enlarging;
- encode WebP at the policy's fixed quality;
- return actual output size, MIME type, width, height, duration, and savings;
- honor an `AbortSignal`;
- release temporary browser resources.

Files are optimized sequentially to bound browser memory. Direct R2 uploads may
continue with the existing concurrency of two after optimization has completed.
The queue displays distinct `optimizing`, `ready`, `uploading`, `verifying`,
`success`, `error`, and `cancelled` states.

### Upload session snapshot

`ImageUpload` gains two nullable/additive fields so existing rows and rollback
builds remain compatible:

- `policyVersion String?`;
- `policySnapshot Json?`.

The JSON snapshot contains the exact `maxStoredBytes`, `maxWidth`, `maxHeight`,
`maxDecodedPixels`, and `allowedStoredFormats` values enforced for that session.
The backend creates this JSON from its own validated policy; it never persists a
client-supplied snapshot.

The upload request sends the processed file's filename, size, and content type,
plus informational source size and processed dimensions. Client-provided
dimensions and source size are useful for UI/metrics but never authoritative.

The backend enforces album status, completed-image capacity, and active
pending/finalizing session capacity before creating another presigned session.
The existing server-generated temporary/final object keys remain unchanged.

### Stored-object inspector

The backend adds a bounded inspection operation after the existing `HeadObject`
check and before the finalizing reservation/promotion:

1. Require `ContentLength` to match the upload-session size and remain within the
   session's hard cap; capture the non-empty ETag returned by `HeadObject`.
2. Issue `GetObject` with `IfMatch` set to that ETag and stream at most the hard
   cap plus one byte; abort if the object changed or the byte limit is exceeded.
3. Decode metadata with Sharp using the session's pixel limit.
4. Require actual JPEG, PNG, or WebP format, one page/frame, positive dimensions,
   and both dimensions at or below the session limit.
5. Return canonical width, height, format, byte size, and the inspected ETag.

Sharp becomes a production dependency because runtime code uses it. The
inspection path is bounded to at most 5 MiB and 7 million decoded pixels; it is not
a backend re-encoding path.

The existing verified ETag remains the content lease. Conditional copy with
`CopySourceIfMatch` ensures the object inspected is the object promoted. The
actual width, height, and optimized byte count are persisted on the final
`Image` row.

## End-to-End Data Flow

1. The admin page loads the authenticated upload policy.
2. The admin selects JPEG, PNG, or WebP files.
3. The frontend validates source type and the 100 MiB source ceiling.
4. The frontend decodes enough metadata to choose pass-through or optimization.
5. When required, it rotates, resizes to a maximum 2560-pixel edge, and encodes
   WebP once at quality 0.84.
6. The frontend rejects output over 5 MiB; it never falls back to the source.
7. The queue shows original bytes, stored bytes, percentage saved, and final
   dimensions.
8. The frontend requests a presigned URL using processed-file metadata and the
   policy version.
9. The backend validates the policy version/snapshot, album capacity, active
   sessions, filename, MIME, and processed size, then persists the session.
10. The browser PUTs only the processed file to the temporary R2 key.
11. Confirm loads the session, performs `HeadObject`, obtains the ETag, and runs
    bounded stored-object inspection.
12. Existing Serializable reservation marks the session `finalizing`.
13. Existing conditional promotion copies the inspected temporary object to the
    immutable final key.
14. Existing final transaction creates the `Image` row with canonical metadata,
    increments the album count, and consumes the session.
15. The temporary object is deleted. Imgproxy serves the existing responsive
    variants from the optimized master.

## Security Invariants

The scoped Codex Security design review adds these explicit invariants:

- Only an authenticated admin can read policy, request a presigned URL, or confirm
  an upload.
- R2 object keys are generated by the server; filenames cannot choose a bucket
  path.
- No client-supplied MIME, dimension, or source-size field is trusted as proof of
  content.
- No object larger than the session snapshot's hard cap is promoted.
- No image exceeding the decoder pixel budget is decoded/promoted.
- SVG, animated images, multiple pages/frames, and MIME-spoofed payloads are not
  canonicalized.
- The object ETag inspected is the ETag conditionally promoted.
- Presigned URLs, R2 credentials, and image bytes are never written to logs.
- Policy/presign/confirm endpoints retain global throttling and receive a stricter
  upload-specific limit.
- The number of active upload sessions cannot exceed the album's remaining
  50-image capacity.
- Temporary objects have both application cleanup and an R2 lifecycle backstop.

The current global 50 MiB JSON/body-parser limit is unrelated to direct R2 upload
and expands request-body denial-of-service exposure. It is reduced to 1 MiB unless
a separately documented endpoint proves it needs more.

## Failure and Cancellation Semantics

- If policy loading fails, upload controls remain disabled and the UI offers a
  policy retry.
- If browser decoding or optimization fails, only that file becomes `error`;
  no presign request occurs and no original upload is attempted.
- If optimization is cancelled, the worker and any active browser operation
  receive an abort signal and the file becomes `cancelled`.
- If PUT fails, the session remains eligible for existing expiration cleanup. A
  retry obtains a fresh upload session when the previous URL/session is no longer
  usable; it reuses the already optimized in-memory file rather than re-encoding.
- If stored-object inspection fails, the session becomes `failed`, promotion is
  not called, and cleanup removes the temporary key after the configured grace
  period.
- If the ETag changes after inspection, conditional copy fails and the object is
  not canonicalized.
- If final database work fails after promotion, existing lease recovery and
  unreferenced-final-key cleanup continue to apply.
- UI cancellation aborts the active XHR/fetch operation; it does not merely change
  React state.

## Cleanup and Storage Controls

Application cleanup remains authoritative for session state. In addition, R2
receives a lifecycle rule for the `uploads/` prefix that expires temporary
objects after 24 hours. This is a backstop for scheduler, database, or deployment
failure and must never target `albums/`.

Changing the preset does not rewrite existing R2 objects. Deleting an image
continues to use the durable `ImageObjectDeletion` queue.

## Observability

Record structured events for:

- policy version;
- source and stored byte counts;
- source and stored dimensions when available;
- whether the file passed through or was optimized;
- optimization and upload durations;
- rejection category;
- inspection format/dimensions;
- final confirmation outcome.

Do not log filenames when they may contain sensitive client information unless
they are sanitized and operationally necessary. Never log presigned URLs, tokens,
credentials, or image bytes.

Operational dashboards should track optimized byte ratio, failure rate by stage,
temporary-object cleanup failures, and objects rejected by the hard cap or decoder
limits.

## Testing Strategy

### Frontend unit tests

Use a compressor adapter so tests can mock browser encoding while exercising
policy decisions and state transitions:

- large source selects WebP optimization;
- over-dimension source selects optimization;
- already compliant JPEG/PNG/WebP passes through without re-encoding;
- GIF/SVG/animated or unsupported input is rejected;
- quality 0.84 and 2560-pixel bounds are passed to the encoder;
- output over 5 MiB is rejected without calling the upload API;
- compression failure does not upload the source;
- abort transitions to `cancelled`;
- retry reuses the optimized result rather than encoding it again;
- object URLs and worker resources are released.

### Backend unit and E2E tests

- environment policy values and cross-field constraints are validated;
- policy, presign, and confirm reject unauthenticated/non-admin callers;
- filename, UUID, size, content type, and policy version validation is strict;
- active sessions consume remaining album upload capacity;
- route-specific throttling rejects excessive presign requests;
- spoofed MIME, malformed bytes, oversized objects, excessive pixels, zero
  dimensions, animation, and multiple pages are rejected;
- an inspected ETag mismatch never calls promotion;
- valid JPEG/PNG/WebP metadata is persisted to `Image`;
- failed inspection is cleaned up and cannot be retried as a valid session;
- existing 49/50 concurrent confirmation and stale-lease integration tests remain
  green;
- global JSON requests above 1 MiB are rejected.

### Manual quality benchmark

Use a local, untracked professional source such as `0W9A1500.jpg` to compare:

- source rendered through imgproxy-equivalent WebP quality 80;
- policy B master (2560 px, quality 84) rendered through quality 80;
- full-frame display and 1:1 crops around face, hair, fabric, and gradients;
- source/master bytes and final display bytes.

The 41 MiB source is not committed to the repository. The benchmark validates
visual quality but does not establish a universal compression ratio.

### Verification commands

The implementation plan will include focused frontend tests, backend unit/E2E and
PostgreSQL integration tests, Prisma validation/migration deployment on a
disposable database, backend/frontend production builds, and `git diff --check`.

## Rollout and Rollback

Roll out in three compatible stages:

1. Add validated backend policy, additive upload-session fields, object inspection,
   and tests. A temporary `IMAGE_UPLOAD_ALLOW_LEGACY_POLICY=true` compatibility
   switch keeps requests from the old frontend on the existing verification path.
2. Deploy the browser optimizer and admin progress UI. New requests include
   `policyVersion=web-v1`; only these sessions use the new 5 MiB inspection path.
3. After staging quality and failure-rate checks pass, set
   `IMAGE_UPLOAD_ALLOW_LEGACY_POLICY=false` and add the R2 `uploads/` lifecycle
   rule. Requests without a recognized policy version are then rejected.

Production acceptance requires successful uploads of representative portrait,
high-detail, dark/noisy, PNG, and the local 41 MiB source; all final objects must
satisfy the stored policy and render through every imgproxy variant.

Rollback before or during cutover first restores
`IMAGE_UPLOAD_ALLOW_LEGACY_POLICY=true`, then redeploys the prior frontend/backend
pair. Additive session fields remain compatible, and optimized masters already
written to R2 remain valid imgproxy sources. No database or object restoration is
required. The R2 lifecycle rule is safe to retain because it applies only to
temporary `uploads/` keys.

## Acceptance Criteria

- Large admin photos are uploaded to R2 only after browser optimization.
- The approved preset is 2560 px, WebP quality 84; B-lite quality 76 is not used.
- Compression failure cannot upload the original.
- Canonical objects are at most 5 MiB and satisfy actual format, frame, dimension,
  and pixel-budget checks.
- The backend promotes exactly the ETag it inspected.
- Existing admin authorization, 50-image capacity, ETag lease, cleanup, deletion
  queue, and imgproxy delivery behavior remain intact.
- Policy values are centrally validated and adjustable for future sessions.
- Admin UI reports original and optimized size plus optimization/upload state.
- Representative staging images remain acceptably sharp at full frame and 1:1
  crop.
- R2 temporary objects are covered by application cleanup and a 24-hour lifecycle
  backstop.
- No original source file is retained by the application.
