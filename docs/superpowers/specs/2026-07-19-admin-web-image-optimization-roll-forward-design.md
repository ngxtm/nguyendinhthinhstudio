# Admin Web Image Optimization Roll-Forward Design

**Date:** 2026-07-19

**Status:** Canonical approved design for the current-only, cold-cutover, roll-forward implementation.

## 1. Decision

The image upload system keeps the reliability controls around temporary uploads, bounded validation, conditional R2 CopyObject promotion, durable idempotency, PostgreSQL-scheduled R2 polling, and cleanup reconciliation. It runs on Cloudflare's free-compatible R2 data plane and does not depend on Workers Paid R2 Event Notifications, Cloudflare Queues, or a generic outbox table.

Production deployment uses a maintenance-window cold cutover. The old upload generation is stopped before the new generation starts. Recovery is roll-forward only: uploads remain disabled while a corrected new build is deployed.

## 2. Scope

The new version provides:

- browser-side bounded image optimization;
- one current `web-v1` upload request shape;
- temporary R2 uploads under `uploads/`;
- backend byte, digest, metadata, dimension, and full-decode validation;
- conditional CopyObject promotion to `albums/`;
- one durable promotion record for every dispatched COPY;
- response-first settlement with durable R2 HEAD polling after ambiguous CopyObject outcomes;
- idempotent confirm/status/retry behavior;
- scheduled cleanup and reconciliation;
- cold-cutover and roll-forward runbooks;
- real staging qualification against non-production R2 resources.

The design does not provide:

- simultaneous old and new upload writers;
- blue-green upload state-machine generations;
- runtime acceptance of `legacy-v0` requests;
- `IMAGE_UPLOAD_ALLOW_LEGACY_POLICY`;
- prior Prisma-client compatibility for application runtime; the one-shot pre-migration audit is narrowly required to use an explicit legacy-schema projection;
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
- never receives reconciliation-only R2 credentials.

### Reconciler process

- runs as one logical singleton using a dedicated PostgreSQL connection that owns the session advisory lock;
- stops all mutation work immediately if the lock connection is lost;
- publishes a database heartbeat with owner and build fingerprints;
- resumes stale finalization and create-only CopyObject dispatch from durable inspected facts;
- runs five bounded loops for pending-session expiry CAS, promotion reconciliation, expired temporary-session cleanup, applicable R2 `ImageObjectDeletion`, and rate-limit event cleanup; the pending-expiry and rate-limit loops have no API/cron owner outside this singleton;
- deletes canonical objects only through explicit promotion-cleanup or user-deletion authority;
- receives a separate bucket-scoped R2 Object Read & Write credential because recovery requires HEAD, COPY, and DELETE;
- never receives the API presigning credential.

`IMAGE_UPLOAD_PROCESS_ROLE=api|reconciler|cutover` is strict. Each entrypoint validates only its own required configuration and rejects secrets belonging to another role. `IMAGE_UPLOAD_OPERATOR_TOKEN` is cutover-only. `NDT_STAGING_OPERATOR_TOKEN` maps only to the cutover child, while `NDT_STAGING_CF_READ_TOKEN` is consumed only by the staging preflight and stripped before any runtime child starts. The promotion-conflict CLI runs only as `IMAGE_UPLOAD_PROCESS_ROLE=cutover`, receives `IMAGE_UPLOAD_OPERATOR_TOKEN` and cutover-only R2 credentials, never boots HTTP routes, and is unavailable to API/reconciler containers.

## 4. Upload flow

1. The authenticated admin sends a current `web-v1` presign request with a UUID `clientRequestId`, processed SHA-256, canonical MIME, expected size, filename, and album ID.
2. The backend creates or reuses an idempotency record and one `ImageUpload` session. The first attempt fixes one absolute `presignExpiresAt`; every same-fingerprint retry signs only for the remaining interval to that instant and never extends it. An expired retry terminalizes as `upload_expired` and returns no URL.
3. The browser PUTs the optimized image to `uploads/{uploadId}/{safeFilename}`.
4. Confirm HEADs that exact object, enforces the declared byte limit, and canonicalizes the source ETag without reading the body. A transient HEAD failure changes no state.
5. The request claims a tokenized finalization lease. Only the lease winner may acquire an inspection permit, issue GetObject, validate, decode, or dispatch COPY.
6. The lease owner acquires the inspection permit before issuing GetObject with `IfMatch` set to the quoted HEAD ETag. It reads at most 5,242,881 bytes, computes the digest, validates the complete stored-image grammar, completes the bounded Sharp decode, and releases every body, timer, listener, buffer, and permit in `finally`.
7. In a committed database transaction, the backend creates or reuses the promotion record directly in `dispatched` state and persists the inspected digest, byte size, MIME, dimensions, policy version, canonical source ETag, destination, lease identity, `copyDispatchedAt=now`, `lastDispatchAttemptAt=now`, and `nextReconcileAt=now+30 seconds`. Here `dispatched` means provider mutation is authorized and may already have happened, so recovery always treats it as outcome-ambiguous. `ImageUploadPromotion` is the specialized durable work queue; no second generic outbox row is created.
8. Only after that transaction commits does the backend send CopyObject with the HTTP-quoted source ETag, replacement canonical metadata from the durable promotion record, and R2 destination condition `cf-copy-destination-if-none-match: *`. The condition is staging-qualified and fail-closed so repeated recovery dispatches cannot overwrite or create more than one canonical winner.
9. A successful CopyObject response with a present valid canonical destination ETag is first normalized and durably recorded as `copyResponseObservedAt` plus `copyResponseEtag`. In the same serializable transaction, the lease owner creates `Image`, increments the album count, marks the upload `consumed`, sets the promotion disposition to `committed`, and changes `copyState` to `provider_settled`. This exact response is sufficient provider-settlement evidence.
10. Every terminal upload enters durable temporary cleanup. Immediate best-effort DeleteObject is allowed, but `temporaryCleanupState=verified_deleted` is written only after `presignExpiresAt` plus the configured clock skew and a final absent HEAD. Delete timeout schedules bounded retry work and never rolls back a committed image.
11. Confirm or status retries return the retained terminal result and never create another image.

## 5. Durable data model

### `ImageUpload`

Stores the live session and ownership state:

- `pending`;
- `finalizing` with lease token and lease start;
- `consumed` with result image ID;
- `failed` with a stable failure category.

Every new session has `createdByAdminId`, `clientRequestId`, the current `web-v1-<hash>` policy version, processed digest, upload key, final key, canonical source ETag when known, one immutable `presignExpiresAt`, an `expiresAt` equal to it, result tombstone fields, and durable temporary-cleanup state/attempt/schedule/evidence. The signer uses an injected signing instant and remaining whole seconds so the effective `X-Amz-Date + X-Amz-Expires` never exceeds the persisted absolute expiry. Legacy rows remain valid because all newly added session evidence is nullable or has a compatible default.

### `ImageUploadIdempotency`

Stores one permanent compact outcome per `clientRequestId`. It prevents duplicate sessions and duplicate images after request or response loss. Terminal outcomes store `terminalAt` and `resultRetentionExpiresAt`; the full safe result is replayable for exactly 30 days, after which retries return `gone` without creating another session. The compact fingerprint, owner, upload ID, terminal outcome, result/deletion tombstone, and object-deletion evidence are not automatically pruned by this plan.

### `ImageUploadPromotion`

One row exists per upload promotion before R2 receives CopyObject.

Identity and matching fields:

- promotion ID, upload ID, and origin `current | legacy_bridge`;
- finalization lease token; current rows use the claim token, while every `legacy_bridge` deterministically uses UUIDv5 namespace `16e0d6a7-6c39-5dc9-bc41-24f847e2f36a` over `receiptSha256 + ":" + uploadId`;
- account ID and bucket;
- source object key and canonical unquoted source ETag; `sourceEtag` may be null only for a committed `legacy_bridge` whose exact existing Image plus matching destination evidence prove keep authority;
- destination object key;
- immutable inspected digest, byte size, canonical MIME, width, height, and policy version for current-generation dispatches;
- committed result image ID when committed;
- successful CopyObject response evidence `copyResponseObservedAt` and canonical unquoted `copyResponseEtag`, when the synchronous response is observed;
- destination HEAD verification time and canonical unquoted destination ETag when the reconciler proves settlement after an ambiguous response;
- dispatch attempt count, dispatch time, and next reconciliation time;
- for a proven source-precondition rejection: rejection time, reason `source_missing | source_etag_mismatch`, canonical observed source ETag when present, and the two destination-absence observation times.

Provider state is independent from object disposition:

- `copyState`: `dispatched | provider_settled | dispatch_rejected`;
- `disposition`: `pending | committed | cleanup_required | verified_deleted | not_created`.

This separation prevents the false assumption that a completed COPY implies that its destination should be deleted. `dispatch_rejected + not_created` is the only terminal no-destination pair and never authorizes canonical DeleteObject.

Constraints:

- upload ID and destination key are unique;
- `provider_settled` requires one complete, internally consistent evidence branch: exact CopyObject response (`copyResponseObservedAt` plus `copyResponseEtag`) or exact R2 destination HEAD verification (`destinationHeadObservedAt` plus `destinationHeadEtag` and matching promotion metadata);
- response and destination-HEAD ETags must match whenever both branches are present;
- every `current` promotion has all immutable inspected facts before provider mutation;
- `committed` requires a committed result image ID and initially an `Image` that references the destination key;
- after a legitimate result deletion, `committed` remains immutable historical promotion authority and is valid only when the idempotency tombstone has `resultDeletedAt` plus a matching durable `ImageObjectDeletion` record;
- `cleanup_required` is only for a failed/expired/abandoned promotion that never committed and has no `Image` reference;
- `verified_deleted` requires matching provider settlement, a successful or safely retried DeleteObject, and a final absent HEAD;
- `dispatch_rejected` is valid only with `not_created`, no provider response or destination-HEAD settlement evidence, no `Image` reference, two absent destination HEADs separated by at least 30 seconds, and source missing or canonically different from the persisted source ETag;
- a source-mismatch rejection stores the observed canonical source ETag, while a source-missing rejection stores null; neither branch performs canonical DeleteObject;
- compact user-deletion and promotion evidence is retained together so a later polling observation can never reinterpret a deleted committed result as failed-promotion cleanup.

All persisted ETags use one canonical unquoted opaque representation. R2 HEAD and CopyObject response values are normalized by stripping exactly one valid surrounding quote pair without case folding. Weak, empty, control-character, or malformed quoted ETags are rejected. Conditional HTTP headers render the canonical value with quotes.

### `ImageUploadReconcilerHeartbeat`

Stores the singleton owner ID, immutable build fingerprint, lock-acquired time, last heartbeat time, and five last-completed loop times: `pendingSessionExpiryCompletedAt`, `promotionRecoveryCompletedAt`, `temporaryCleanupCompletedAt`, `imageDeletionCompletedAt`, and `rateLimitCleanupCompletedAt`. The reconciler updates it through the same dedicated PostgreSQL connection that owns the session advisory lock. Loss of that connection aborts all in-flight loop controllers before the process reconnects or exits. A healthy heartbeat is newer than two one-minute loop cadences and corresponds to exactly one advisory-lock owner.

## 6. Polling settlement state matrix

The reconciler is the source of truth for ambiguous CopyObject outcomes. Every promotion is written with `nextReconcileAt = copyDispatchedAt + 30 seconds`; a bounded scan selects due `copyState=dispatched` rows. The first recovery HEAD is therefore delayed by 30 seconds, allowing a successful R2 copy to become visible while keeping normal response-based confirmation immediate.

The destination HEAD must match all durable promotion identity fields that were written as replacement metadata on CopyObject: canonical destination ETag, byte size, canonical MIME, promotion ID, inspected SHA-256, width, height, and policy version. An exact match is durable provider-settlement evidence and is recorded as `destinationHeadObservedAt` plus `destinationHeadEtag`. Object existence alone is never sufficient.

### Active lease

If the promotion is still owned by an active finalization lease, the reconciler may record an exact destination-HEAD settlement but does not finalize or delete. The request owner keeps mutation authority.

### Stale lease or response loss

If the lease is stale and an exact CopyObject response or destination HEAD exists, the reconciler claims a new token and completes the same serializable image transaction. If settlement is absent after the 30-second grace period, it HEADs the destination. An exact object settles immediately; an absent destination permits one bounded retry of the same create-only conditional CopyObject using only persisted inspected facts. Recovery scans every unresolved `copyState=dispatched` row regardless of disposition, including `committed`, so a response-lost or response-persist-failed path cannot remain outside reconciliation.

HTTP 412 alone never proves which precondition failed and never authorizes deletion. After 412, the reconciler HEADs destination and source. An exact destination settles; a mismatched destination opens a durable promotion conflict and performs no overwrite or deletion. If destination is absent but source still matches, the row remains `dispatched` and retries only under the normal bounded schedule. It may transition atomically to `dispatch_rejected + not_created` only after a second absent destination HEAD separated by at least 30 seconds and a missing or canonically different source ETag. That terminal transition marks the upload failed with stable code `upload_dispatch_rejected`, releases its album reservation, and permits best-effort deletion of only the temporary source key.

### Committed upload

If the promotion is `committed`, or an `Image` already references the destination key, the reconciler never uses failed-promotion cleanup to delete the canonical object. A committed result that was later deleted remains `committed`; only its matching `ImageObjectDeletion` record authorizes user-requested object deletion. An existing legacy `Image` with no upload promotion is deleted through a separate `legacy_image` deletion authority that snapshots the exact image ID/provider/object-key hash and does not require a fabricated upload idempotency result. `ImageObjectDeletion.authority` is closed as `current_result | legacy_image | non_r2_deferred`, and `providerDisposition` is closed as `legacy_deferred | not_applicable` when present; only the first two authorities authorize R2 HEAD/DELETE. The R2 deletion loop processes both current committed-result tombstones and this explicit legacy-image authority; existing `provider='cloudflare_legacy', status='deferred'` rows are migrated to `non_r2_deferred` with a provider disposition and are not counted as unresolved R2 work.

### Cleanup-authorized upload

If the promotion is `cleanup_required`, no `Image` references the destination, and exact response-or-HEAD settlement plus identity match, the reconciler deletes the destination, verifies it absent, and changes the disposition to `verified_deleted`.

### Promotion conflict

A destination HEAD that exists but fails exact metadata/ETag matching never authorizes overwrite or deletion. The reconciler creates or reuses an append-only `ImageUploadPromotionConflict` containing server IDs, account/bucket, hashed source/destination identities, both complete HEAD observations, the immutable mismatch reason, a canonical evidence hash, state `open`, and resolution evidence. The operator resolves it through the authenticated cutover CLI using exactly one disposition:

- `confirmed_absent`: an independent final HEAD proves the destination absent; retain the failed promotion and close the conflict;
- `cleanup_authorized`: the destination is proven to belong to this promotion and no `Image` authority exists; delete it, verify absent, and close;
- `committed_authorized`: an exact live `Image`/result authority exists; preserve the mismatch snapshot, repair the promotion to committed authority, and close.

An open promotion conflict blocks staging, production enablement, and incident recovery. Every resolution stores operator identity fingerprint, approval digest, resolution time, provider observations, and a canonical resolution hash. No provider-event quarantine, Queue ACK, replay path, or DLQ path exists in this design.

## 7. R2 polling contract

Production and staging each have a private R2 bucket, separate API/reconciler/cutover/imgproxy credentials, exact CORS policy, and a reconciler process with one advisory-lock owner. There is no R2 Event Notification rule, Queue, DLQ, consumer, or provider event token. The preflight reads back bucket, CORS, credential identity, and object-operation behavior only.

The reconciler scans due promotions at a bounded cadence. A promotion first becomes eligible at `copyDispatchedAt + 30 seconds`; the configured scan cadence is five seconds, so the normal first polling observation occurs within 30–35 seconds. The scan is idempotent and uses only persisted promotion facts. A successful response is still settled immediately; polling is the recovery path for response loss, process restart, timeout, or crash before response persistence.

## 8. Cleanup rules

Pre-promotion validation failure deletes only the temporary upload key.

After CopyObject dispatch:

- absence alone cannot close ambiguous cleanup;
- active or consumed sessions cannot authorize failed-promotion canonical deletion;
- a legitimate committed result deletion is authorized only by a result tombstone plus `ImageObjectDeletion`, never by `cleanup_required`;
- album deletion enters `deleting` but remains blocked while a related promotion is `pending` or `cleanup_required`; terminal `not_created` does not block it. Once the serializable cleanup gate passes, deletion completes as a soft-delete `deleteStatus='deleted'`; the `Album` row, all `ImageUpload` rows, permanent `ImageUploadIdempotency` records, promotion evidence, and object-deletion tombstones remain durable. No hard-delete or evidence pruning is performed by this plan.
- `dispatch_rejected + not_created` authorizes best-effort temporary-key cleanup only and never canonical DeleteObject;
- a reclaim loser performs no R2 mutation;
- every terminal session (`consumed`, failed validation, expired, abandoned, dispatch rejected, or cutover aborted) atomically enters `temporaryCleanupState=pending`; consumed sessions are never excluded;
- DeleteObject timeout increments `temporaryCleanupAttempts`, records a redacted category, and schedules `temporaryCleanupNextAttemptAt` using bounded backoff;
- final `verified_deleted` requires `now >= presignExpiresAt + clockSkew` and a final absent HEAD, so a late valid PUT cannot recreate the source after cleanup closes;
- the idempotent temporary-cleanup loop scans every due unverified terminal session, including consumed sessions, and durable image-object deletions are processed by a separate bounded loop;
- compact promotion, idempotency, and object-deletion evidence is retained together without an automatic retention deadline in this plan.

Warnings fire when unresolved promotion work is 15 minutes old. Critical alerts fire at one hour and include only server-generated IDs, counts, ages, and key hashes.

## 9. Cold production cutover

The cutover is serial and uses a bounded maintenance window:

1. Build, test, and record the immutable new image digest.
2. Optionally create an early encrypted preparation backup for rehearsal evidence; it is not the migration backup and cannot authorize audit, migration, or apply.
3. Provision and read back the production R2 buckets, exact R2 CORS policy, and role-separated secrets.
4. Disable new presign at ingress while the old backend finishes already-started confirms. Because the legacy schema predates `presignExpiresAt`, derive the drain deadline from the existing legacy `expiresAt` only when tests prove it equals the signed PUT expiry; otherwise conservatively use `presignDisabledAt + maximum legacy PUT lifetime`. Record the later deadline.
5. Keep the old HTTP `confirm`, `status`, and `abandon` routes available during the bounded drain while scheduled mutation jobs are stopped. Wait until that recorded outstanding-PUT deadline plus configured clock skew has passed and every active confirm/R2 operation/finalization lease has settled; the one-hour signed PUT lifetime, not merely the 10-minute lease, bounds this wait.
6. Block confirm and abandon; status may remain read-only until API shutdown. Stop every old API, cleanup job, deletion job, and scheduler. Verify process inventory, database activity, lease non-renewal, and R2 canaries prove no old process, valid outstanding presigned PUT, or lease can mutate database or R2 state.
7. Now create the mandatory encrypted full logical migration backup of the quiesced legacy database, restore it into a disposable PostgreSQL instance, verify existing `Image`/`ImageUpload` counts and digests, and record the ciphertext digest plus restore receipt. The audit/migration receipt must reference this quiesced backup digest; an earlier backup is insufficient. Do not require future tables.
8. Immediately before migration, run the cutover entrypoint in audit mode with explicit absolute quiesced-backup receipt/approval input paths and classify retained old rows through an explicit legacy-schema projection that never references a future column or table. Audit is database- and R2-object-read-only. A row with no source ETag, no finalization or consumption evidence, no destination object, and no `Image` reference is classified as proven pre-dispatch in the receipt, but is not terminalized or deleted yet. An existing `Image.r2ObjectKey` is committed keep authority. A row with a source ETag, finalization or consumption evidence, or destination object but no Image is legacy-ambiguous. An authenticated `disposition` command writes one separately protected, signed row-level decision file (`committed_authorized | cleanup_authorized`) with exact evidence hashes; an audit rerun consumes explicit disposition paths and reduces ambiguity only while evidence still matches. Without this file the row blocks migration.
9. Apply the additive migration only after the pre-migration legacy-ambiguous gate is zero and the verified audit still references the quiesced backup receipt/digest.
10. With API ingress disabled, run the same cutover entrypoint in apply mode against the verified receipt. It re-reads evidence against the migrated schema; backfills every retained legacy terminal row's `presignExpiresAt` to the recorded conservative outstanding-PUT deadline and enters durable temporary cleanup. For each still-proven pre-dispatch row it atomically writes `failed/upload_cutover_aborted` and creates no promotion. After bridge/classification transactions, it runs bounded idempotent cleanup for every retained terminal temporary source and requires a final absent HEAD. Any remaining retained legacy terminal temporary source increments `legacyTerminalTempPresentCount`, keeps apply nonzero, and leaves maintenance active. On rerun, apply accepts only the exact receipt-derived `failed/upload_cutover_aborted` state it previously committed, resumes cleanup, and treats every other evidence change as receipt drift. It creates `legacy_bridge` promotion records only when exact persisted dispatch and destination HEAD/response evidence exists, using the deterministic UUIDv5 lease token, and creates compact internal idempotency evidence for committed bridges so later user deletion can retain its tombstone. It preserves existing Image references without inventing a promotion when dispatch evidence is absent and never treats an unmatched destination as committed.
11. Create and restore-verify a separate encrypted post-bridge full database backup that proves the new tables, constraints, bridge rows, deterministic lease tokens, and migration history.
12. Require active uploads, unterminalized expired pending uploads, unresolved promotion work, invalid provider settlement, incomplete promotion-conflict evidence, unverified/due temporary cleanup, open promotion conflicts, legacy terminal temporary sources (with the pre-dispatch subset reported separately), invalid committed/rejected/legacy deletion authority, applicable R2 image-deletion work, invalid non-R2 dispositions, authoritative-backup binding mismatches, invalid row dispositions, and production CORS mismatches to be zero twice, separated by one 30-second polling barrier.
13. Start only the new API and reconciler with presign disabled.
14. Verify configuration fingerprints, the dedicated singleton lock/heartbeat, actual replica count, schema, routes, read-only R2 access, promotion polling cadence, exact production CORS readback, and signed imgproxy read paths.
15. Deploy and purge the new frontend while general upload ingress remains blocked.
16. Enable presign while ingress allowlists only the authenticated operator smoke path, then run representative browser uploads, fixed-absolute-expiry response-loss retries, real allowed/disallowed cross-origin PUTs, and mutating R2 polling/imgproxy acceptance.
17. Open general upload ingress only after every acceptance and cleanup gate passes.

No old binary is started after migration.

## 10. Roll-forward incident handling

If a post-cutover failure occurs:

1. Disable presign on every API instance and block it at ingress.
2. Keep status, reconciliation, and safe cleanup available when their health is proven; otherwise stop the affected process role.
3. Capture sanitized session, promotion, polling, conflict, and heartbeat evidence.
4. Fix the new version and deploy a new immutable image.
5. Apply only forward-compatible migrations.
6. Run the same presign-disabled read-only gates, then enable presign behind operator-only ingress and run the full mutating acceptance suite.
7. Open general upload ingress only when active corruption risk is absent and polling/conflict/object-deletion disposition is complete.

Database backup remains mandatory for disaster recovery, but the operational upload rollback procedure never starts the prior application generation.

## 11. Staging qualification

Staging uses long-lived, explicitly non-production R2 and scoped credentials. Each run uses one UUID namespace under both canonical roots, exactly `uploads/staging/{runId}/` for temporary objects and `albums/staging/{runId}/` for canonical objects, plus a disposable PostgreSQL database. No provider event rule or Queue resource is required.

A single `test:staging:run` orchestrator owns provisioned run state and executes migration, backend suites, frontend suites, real CopyObject settlement, response-loss polling recovery, promotion-conflict tests, imgproxy rendering, smoke uploads, and cleanup of both exact run-scoped prefixes in `try/finally`. CI adds an `always()` cleanup step as a second safety net.

The live staging job is invoked explicitly through a protected staging environment, is serialized with a CI concurrency group so shared R2 staging prefixes cannot be mutated by competing runs, and always executes the idempotent cleanup fallback. It is separate from the five required pull-request checks. Every object mutation is matched to the current run namespace under the canonical source and destination prefixes.

Required staging cases include:

- successful CopyObject response before and after the image transaction;
- CopyObject response loss with later destination-HEAD settlement;
- crash after the durable dispatch record but before the HTTP call, followed by create-only retry from persisted inspected facts;
- destination-condition 412 recovery and source-condition 412 terminalization only after two absent destination HEADs separated by 30 seconds, no Image, and missing or mismatched source evidence;
- quoted HEAD ETag versus unquoted CopyObject-response ETag normalization;
- stale lease recovery;
- consumed promotion polling without failed-promotion deletion;
- legitimate committed-result deletion through `ImageObjectDeletion`;
- failed promotion cleanup;
- duplicate polling observations in active, committed, and cleanup-required states;
- destination metadata/ETag mismatch creating durable promotion-conflict evidence and refusing overwrite or deletion;
- process restart between database commit and polling observation;
- cancellation and confirm response loss;
- staging credentials and resource identities proven distinct from production using explicit non-secret production identities, plus an existing dedicated non-production deny-canary bucket that safely proves each staging credential is rejected outside its allowed bucket/environment without probing production.

## 12. Packaging and CI

The shared policy package emits and the Docker smoke checks the actual files:

- `dist/esm/index.js`;
- `dist/cjs/index.js`;
- `dist/index.d.ts`;
- `dist/cjs/package.json`.

Both production images test package resolution through public exports. The backend image also contains the compiled reconciler and cutover entrypoints.

GitHub ruleset verification lists rulesets, fetches the selected ruleset by ID, and validates the exact target ref, active enforcement, required contexts, and bypass actors. Required contexts and effective workflow job names are `backend-image-upload`, `image-upload-packaging`, `frontend-playwright-chromium`, `frontend-stable-chrome`, and `frontend-image-memory`. A branch-protection 404 is acceptable only after ruleset verification succeeds. Backend image-upload coverage is exposed through closed package scripts for the explicit unit and integration path lists, with one aggregate CI script; a bare generic Jest invocation is not sufficient evidence. The memory job generates a deterministic non-sensitive large-image fixture in CI; the local professional photo is optional visual-quality evidence only.

The memory fixture is an 8192×8192 RGB JPEG generated with xorshift32 seed `0x4e445431`, the exact pixel formula and Sharp options defined in Stage 08, and expected SHA-256 `1ac11dd1c64d39e79bdd3682bb11871ee2619b07a86fb923ba8412ab6dc3d581` with Sharp 0.35.3. The benchmark serves COOP/COEP headers and uses `performance.measureUserAgentSpecificMemory()` in three separate paired browser processes. Each optimized/control process measures baseline, holds its defined steady-state resources, invokes CDP `HeapProfiler.collectGarbage`, waits two animation frames plus 250 ms, and measures again. Missing/rejected/non-finite metrics, a post-measurement below baseline, fixture byte/digest drift, or reuse of a browser process fails closed.

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

The wire hash is SHA-256 over UTF-8 `NDT_IMAGE_UPLOAD_POLICY`, one NUL byte, UTF-8 `web-v1`, one NUL byte, then the RFC 8785 canonical UTF-8 JSON with no trailing newline. The initial digest is `18da64f64a7d4a645b549c56ebc5dce84ed830f69defdf8b6d7f2b8d9659baef`, so the exact initial version is `web-v1-18da64f64a7d4a645b549c56ebc5dce84ed830f69defdf8b6d7f2b8d9659baef`. The canonical `ImageUploadPolicy` object contains exactly `minimumChromiumMajor`, `softTargetBytes`, `maxStoredBytes`, `maxSourceBytes`, `maxSourceDimension`, `maxSourcePixels`, `preflightWorkingBytes`, `maxDecodedPixels`, `maxConcurrentDecodedSurfaces`, `maxWidth`, `maxHeight`, `webpQuality`, `normalizedColorSpace`, `allowedStoredMimes`, `maxPagesOrFrames`, `metadataRulesetVersion`, `maxDecompressedIccBytes`, and sorted/deduplicated `allowedIccSha256` (initially empty). It excludes process role, replica count, decode permits, presigned PUT lifetime, finalization lease, R2 timeouts, polling settings, presign enablement, and benchmark thresholds.

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
// Imported type-only from @ndt/image-upload-policy.
type UploadFailureCode =
    | StoredImageErrorCode
    | 'upload_abandoned'
    | 'upload_expired'
    | 'upload_presign_failed'
    | 'upload_digest_mismatch'
    | 'upload_source_changed'
    | 'upload_decode_failed'
    | 'upload_dispatch_rejected'
    | 'upload_cutover_aborted';

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
          failureCode: UploadFailureCode;
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

type UploadErrorResponse =
    | {
          statusCode: 400;
          code: 'upload_invalid_request';
          message: string;
      }
    | {
          statusCode: 401;
          code: 'upload_authentication_required';
          message: string;
      }
    | {
          statusCode: 403;
          code: 'upload_admin_required';
          message: string;
      }
    | {
          statusCode: 404;
          code: 'upload_not_found';
          message: string;
      }
    | {
          statusCode: 409;
          code: 'upload_request_conflict';
          message: string;
      }
    | {
          statusCode: 409;
          code: 'policy_refresh_required' | 'upload_capacity_exceeded' | 'album_cleanup_pending';
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

Routes remain:

- `GET /images/upload-policy`;
- `POST /images/upload-url`;
- `POST /images/confirm-upload`;
- `GET /images/upload-sessions/:uploadId`;
- `POST /images/upload-sessions/:uploadId/abandon`.

All timestamps and `retryAfter` values are absolute RFC 3339 strings. For `finalizing`, `retryAfter` is the earliest instant at which status should be polled again; reaching it does not itself prove lease ownership or authorize a client-side state transition. The frontend polls status at that instant and calls confirm again only after status returns `pending`. The frontend switches on discriminants and stable codes, never message text. Status never returns a presigned URL, policy snapshot, object key, or credential.

## 17. Session, admission, retention, and deadline semantics

Presign validates the exact current policy, positive stored size <=5 MiB, lowercase 64-hex digest, canonical MIME, normalized filename, UUID IDs, ownership, and album state before creating ledger/session/object keys.

One serializable transaction resolves `clientRequestId`, compares the canonical request fingerprint, enforces owner isolation, counts completed images plus active upload reservations, and creates at most one session. An album can hold at most 50 completed plus active uploads. This admin-only design does not add a daily byte/count quota or a separate per-admin active-session quota.

After that transaction commits, signer failure conditionally CASes only the still-`pending` session owned by the same admin to `failed/upload_presign_failed`, enters durable temporary cleanup, atomically stores the idempotency `terminalOutcome` and `failureCode='upload_presign_failed'`, and returns the closed failed `PresignResponse` without exposing the provider error. A zero-count CAS re-reads and returns the concurrent retry winner's closed outcome; signer failure never overwrites or deletes another winner.

Authenticated throttling is an operational, non-wire-policy contract implemented by PostgreSQL `ImageUploadRateLimitEvent` rows keyed by immutable admin ID, closed route scope, and `occurredAt`. For an enabled upload route, the exact order is authentication/authorization, maintenance gate, rate-limit admission, strict request-shape/current-policy validation, then idempotency/capacity/session work; a rejected request below the limit still consumes one rate-limit event. Maintenance-disabled upload-url requests return `upload_presign_disabled` before rate-limit admission. One serializable transaction takes a per-admin-and-route `pg_advisory_xact_lock`, counts rows strictly inside the rolling window, then either inserts one admitted event or rejects without insertion; the exact reset is the oldest in-window event plus the route window. A database/store failure fails closed with retryable 503 `upload_rate_limit_unavailable` and never falls back to process-local counters. The initial limits are: `POST /images/upload-url` allows 20 requests per rolling 10 minutes, `POST /images/confirm-upload` allows 60 per rolling 10 minutes, status allows 120 per rolling minute, and abandon allows 30 per rolling 10 minutes. Counters are isolated by admin and route scope. Every authenticated attempt admitted below the limit consumes one event even if later request validation/business logic rejects it; an already rate-limited attempt does not insert an event or extend the window. A 429 returns the absolute RFC 3339 reset instant as `retryAfter`. Client IP is used only for sanitized telemetry; forwarded IP is trusted only through an explicit trusted-proxy allowlist and never changes the rate-limit identity. Tests use a resettable clock/store and prove concurrent atomic admission, admin/route isolation, exact window boundary/reset, store failure, and untrusted-proxy behavior.

Active means unexpired `pending` or any `finalizing`. Failed and consumed sessions do not reserve capacity. A stale finalizing lease must be reclaimed or terminalized before releasing its slot.

Confirm performs source HEAD before claim and reads no body before claim. A transient HEAD failure changes no state. The normative order is `HEAD → durable pending→finalizing claim → acquire inspection permit → conditional GetObject → grammar/full decode → persist dispatched promotion → CopyObject`. GetObject uses `IfMatch` with the quoted HEAD ETag. Post-claim mutations match upload ID, owner, status, source ETag, and lease token. No losing confirm may hold a body stream, inspection buffer, or decode permit.

Operational saturation or a definite pre-promotion timeout releases resources and conditionally restores `pending`. Structural, digest, MIME, metadata, dimension, page/frame, or completed decode failure conditionally writes `failed`. Any uncertainty after the durable CopyObject dispatch remains `finalizing` for settlement.

Each `S3Client.send` receives an abort signal composed from the operation timeout and the earliest request/session/lease/job deadline. HEAD, GetObject/body, CopyObject, and DeleteObject cannot outlive their owner. Delete timeout never rolls back a committed image.

The initial deployment is one API process with two decode permits. Rollout verifies actual ready process count, not only environment values, and requires actual processes multiplied by per-process permits <=2.

Abandon changes only an owned `pending` session to `failed/abandoned`. It loses to a finalization claim. The frontend may cancel optimization, presign, and PUT; once verifying begins it does not abort confirm and instead follows status/finalization.

Consumed confirm/status is idempotent for the 30-day retained result window and returns the same safe image with the persisted `resultRetentionExpiresAt`. After that instant it returns `gone` while the permanent idempotency record still forbids reuse. Result deletion atomically stamps `resultDeletedAt`, creates or reuses the matching `ImageObjectDeletion`, and then deletes `Image`; later status within the result window returns `upload_result_deleted`. Missing image without deletion evidence returns `upload_result_unavailable`.

## 18. Security and observability invariants

- All upload-policy/session routes require authenticated admin authorization.
- The R2 bucket is private. Public image delivery uses signed imgproxy URLs generated only from committed `Image` rows.
- Presigned PUT signs exact key, Content-Length, MIME, and one-hour maximum lifetime. The first attempt persists the absolute `presignExpiresAt`; retries sign only the remaining interval and never extend it. The backend returns the same instant as `expiresAt` and never closes temporary cleanup before it plus clock skew. Client claims are not content proof.
- API, reconciler, and cutover roles receive separate bucket-scoped credentials. Provider canaries prove each credential cannot access another bucket/environment. The bucket-scoped API credential is allowed to write objects; create-only destination behavior is enforced by the application command path and the R2 conditional header, never by an impossible credential-level overwrite denial. Exact `uploads/` source and `albums/` create-only destination boundaries are application invariants enforced by closed key builders, command-level operation allowlists, and negative integration tests; the plan does not claim unsupported prefix-level isolation for a long-lived R2 token. The reconciler's distinct R2 credential is honestly modeled as bucket-scoped Object Read & Write because recovery requires HEAD/COPY/DELETE; application entrypoints still expose only role-allowed operations. The cutover operator token never enters API or reconciler runtime.
- Production and staging R2 CORS are provisioned and read back exactly: explicit HTTPS admin origins (localhost HTTP/HTTPS only in non-production), method `PUT`, signed request headers including `Content-Type`, no wildcard origin/header, and no unnecessary exposed response header. A real cross-origin browser PUT must pass; disallowed origins, including non-local HTTP origins, and disallowed header cases must fail.
- R2 credentials, presigned URLs, full object keys, client filenames, and full digests never enter logs, receipts, API errors, or telemetry.
- Logs use server-generated IDs, counts, ages, stable error codes, and truncated one-way key hashes.
- Public/admin serializers use explicit allowlists and never spread Prisma objects.
- JSON and URL-encoded request bodies are limited to 1 MiB; direct R2 PUT is unaffected.
- Album deletion transitions `active → deleting → deleted` as a soft-delete. It returns `album_cleanup_pending` while an active upload or promotion disposition `pending|cleanup_required` exists, rechecks inside the serializable deletion transaction, removes or schedules deletion of live image objects as appropriate, and never hard-deletes the Album or permanent upload/idempotency/tombstone evidence.
- Warning alerts fire for unresolved promotion work at 15 minutes; critical age/bytes alerts fire at one hour.
- Dashboards expose active sessions, promotion states, polling age, dispatch attempts, open conflicts, singleton heartbeat, cleanup latency, browser capability failure, optimization ratio, and stable failure categories.

## 19. Canonical verification scope

Required automated coverage includes:

- deterministic policy hash and package ESM/CommonJS export resolution;
- JPEG/PNG/WebP conformance, terminal bytes, CRC/padding, metadata/ICC, deterministic fuzzing, and bounded-memory behavior;
- browser capability, orientation corner signatures, target-size decode, one encode, resource ownership, cancellation, response loss, and three-context memory benchmark;
- current-only request validation, owner isolation, idempotent presign/confirm/status/abandon with non-extending absolute PUT expiry across response-loss retries, exact per-admin/per-route PostgreSQL throttling and maintenance/validation order, explicit fingerprint/owner conflict errors, failure behavior, and resets, 30-day result retention, 49/50 admission races, and presigned PUT rejection for wrong Content-Length, wrong Content-Type, required-header mismatch, wrong key, and expiry;
- tokenized lease contention, stale reclaim, digest/source-ETag mismatch, canonical quoted/unquoted ETag vectors, immediate CopyObject-response settlement, CopyObject response loss with destination-HEAD settlement after 30 seconds, crash-before-call recovery from persisted inspected facts, create-only retry, destination-condition 412, source-condition 412, and all three durable operator resolutions for a destination conflict;
- legitimate result deletion with a durable object-deletion tombstone, cleanup authority, duplicate polling observations re-entering every current state, restart before/after polling settlement, consumed-session DeleteObject timeout, abandon followed by a late valid PUT, and final absent HEAD only after presign expiry plus clock skew;
- empty/upgrade migration, pre-migration legacy ambiguity classification, one-shot cutover bridge, dedicated advisory-lock loss, heartbeat freshness, all five reconciler loops, role-secret isolation, Docker runtime artifacts, exact R2/CORS/polling readback, all five required ruleset contexts, deterministic CI memory fixture, real staging R2/imgproxy, operator-only smoke ingress, cold cutover, and roll-forward drill.

Every stage runs focused tests, relevant full suites/builds, and `git diff --check`. Provider tests use explicitly non-production resources and fail when credentials or identities can match production.

## 20. Normative document authority

This file is the sole design contract for the feature. It defines required behavior, invariants, failure semantics, and acceptance criteria.

Implementation must execute `docs/superpowers/plans/2026-07-19-admin-web-image-optimization-roll-forward/README.md` in numeric order from Stage 01 through Stage 09. The plan defines file-level work, TDD steps, commands, stage gates, and commit boundaries.

If plan wording conflicts with this spec, stop and reconcile the documents before implementing. Do not infer legacy compatibility, old/new parallel execution, or rollback-to-old behavior from repository history.

## 21. Acceptance criteria

The design is complete when:

- no runtime or cutover step starts old and new upload generations together;
- the API rejects legacy request shapes after the cutover;
- every current-generation CopyObject dispatch has a durable `dispatched` promotion record with complete inspected facts before provider mutation;
- an exact successful CopyObject response can durably settle and commit immediately, while response loss settles through an exact destination HEAD after the 30-second grace period;
- repeated polling of a committed promotion never triggers failed-promotion deletion, and legitimate result deletion remains valid durable history;
- ambiguous CopyObject outcomes recover through R2 HEAD using canonical ETags and persisted metadata, while a proven source-precondition rejection reaches durable `dispatch_rejected + not_created` without canonical deletion;
- failed-promotion canonical deletion, proven no-destination rejection, destination-conflict resolution, legacy-image deletion, and user-requested committed-result deletion have separate explicit authorities;
- every terminal temporary source, including consumed uploads, remains durable cleanup work until the signed PUT expiry plus skew has passed and final HEAD proves absence;
- response-loss retries never extend the persisted absolute presign expiry, and a retry at/after expiry returns no URL and terminalizes the session;
- authenticated route throttling is atomic in PostgreSQL, isolated by admin/route, and fails closed when its store is unavailable;
- the reconciler holds one dedicated advisory-lock connection and runs all five bounded loops: pending-session expiry CAS, promotion recovery, temporary cleanup, applicable image-object deletion, and rate-limit-event cleanup;
- legacy pre-dispatch rows do not receive invented promotion records; every ambiguous legacy row has one revalidated signed row disposition, the audit is bound to the exact quiesced backup, and legacy ambiguity is zero before migration;
- the exact CORS policy, role-separated R2 identities, and 30-second polling configuration are read back and exercised;
- staging exercises real R2 CopyObject, response-loss polling recovery, and cleanup behavior;
- backend, packaging, both browser jobs, and deterministic memory benchmark are required checks;
- Docker smoke tests use real build artifacts;
- general upload ingress opens only after operator-only acceptance passes;
- production cutover and incident recovery are roll-forward only.
