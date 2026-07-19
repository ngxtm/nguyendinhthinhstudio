# Admin Web Image Optimization Roll-Forward Design

**Date:** 2026-07-19

**Status:** Canonical approved design for the current-only, cold-cutover, roll-forward implementation.

## 1. Decision

The image upload system keeps the reliability controls around temporary uploads, bounded validation, conditional R2 CopyObject promotion, durable idempotency, Queue settlement, DLQ handling, and cleanup reconciliation.

Production deployment uses a maintenance-window cold cutover. The old upload generation is stopped before the new generation starts. Recovery is roll-forward only: uploads remain disabled while a corrected new build is deployed.

## 2. Scope

The new version provides:

- browser-side bounded image optimization;
- one current `web-v1` upload request shape;
- temporary R2 uploads under `uploads/`;
- backend byte, digest, metadata, dimension, and full-decode validation;
- conditional CopyObject promotion to `albums/`;
- one durable promotion record for every dispatched COPY;
- Cloudflare Queue HTTP-pull settlement with a DLQ;
- idempotent confirm/status/retry behavior;
- scheduled cleanup and reconciliation;
- cold-cutover and roll-forward runbooks;
- real staging qualification against non-production R2 and Queue resources.

The design does not provide:

- simultaneous old and new upload writers;
- blue-green upload state-machine generations;
- runtime acceptance of `legacy-v0` requests;
- `IMAGE_UPLOAD_ALLOW_LEGACY_POLICY`;
- prior Prisma-client compatibility;
- prior-image compatibility containers;
- rollback by restarting the old backend or old cleanup binary.

Existing stored `Image` rows remain readable. Existing unfinished `ImageUpload` rows are handled once during the maintenance cutover and are not a permanent compatibility mode.

## 3. Runtime topology

The same new release produces two separately configured processes:

### API process

- handles policy, presign, confirm, status, and abandon routes;
- reads and validates image bytes;
- creates durable promotion records before CopyObject;
- commits successful `Image` rows;
- receives R2 data-plane credentials;
- never receives the Queue token or event-rule provisioning token.

### Reconciler process

- runs as one logical singleton protected by a PostgreSQL advisory lock;
- pulls and acknowledges Queue messages;
- resumes stale finalization after provider settlement;
- deletes only objects with explicit cleanup authority;
- receives Queue read/write credentials and scoped R2 HEAD/DELETE credentials;
- never receives the event-rule provisioning token.

`IMAGE_UPLOAD_PROCESS_ROLE=api|reconciler|cutover` is strict. Each entrypoint validates only its own required configuration and rejects secrets belonging to another role.

## 4. Upload flow

1. The authenticated admin sends a current `web-v1` presign request with a UUID `clientRequestId`, processed SHA-256, canonical MIME, expected size, filename, and album ID.
2. The backend creates or reuses an idempotency record and one `ImageUpload` session.
3. The browser PUTs the optimized image to `uploads/{uploadId}/{safeFilename}`.
4. Confirm HEADs and reads that exact object, enforces the byte limit, computes the digest, validates the stored-image grammar, and completes the bounded Sharp decode.
5. The request claims a tokenized finalization lease.
6. In a committed database transaction, the backend creates or reuses the promotion record directly in `dispatched` state. Here `dispatched` means provider mutation is authorized and may already have happened, so recovery always treats it as outcome-ambiguous.
7. Only after that transaction commits does the backend send CopyObject with exact source ETag, replacement canonical metadata, and R2 destination condition `cf-copy-destination-if-none-match: *`. The condition is staging-qualified and fail-closed so repeated recovery dispatches cannot overwrite or create more than one canonical winner.
8. A successful CopyObject response allows the lease owner to create `Image`, increment the album count, mark the upload `consumed`, and set the promotion disposition to `committed` in one serializable transaction.
9. The temporary object is deleted best-effort. Delete timeout creates retryable cleanup work and never rolls back the committed image.
10. Confirm or status retries return the retained terminal result and never create another image.

## 5. Durable data model

### `ImageUpload`

Stores the live session and ownership state:

- `pending`;
- `finalizing` with lease token and lease start;
- `consumed` with result image ID;
- `failed` with a stable failure category.

Every new session has `createdByAdminId`, `clientRequestId`, `policyVersion=web-v1`, processed digest, upload key, final key, source ETag when known, expiry, and result tombstone fields.

### `ImageUploadIdempotency`

Stores one permanent compact outcome per `clientRequestId`. It prevents duplicate sessions and duplicate images after request or response loss.

### `ImageUploadPromotion`

One row exists per upload promotion before R2 receives CopyObject.

Identity and matching fields:

- promotion ID and upload ID;
- finalization lease token;
- account ID and bucket;
- source object key and source ETag;
- destination object key;
- unique provider event ID when delivered;
- provider destination ETag;
- dispatch attempt count and last dispatch time.

Provider state is independent from object disposition:

- `copyState`: `dispatched | provider_settled`;
- `disposition`: `pending | committed | cleanup_required | verified_deleted`.

This separation prevents the false assumption that a completed COPY implies that its destination should be deleted.

Constraints:

- upload ID and destination key are unique;
- `(settlementSource, providerEventId)` is unique when present;
- `committed` requires a result image that references the destination key;
- `cleanup_required` requires a terminal failed/expired/abandoned session and no `Image` reference;
- `verified_deleted` requires matching provider settlement, a successful or safely retried DeleteObject, and a final absent HEAD.

## 6. Queue settlement state matrix

The R2 notification rule captures every `CopyObject` whose destination is under the canonical `albums/` prefix.

For each message the reconciler validates account, bucket, action, source key, destination key, event time, and destination ETag. It computes a stable SHA-256 event ID over the canonical validated envelope.

### Active lease

If the promotion is `pending` and the finalization lease is still active, the reconciler records provider settlement but does not finalize or delete. The request owner keeps mutation authority.

### Stale lease

If the lease is stale and provider settlement exists, the reconciler requires destination HEAD to match the event ETag and stored digest, then claims a new token and completes the same serializable image transaction. If settlement is still absent after the configured grace period, it HEADs the destination: an existing exact object waits for its event, while an absent destination permits one bounded retry of the same create-only conditional CopyObject. HTTP 412 means another dispatch already created the destination and never authorizes deletion.

### Committed upload

If the promotion is `committed`, or an `Image` already references the destination key, the reconciler records settlement and acknowledges the message. It never deletes the canonical object.

### Cleanup-authorized upload

If the promotion is `cleanup_required`, no `Image` references the destination, and event plus HEAD identity match, the reconciler deletes the destination, verifies it absent, and changes the disposition to `verified_deleted`.

### Missing or malformed match

An event with no exact durable match cannot authorize deletion. It is retried with a bounded delay and eventually enters the DLQ. Operator disposition is required before cutover completion or incident recovery can be declared safe.

Queue acknowledgement occurs only after the corresponding PostgreSQL transaction commits. Duplicate delivery is harmless.

## 7. Cloudflare Queue contract

Production and staging each have dedicated resources:

- source Queue name and ID;
- DLQ name and ID;
- source Queue HTTP-pull consumer ID;
- DLQ inspection HTTP-pull consumer ID;
- both consumer types `http_pull`;
- source consumer configured DLQ name;
- DLQ inspection consumer with no recursive DLQ binding;
- explicit batch size, max retries, retry delay, and visibility timeout;
- message retention of at least 24 hours;
- R2 notification rule ID with action exactly `CopyObject` and the exact canonical prefix.

Provisioning must read all values back from Cloudflare before uploads are enabled. The DLQ inspection consumer makes inspect, redacted export, replay, quarantine, acknowledgement, and operator receipt procedures executable; it never forwards poison messages recursively.

## 8. Cleanup rules

Pre-promotion validation failure deletes only the temporary upload key.

After CopyObject dispatch:

- absence alone cannot close ambiguous cleanup;
- active or consumed sessions cannot authorize canonical deletion;
- album deletion is blocked while a related promotion is `pending` or `cleanup_required`;
- a reclaim loser performs no R2 mutation;
- DeleteObject timeout remains retryable cleanup work;
- promotion and idempotency evidence is retained until terminal retention expires.

Warnings fire when unresolved promotion work is 15 minutes old. Critical alerts fire at one hour and include only server-generated IDs, counts, ages, and key hashes.

## 9. Cold production cutover

The cutover is serial and uses a bounded maintenance window:

1. Build, test, and record the immutable new image digest.
2. Provision and read back the production Queue, DLQ, source HTTP-pull consumer, DLQ inspection consumer, notification rule, and least-privilege secrets.
3. Disable new presign at ingress while the old backend finishes already-started confirms.
4. After one maximum confirm deadline, block confirm and abandon and stop every old API, cleanup job, deletion job, and scheduler.
5. Verify no old process or lease can mutate upload state.
6. Apply the additive migration.
7. Run one cutover command with API ingress disabled. It creates promotion bridge records for retained old sessions, consumes captured CopyObject events, treats an existing `Image.r2ObjectKey` reference as committed authority, and never deletes an unmatched destination.
8. Require active uploads, unresolved promotion work, Queue backlog, and DLQ depth to be zero. Require a healthy singleton lock and heartbeat.
9. Start only the new API and reconciler with presign disabled.
10. Verify configuration fingerprints, process roles, actual replica count, schema, routes, R2 operations, Queue/DLQ, event rule, and signed imgproxy variants.
11. Run representative production smoke uploads.
12. Enable presign and deploy/purge the new frontend so cached old request shapes are not accepted.

No old binary is started after migration.

## 10. Roll-forward incident handling

If a post-cutover failure occurs:

1. Disable presign on every API instance and block it at ingress.
2. Keep status, reconciliation, and safe cleanup available when their health is proven; otherwise stop the affected process role.
3. Capture sanitized session, promotion, Queue, DLQ, and heartbeat evidence.
4. Fix the new version and deploy a new immutable image.
5. Apply only forward-compatible migrations.
6. Run the same presign-disabled smoke gates.
7. Re-enable uploads only when active corruption risk is absent and Queue/DLQ disposition is complete.

Database backup remains mandatory for disaster recovery, but the operational upload rollback procedure never starts the prior application generation.

## 11. Staging qualification

Staging uses long-lived, explicitly non-production R2, Queue, DLQ, source HTTP consumer, DLQ inspection consumer, notification rule, and scoped credentials. Each run uses a unique object prefix and a disposable PostgreSQL database.

A single `test:staging:run` orchestrator owns provisioned run state and executes migration, backend suites, frontend suites, real CopyObject settlement, DLQ tests, imgproxy rendering, smoke uploads, and prefix cleanup in `try/finally`. CI adds an `always()` cleanup step as a second safety net.

The staging workflow is serialized with a CI concurrency group so shared Queue messages cannot be consumed by competing runs. Every event is matched to the current run prefix.

Required staging cases include:

- successful event before and after the image transaction;
- CopyObject response loss with later provider settlement;
- crash after the durable dispatch record but before the HTTP call, followed by create-only retry;
- destination create-only precondition and HTTP 412 recovery;
- stale lease recovery;
- consumed event acknowledgement without deletion;
- failed promotion cleanup;
- duplicate event delivery;
- malformed and unmatched events reaching DLQ;
- process restart between database commit and Queue acknowledgement;
- cancellation and confirm response loss;
- staging credentials and resource identities proven distinct from production.

## 12. Packaging and CI

The shared policy package emits and the Docker smoke checks the actual files:

- `dist/esm/index.js`;
- `dist/cjs/index.js`;
- `dist/index.d.ts`;
- `dist/cjs/package.json`.

Both production images test package resolution through public exports. The backend image also contains the compiled reconciler and cutover entrypoints.

GitHub ruleset verification lists rulesets, fetches the selected ruleset by ID, and validates the exact target ref, active enforcement, required contexts, and bypass actors. A branch-protection 404 is acceptable only after ruleset verification succeeds.

## 13. Canonical optimization policy

The initial wire-policy family is `web-v1` and uses these exact values:

| Property                                           |                                    Value |
| -------------------------------------------------- | ---------------------------------------: |
| Maximum source size accepted by the admin UI       |                                  100 MiB |
| Maximum source width or height before full decode  |                                16,384 px |
| Maximum source pixels before full decode           |                               80,000,000 |
| Maximum retained parser/preflight working buffer   |                                    8 MiB |
| Maximum browser working pixels per decoded surface |                                7,000,000 |
| Maximum simultaneous decoded browser surfaces      |                                        2 |
| Minimum supported Chromium major                   |                                      136 |
| Soft stored-size target                            |                          3,145,728 bytes |
| Maximum stored size                                |                          5,242,880 bytes |
| Maximum stored width or height                     |                                  2560 px |
| Maximum stored decoded pixels                      |                                7,000,000 |
| WebP encode quality                                |                                     0.84 |
| Normalized output color space                      |                                     sRGB |
| Allowed stored formats                             |                          JPEG, PNG, WebP |
| Allowed pages/frames                               |                                        1 |
| Metadata ruleset                                   |                        `web-metadata-v1` |
| Maximum decompressed ICC bytes                     |                                    1 MiB |
| Presigned PUT lifetime                             |                                   1 hour |
| Finalization lease                                 |                               10 minutes |
| Default R2 control/read timeout                    |                               30 seconds |
| Browser memory-delta gate                          | 512 MiB and <=50% of full-decode control |

The wire hash is SHA-256 over a schema/version prefix plus RFC 8785 canonical UTF-8 JSON. It includes every content/browser compatibility field and excludes process role, replica count, decode permits, R2 timeouts, Queue settings, presign enablement, and benchmark thresholds.

The 3 MiB soft target is informational and an optimization trigger, not a rejection threshold. Encoding is exactly one WebP call at quality 0.84; output above 5 MiB is rejected rather than repeatedly lowering quality.

## 14. Canonical stored-image grammar

All sources run bounded header preflight and complete `classify-source` parsing from byte zero through EOF before decode. All pass-through and normalized outputs run complete `validate-stored` parsing.

Both modes reject unsigned-integer overflow, truncation, illegal ordering, invalid cardinality, duplicate singleton records, invalid checksum/padding, animation, multiple pages, unknown unsafe records, and bytes after the format terminator.

### JPEG

- Require one SOI, one supported baseline/progressive frame, internally consistent components, legal tables/scans/restart markers, and one final EOI.
- APP0 is one valid JFIF payload; APP14 is one valid Adobe color payload.
- APP2 is allowed only as one complete consecutively numbered ICC sequence with no missing or duplicate segment.
- `classify-source` recognizes bounded COM, EXIF/APP1, APP13, and JFXX as `requiresNormalization`.
- `validate-stored` rejects those source-only records and every APP record outside the allowlist.

### PNG

- Require valid signature, exactly one IHDR first, legal PLTE/IDAT ordering for the declared color type, one contiguous IDAT run, and exactly one zero-length IEND last.
- Verify every chunk length and CRC and all color-type/bit-depth cross-constraints.
- Permit only legal bounded structural/color chunks such as `tRNS`, `sRGB`, `gAMA`, `cHRM`, and allowlisted `iCCP` in their defined positions.
- `classify-source` recognizes valid bounded EXIF/text/time/physical-pixel chunks as `requiresNormalization`; `validate-stored` rejects them.

### WebP

- Require a size-consistent RIFF/WEBP envelope, correct even-byte padding, and no trailing bytes.
- Simple files contain exactly one `VP8 ` or `VP8L`.
- Extended files contain `VP8X` first, at most one ICCP before image data, optional ALPH only immediately before one `VP8 `, and exactly one `VP8 ` or `VP8L`.
- Reject ALPH with VP8L, animation chunks/flags, duplicates, unknown chunks, bad padding, and canvas/frame dimension mismatch.
- `classify-source` recognizes bounded EXIF/XMP as `requiresNormalization`; `validate-stored` rejects them.

ICC payloads are decompressed with a 1 MiB output cap, structurally validated, hashed, and accepted only when the digest is in the sorted policy allowlist. The browser and backend consume the same grammar package and fixture corpus.

## 15. Browser optimizer and resource contract

The browser performs a startup capability probe before file selection. It fails closed when Chromium is below the policy major, `ImageDecoder` target-size decode is unavailable, orientation behavior is ambiguous, corner pixels/dimensions are wrong, WebP encoding reports the wrong MIME, or sRGB output cannot be proven.

Sources above 7 million pixels may decode only through a capability-qualified `ImageDecoder` target-size path. `createImageBitmap`, `<img>`, and other potentially full-resolution paths may decode only sources already within the working-pixel limit.

No source-sized object URL is attached to a preview element. Pending large sources show an icon; previews use only a bounded thumbnail or the compliant output.

The resource registry explicitly owns, transfers, and releases ImageBitmap, canvas, worker surface, thumbnail, preview element, output Blob, and object URL resources. At most two decoded/visible surfaces and two resident output Blobs exist per optimizer slot budget. Garbage collection is never treated as proof of release.

A JPEG, PNG, or WebP may pass through only when it is <=3 MiB, dimensions are <=2560x2560, it has one frame/page, no orientation container, and bytes already satisfy `web-metadata-v1`. All other accepted sources normalize once to sRGB WebP. GIF, SVG, animation, multiple pages, and unsafe formats are rejected with stable admin-facing codes.

## 16. Current-only upload API contract

The backend accepts only this presign request after cutover:

```ts
type UploadPresignRequest = {
    clientRequestId: string;
    albumId: string;
    filename: string;
    contentType: 'image/jpeg' | 'image/png' | 'image/webp';
    fileSize: number;
    processedSha256: string;
    policyVersion: string;
};
```

Missing current fields or a non-current policy returns the cross-cutting `policy_refresh_required` error before ledger/session/capacity/signing work. There is no legacy request translation.

```ts
type PublicImageResponse = {
    id: string;
    filename: string;
    width: number | null;
    height: number | null;
    altText: string | null;
    thumbnailUrl: string;
    smallUrl: string;
    mediumUrl: string;
    largeUrl: string;
    xlargeUrl: string;
    orderIndex: number;
};

type UploadResultDeletedResponse = {
    outcome: 'deleted';
    statusCode: 410;
    uploadId: string;
    code: 'upload_result_deleted';
    message: string;
    resultImageId: string | null;
    resultDeletedAt: string;
};

type UploadResultUnavailableResponse = {
    outcome: 'unavailable';
    statusCode: 410;
    uploadId: string;
    code: 'upload_result_unavailable';
    message: string;
    resultImageId: string | null;
    resultDeletedAt: string | null;
};

type PresignResponse =
    | {
          outcome: 'ready';
          statusCode: 200;
          uploadId: string;
          uploadUrl: string;
          expiresAt: string;
      }
    | {
          outcome: 'finalizing';
          statusCode: 409;
          uploadId: string;
          code: 'upload_finalizing';
          message: string;
          retryAfter: string;
      }
    | {
          outcome: 'consumed';
          statusCode: 200;
          uploadId: string;
          image: PublicImageResponse;
          resultImageId: string;
          resultDeletedAt: null;
          retentionExpiresAt: string;
      }
    | {
          outcome: 'failed';
          statusCode: 409;
          uploadId: string;
          code: 'upload_failed';
          message: string;
          failureCode: string;
      }
    | {
          outcome: 'gone';
          statusCode: 410;
          uploadId: string;
          code: 'upload_session_gone';
          message: string;
      }
    | UploadResultDeletedResponse
    | UploadResultUnavailableResponse;

type ConfirmResponse =
    | Extract<PresignResponse, { outcome: 'finalizing' | 'consumed' | 'failed' | 'gone' }>
    | UploadResultDeletedResponse
    | UploadResultUnavailableResponse
    | {
          outcome: 'retryable';
          statusCode: 503;
          uploadId: string;
          code: 'upload_inspection_retryable' | 'upload_storage_retryable';
          message: string;
          retryAfter: string;
      };

type UploadSessionStatusResponse =
    | {
          outcome: 'pending';
          statusCode: 200;
          uploadId: string;
          expiresAt: string;
      }
    | Extract<PresignResponse, { outcome: 'finalizing' | 'consumed' | 'failed' | 'gone' }>
    | UploadResultDeletedResponse
    | UploadResultUnavailableResponse;

type AbandonResponse =
    | {
          outcome: 'abandoned';
          statusCode: 200;
          uploadId: string;
          code: 'upload_abandoned';
          message: string;
      }
    | {
          outcome: 'finalizing';
          statusCode: 409;
          uploadId: string;
          code: 'upload_finalizing';
          message: string;
          retryAfter: string;
      }
    | {
          outcome: 'consumed';
          statusCode: 409;
          uploadId: string;
          code: 'upload_consumed';
          message: string;
      }
    | Extract<PresignResponse, { outcome: 'failed' | 'gone' }>
    | UploadResultDeletedResponse
    | UploadResultUnavailableResponse;

type UploadErrorResponse = {
    statusCode: number;
    code: string;
    message: string;
    retryAfter?: string;
};
```

Routes remain:

- `GET /images/upload-policy`;
- `POST /images/upload-url`;
- `POST /images/confirm-upload`;
- `GET /images/upload-sessions/:uploadId`;
- `POST /images/upload-sessions/:uploadId/abandon`.

All timestamps and `retryAfter` values are absolute RFC 3339 strings. The frontend switches on discriminants and stable codes, never message text. Status never returns a presigned URL, policy snapshot, object key, or credential.

## 17. Session, quota, and deadline semantics

Presign validates the exact current policy, positive stored size <=5 MiB, lowercase 64-hex digest, canonical MIME, normalized filename, UUID IDs, ownership, and album state before creating ledger/session/object keys.

One serializable transaction resolves `clientRequestId`, compares the canonical request fingerprint, enforces owner and rolling quota, counts completed images plus active upload reservations, and creates at most one session. An album can hold at most 50 completed plus active uploads.

Active means unexpired `pending` or any `finalizing`. Failed and consumed sessions do not reserve capacity. A stale finalizing lease must be reclaimed or terminalized before releasing its slot.

Confirm performs source HEAD before claim. A transient HEAD failure changes no state. The durable `pending→finalizing` claim occurs before acquiring the decode permit or GetObject. Post-claim mutations match upload ID, owner, status, source ETag, and lease token.

Operational saturation or a definite pre-promotion timeout releases resources and conditionally restores `pending`. Structural, digest, MIME, metadata, dimension, page/frame, or completed decode failure conditionally writes `failed`. Any uncertainty after the durable CopyObject dispatch remains `finalizing` for settlement.

Each `S3Client.send` receives an abort signal composed from the operation timeout and the earliest request/session/lease/job deadline. HEAD, GetObject/body, CopyObject, and DeleteObject cannot outlive their owner. Delete timeout never rolls back a committed image.

The initial deployment is one API process with two decode permits. Rollout verifies actual ready process count, not only environment values, and requires actual processes multiplied by per-process permits <=2.

Abandon changes only an owned `pending` session to `failed/abandoned`. It loses to a finalization claim. The frontend may cancel optimization, presign, and PUT; once verifying begins it does not abort confirm and instead follows status/finalization.

Consumed confirm/status is idempotent for the retained result window and returns the same safe image. Result deletion stamps `resultDeletedAt` before deleting `Image`; later status returns `upload_result_deleted`. Missing image without deletion evidence returns `upload_result_unavailable`.

## 18. Security and observability invariants

- All upload-policy/session routes require authenticated admin authorization.
- The R2 bucket is private. Public image delivery uses signed imgproxy URLs generated only from committed `Image` rows.
- Presigned PUT signs exact key, Content-Length, MIME, and one-hour expiry. Client claims are not content proof.
- API, reconciler, and cutover roles receive only their required secrets. The event-rule/operator token never enters API or reconciler runtime.
- Queue tokens, R2 credentials, presigned URLs, full object keys, client filenames, and full digests never enter logs, receipts, API errors, or telemetry.
- Logs use server-generated IDs, counts, ages, stable error codes, and truncated one-way key hashes.
- Public/admin serializers use explicit allowlists and never spread Prisma objects.
- JSON and URL-encoded request bodies are limited to 1 MiB; direct R2 PUT is unaffected.
- Album deletion is blocked while an active upload or promotion disposition `pending|cleanup_required` exists and rechecks inside the serializable deletion transaction.
- Warning alerts fire for unresolved promotion work at 15 minutes; critical age/bytes alerts fire at one hour.
- Dashboards expose active sessions, promotion states, dispatch attempts, Queue backlog/age, DLQ depth, singleton heartbeat, cleanup latency, browser capability failure, optimization ratio, and stable failure categories.

## 19. Canonical verification scope

Required automated coverage includes:

- deterministic policy hash and package ESM/CommonJS export resolution;
- JPEG/PNG/WebP conformance, terminal bytes, CRC/padding, metadata/ICC, deterministic fuzzing, and bounded-memory behavior;
- browser capability, orientation corner signatures, target-size decode, one encode, resource ownership, cancellation, response loss, and three-context memory benchmark;
- current-only request validation, owner isolation, idempotent presign/confirm/status/abandon, quota and 49/50 admission races;
- tokenized lease contention, stale reclaim, digest/source-ETag mismatch, CopyObject response loss, event before/after commit, create-only retry, and HTTP 412;
- committed-event ACK without deletion, cleanup authority, duplicate event, ack-after-commit restart, malformed/unmatched DLQ, and final absent HEAD;
- empty/upgrade migration, one-shot cutover bridge, role-secret isolation, Docker runtime artifacts, exact Queue consumers/rule readback, ruleset-by-ID verification, real staging R2/Queue/imgproxy, cold cutover, and roll-forward drill.

Every stage runs focused tests, relevant full suites/builds, and `git diff --check`. Provider tests use explicitly non-production resources and fail when credentials or identities can match production.

## 20. Normative document authority

This file is the sole design contract for the feature. It defines required behavior, invariants, failure semantics, and acceptance criteria.

Implementation must execute `docs/superpowers/plans/2026-07-19-admin-web-image-optimization-roll-forward/README.md` in numeric order from Stage 01 through Stage 09. The plan defines file-level work, TDD steps, commands, stage gates, and commit boundaries.

If plan wording conflicts with this spec, stop and reconcile the documents before implementing. Do not infer legacy compatibility, old/new parallel execution, or rollback-to-old behavior from repository history.

## 21. Acceptance criteria

The design is complete when:

- no runtime or cutover step starts old and new upload generations together;
- the API rejects legacy request shapes after the cutover;
- every CopyObject dispatch has a durable `dispatched` promotion record before provider mutation;
- routine committed events acknowledge without deleting canonical images;
- ambiguous CopyObject outcomes recover through Queue settlement;
- canonical deletion requires explicit cleanup authority and exact provider identity;
- both HTTP-pull consumers and the source-to-DLQ configuration are read back exactly;
- staging exercises real R2 CopyObject and Queue behavior;
- Docker smoke tests use real build artifacts;
- production cutover and incident recovery are roll-forward only.
