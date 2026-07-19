# Admin Web Image Optimization Roll-Forward Design

**Date:** 2026-07-19

**Status:** Approved architecture; supersedes the old/new blue-green, prior-binary compatibility, and rollback-to-old sections of `2026-07-16-admin-web-image-optimization-design.md`.

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
6. In a committed database transaction, the backend creates or reuses the promotion record in `prepared` state.
7. The backend changes the promotion to `dispatched`, then sends CopyObject with exact source ETag and replacement canonical metadata.
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
- provider destination ETag.

Provider state is independent from object disposition:

- `copyState`: `prepared | dispatched | provider_settled`;
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

If the lease is stale, provider settlement exists, and the destination HEAD matches the event ETag and stored digest, the reconciler claims a new token and completes the same serializable image transaction.

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
- HTTP-pull consumer ID;
- consumer type `http_pull`;
- configured DLQ name;
- explicit batch size, max retries, retry delay, and visibility timeout;
- message retention of at least 24 hours;
- R2 notification rule ID with action exactly `CopyObject` and the exact canonical prefix.

Provisioning must read all values back from Cloudflare before uploads are enabled. The DLQ runbook defines inspect, redacted export, replay, quarantine, acknowledgement, and operator receipt procedures.

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
2. Provision and read back the production Queue, DLQ, HTTP-pull consumer, notification rule, and least-privilege secrets.
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

Staging uses long-lived, explicitly non-production R2, Queue, DLQ, HTTP consumer, notification rule, and scoped credentials. Each run uses a unique object prefix and a disposable PostgreSQL database.

A single `test:staging:run` orchestrator owns provisioned run state and executes migration, backend suites, frontend suites, real CopyObject settlement, DLQ tests, imgproxy rendering, smoke uploads, and prefix cleanup in `try/finally`. CI adds an `always()` cleanup step as a second safety net.

The staging workflow is serialized with a CI concurrency group so shared Queue messages cannot be consumed by competing runs. Every event is matched to the current run prefix.

Required staging cases include:

- successful event before and after the image transaction;
- CopyObject response loss with later provider settlement;
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

## 13. Acceptance criteria

The design is complete when:

- no runtime or cutover step starts old and new upload generations together;
- the API rejects legacy request shapes after the cutover;
- every CopyObject dispatch has a durable promotion record before provider mutation;
- routine committed events acknowledge without deleting canonical images;
- ambiguous CopyObject outcomes recover through Queue settlement;
- canonical deletion requires explicit cleanup authority and exact provider identity;
- the HTTP-pull consumer and DLQ configuration are read back exactly;
- staging exercises real R2 CopyObject and Queue behavior;
- Docker smoke tests use real build artifacts;
- production cutover and incident recovery are roll-forward only.
