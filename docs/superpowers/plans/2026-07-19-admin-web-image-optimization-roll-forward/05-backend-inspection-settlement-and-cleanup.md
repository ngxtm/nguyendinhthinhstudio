# Backend Inspection, Settlement, and Cleanup Implementation Plan

> **Free-compatible amendment:** Execute Task A3 in `free-compatible-polling-amendment.md`. Every Queue settlement, ACK, DLQ, replay, provider-event quarantine, and event-rule instruction below is retained only as historical checkbox evidence and is superseded by response-first plus exact destination-HEAD polling.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate bounded image bytes, promote them with durable CopyObject intent, settle every provider event safely, and reconcile ambiguous outcomes without deleting committed images.

**Architecture:** Confirm claims a tokenized lease and writes `ImageUploadPromotion` before CopyObject. Cloudflare Queue delivers every canonical-prefix CopyObject event to one HTTP-pull reconciler. Provider copy state is separate from keep/delete disposition, so routine committed events acknowledge without cleanup.

**Tech Stack:** NestJS, Prisma, AWS SDK v3, Sharp 0.35, Cloudflare Queues REST API, PostgreSQL advisory locks, Jest, Testcontainers.

---

### Task 1: Add bounded R2 operations and deadlines

**Files:**

- Modify: `apps/backend/src/images/storage.service.ts`
- Modify: `apps/backend/src/images/storage.service.spec.ts`
- Create: `apps/backend/src/images/image-upload-deadline.ts`
- Create: `apps/backend/src/images/image-upload-deadline.spec.ts`
- Create: `apps/backend/src/images/canonical-etag.ts`
- Create: `apps/backend/src/images/canonical-etag.spec.ts`

- [x] **Step 1: Write failing deadline tests**

Cover never-resolving HEAD, GetObject body reads, CopyObject, and DeleteObject. The effective deadline is the earliest of operation timeout, request/job deadline, session expiry, and finalization lease expiry. Timers and listeners must be removed in `finally`. Add canonical ETag vectors for unquoted Cloudflare events, quoted AWS SDK HEAD/Copy responses, case preservation, conditional-header quoting, and rejection of weak, empty, control-character, or malformed quoted values.

- [x] **Step 2: Run focused tests and observe failure**

```powershell
npm test --workspace=backend -- canonical-etag.spec.ts image-upload-deadline.spec.ts storage.service.spec.ts --runInBand
```

Expected: FAIL because bounded operations and the canonical ETag representation are absent.

- [x] **Step 3: Implement exact CopyObject construction**

Use:

```ts
const command = new CopyObjectCommand({
    Bucket: bucket,
    Key: promotion.destinationObjectKey,
    CopySource: encodeURIComponent('/' + bucket + '/' + promotion.sourceObjectKey).replace(
        /%2F/g,
        '/',
    ),
    CopySourceIfMatch: toHttpEtag(promotion.sourceEtag),
    MetadataDirective: 'REPLACE',
    ContentType: promotion.canonicalMime,
    Metadata: {
        sha256: promotion.inspectedSha256,
        width: String(promotion.inspectedWidth),
        height: String(promotion.inspectedHeight),
        policy: promotion.policyVersion,
    },
});

command.middlewareStack.addRelativeTo(
    (next) => async (args) => {
        const request = args.request as { headers: Record<string, string> };
        request.headers['cf-copy-destination-if-none-match'] = '*';
        return next(args);
    },
    {
        name: 'r2CopyDestinationCreateOnly',
        relation: 'before',
        toMiddleware: 'awsAuthMiddleware',
    },
);
```

The leading slash in `CopySource` and create-only destination header are required. A missing/unsupported header fails staging and rollout; there is no overwrite fallback. Because both `CopySourceIfMatch` and the R2 destination condition can return HTTP 412, 412 alone never identifies the failed precondition and never authorizes cleanup. The caller must enter the post-412 source/destination evidence flow in Task 5. A successful CopyObject response performs no destination HEAD on the request path. Copy timeout or connection loss after dispatch is ambiguous, not a definite failure.

- [x] **Step 4: Verify storage tests**

```powershell
npm test --workspace=backend -- canonical-etag.spec.ts image-upload-deadline.spec.ts storage.service.spec.ts --runInBand
```

Expected: canonical ETag, deadline cleanup, exact source encoding, quoted source If-Match, metadata replacement from durable promotion facts, and no post-success destination HEAD tests PASS.

### Task 2: Implement bounded full-image inspection

**Files:**

- Create: `apps/backend/src/images/image-inspection-semaphore.service.ts`
- Create: `apps/backend/src/images/image-inspection-semaphore.service.spec.ts`
- Create: `apps/backend/src/images/stored-image-inspector.service.ts`
- Create: `apps/backend/src/images/stored-image-inspector.service.spec.ts`
- Modify: `apps/backend/package.json`
- Modify: `apps/backend/src/images/images.module.ts`

- [x] **Step 1: Write failing semaphore tests**

Assert FIFO acquisition, abort removal, release in `finally`, no permit leak, and exactly `IMAGE_UPLOAD_DECODE_PERMITS_PER_PROCESS` concurrent decodes.

- [x] **Step 2: Write failing inspector vectors**

Cover exact digest, MIME spoofing, malformed/trailing bytes, dimensions, pixel count, pages, animation, orientation, metadata rules, ICC limits, parser/Sharp same-buffer identity, body overflow at 5,242,881 bytes, and complete decode rather than metadata-only parsing.

- [x] **Step 3: Install and implement the inspector**

```powershell
npm install --workspace=backend sharp@^0.35.3 --save
```

The caller must already own the tokenized finalization lease. Acquire the FIFO inspection permit before issuing `GetObjectCommand({ IfMatch: toHttpEtag(headEtag) })`. Then read at most 5,242,881 bytes, hash once, run `validate-stored`, perform one Sharp decode with page/pixel limits and a 15-second deadline, discard pixels, and release the response body, timer, listeners, buffer, Sharp pipeline, and permit in `finally`. An If-Match 412 before durable COPY dispatch is a definite `upload_source_changed` validation failure, not the ambiguous post-COPY 412 path.

- [x] **Step 4: Verify inspection tests**

```powershell
npm test --workspace=backend -- image-inspection-semaphore.service.spec.ts stored-image-inspector.service.spec.ts --runInBand
```

Expected: all resource, grammar, digest, and decode tests PASS.

### Task 3: Implement tokenized confirm and durable promotion

**Files:**

- Modify: `apps/backend/src/images/images.service.ts`
- Modify: `apps/backend/src/images/images.service.spec.ts`
- Modify: `apps/backend/test/image-concurrency.integration-spec.ts`

- [x] **Step 1: Write failing barrier and response-loss tests**

Cover:

- HEAD held across session expiry;
- confirm racing abandon;
- many confirms for one upload;
- stale-lease reclaim;
- source ETag change;
- CopyObject response success with a valid destination ETag and no event during the test window, settled durably from the exact response;
- nominal success with a missing/malformed response ETag remaining ambiguous `dispatched` until an exact event;
- a later event attaching separate evidence to response-settled state;
- CopyObject response loss followed by event;
- crash after the dispatched row commits but before the HTTP call;
- stale recovery retry with create-only destination condition;
- HTTP 412 from the destination condition because another dispatch won;
- HTTP 412 from `CopySourceIfMatch` because the source changed;
- post-412 destination-exists, destination-absent/source-still-matches, source-missing, and source-ETag-mismatch branches;
- event arriving before the Image transaction;
- final transaction response loss;
- request restart with the same clientRequestId.

Assert one GetObject/Sharp/COPY owner and one `Image`.

- [x] **Step 2: Run focused tests and observe failure**

```powershell
npm test --workspace=backend -- images.service.spec.ts --runInBand
npm run test:integration --workspace=backend -- image-concurrency.integration-spec.ts
```

Expected: FAIL before tokenized promotion flow exists.

- [x] **Step 3: Implement pre-claim and claim transitions**

HEAD occurs before claim and reads no body. A definitive HEAD validation failure conditionally marks the owned unexpired pending row failed. A transient HEAD failure changes no state. Claim requires owner, `pending`, unexpired session, expected source ETag, and available album capacity, and writes a new lease token. After claim, the lease winner alone follows `acquire inspection permit → conditional GetObject → grammar/full decode`. A losing confirm cannot acquire a permit or obtain a body stream.

- [x] **Step 4: Persist promotion before provider mutation**

In one committed transaction, call `createDispatchedPromotion` with `origin=current`, exact account, bucket, source key, canonical unquoted source ETag, destination key, album, lease token, inspected SHA-256, byte size, canonical MIME, width, height, policy version, `copyDispatchedAt=now`, `dispatchAttempts=1`, `lastDispatchAttemptAt=now`, and `nextReconcileAt=now+eventGrace`. Reject any missing inspected or scheduling fact. `dispatched` means provider mutation is authorized and outcome-ambiguous even if the process dies before the HTTP call. Only after this transaction commits may `storage.promoteObject` build metadata from the durable promotion and run.

If CopyObject times out after dispatch, leave:

```text
ImageUpload.status = finalizing
ImageUploadPromotion.copyState = dispatched
ImageUploadPromotion.disposition = pending
```

Do not restore pending and do not mark failed.

- [x] **Step 5: Commit successful promotion atomically**

On a definite successful CopyObject response with a present valid canonical destination ETag, call the single `settleCopyResponseAndCommit` repository operation. Its one serializable transaction:

- verifies the current lease and promotion;
- creates the exact `Image` with digest, byte count, dimensions, URLs, and order;
- increments album count;
- sets upload `consumed` and result image ID;
- sets idempotency terminal outcome, `terminalAt`, and `resultRetentionExpiresAt=terminalAt+30 days`;
- normalizes and stores `copyResponseObservedAt` plus `copyResponseEtag`;
- sets `providerSettlementObservedAt`, changes `copyState=dispatched→provider_settled`, changes disposition `pending→committed`, and stores `committedResultImageId` without inventing Queue-event fields;
- sets upload `temporaryCleanupState=pending` and schedules cleanup no earlier than `presignExpiresAt + clockSkew`.

A nominal 2xx response with a missing or malformed destination ETag is outcome-ambiguous: do not create `Image` or call the combined commit; leave `dispatched + pending` for Queue/recovery. A stale owner or zero-count update re-reads the winner. It never deletes the destination.

- [x] **Step 6: Verify confirm integration tests**

```powershell
npm test --workspace=backend -- images.service.spec.ts --runInBand
npm run test:integration --workspace=backend -- image-concurrency.integration-spec.ts
```

Expected: ownership, timeout, event-order, response-loss, and single-commit/idempotency tests PASS.

### Task 4: Implement the Cloudflare HTTP-pull Queue client

**Files:**

- Create: `apps/backend/src/images/cloudflare-queue.client.ts`
- Create: `apps/backend/src/images/cloudflare-queue.client.spec.ts`
- Create: `apps/backend/src/images/r2-copy-event.ts`
- Create: `apps/backend/src/images/r2-copy-event.spec.ts`
- Modify: `apps/backend/src/images/images.module.ts`

- [x] **Step 1: Write failing HTTP and body-decoding tests**

Use the documented endpoints:

```text
POST /accounts/{accountId}/queues/{queueId}/messages/pull
POST /accounts/{accountId}/queues/{queueId}/messages/ack
```

Cover batch size up to 100, visibility timeout, authorization redaction, non-2xx responses, network timeout, ephemeral message IDs, attempt counts, lease IDs/deadlines, source-versus-DLQ identity, partial ack/retry batches, retry delay, and a message moving to DLQ at `max_retries`.

For `metadata.CF-Content-Type`, base64-decode `json` and `bytes`, parse `text` as UTF-8 JSON, and reject `v8` or unknown types.

- [x] **Step 2: Write failing event validation tests**

Validate exact account, bucket, `action=CopyObject`, destination key, canonicalized unquoted destination ETag, source object, and RFC 3339 event time. Compute:

```text
providerEventId = SHA-256(
  JCS({ account, bucket, action, object, copySource, eventTime })
)
```

Normalize only documented envelope encoding and the explicit canonical ETag representation; never guess a missing key or ETag and never case-fold an ETag.

- [x] **Step 3: Implement the bounded Queue client and validator**

The Queue token is passed only by the reconciler role. Error objects and logs contain response status, Cloudflare error code, message age, and server IDs, never the bearer token or full object keys.

- [x] **Step 4: Verify Queue client tests**

```powershell
npm test --workspace=backend -- cloudflare-queue.client.spec.ts r2-copy-event.spec.ts --runInBand
```

Expected: HTTP, timeout, content-type, validation, and redaction tests PASS.

### Task 5: Implement settlement state matrix and reconciliation

**Files:**

- Create: `apps/backend/src/images/r2-copy-settlement.service.ts`
- Create: `apps/backend/src/images/r2-copy-settlement.service.spec.ts`
- Create: `apps/backend/src/images/image-upload-reconciler.service.ts`
- Create: `apps/backend/src/images/image-upload-reconciler.service.spec.ts`
- Create: `apps/backend/src/images/pending-upload-expiry.service.ts`
- Create: `apps/backend/src/images/pending-upload-expiry.service.spec.ts`
- Create: `apps/backend/src/images/image-upload-rate-limit-cleanup.service.ts`
- Create: `apps/backend/src/images/image-upload-rate-limit-cleanup.service.spec.ts`
- Create: `apps/backend/src/images/image-upload-provider-event-quarantine-location.repository.ts`
- Create: `apps/backend/src/images/image-upload-provider-event-quarantine-location.repository.spec.ts`
- Create: `apps/backend/src/images/image-upload-provider-event-quarantine-action.repository.ts`
- Create: `apps/backend/src/images/image-upload-provider-event-quarantine-action.repository.spec.ts`
- Create: `apps/backend/src/images/image-upload-provider-event-quarantine-resolution.repository.ts`
- Create: `apps/backend/src/images/image-upload-provider-event-quarantine-resolution.repository.spec.ts`
- Create: `apps/backend/src/images/image-upload-provider-event-quarantine-location-rebuilder.service.ts`
- Create: `apps/backend/src/images/image-upload-provider-event-quarantine-location-rebuilder.service.spec.ts`
- Modify: `apps/backend/src/images/upload-cleanup.service.ts`
- Modify: `apps/backend/src/images/upload-cleanup.service.spec.ts`
- Modify: `apps/backend/src/images/image-deletion.service.ts`
- Modify: `apps/backend/src/images/image-deletion.service.spec.ts`
- Modify: `apps/backend/src/images/images.module.ts`
- Modify: `apps/backend/package.json`
- Modify: `package-lock.json`
- Create: `apps/backend/test/image-upload-settlement.integration-spec.ts`

- [x] **Step 1: Write the complete failing state-matrix tests**

Required cases:

| Session/promotion state                     | Event action                                                                         | Canonical delete |
| ------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------- |
| active finalizing + pending                 | record settlement; owner retains authority                                           | never            |
| stale finalizing + pending + settled by response/event | claim new token and finalize after matching HEAD                            | never            |
| stale finalizing + pending + no settlement  | after grace: matching destination waits; absent destination retries create-only COPY | never            |
| consumed or committed                       | record settlement and ACK                                                            | never            |
| failed/expired/abandoned + cleanup_required | matching HEAD, delete, final absent HEAD                                             | allowed          |
| failed + dispatch_rejected + not_created     | no event expected; matching event is a critical conflict retried to DLQ               | never            |
| unmatched or malformed                      | create/reuse durable quarantine evidence, retry, then DLQ                            | never            |
| late legacy Image without promotion          | quarantine unless exact operator-approved legacy bridge disposition exists           | never            |
| duplicate providerEventId                   | deduplicate evidence, re-read state, and execute the matching row above              | state-dependent  |

Also cover event-before-commit, event-after-consumed, successful CopyObject response with no event, response loss settled by a later event, normal success without DLQ growth, crash after durable dispatch before HTTP with the temporary source still present and due at `nextReconcileAt`, create-only retry from persisted inspected facts, destination-condition 412 recovery, source-condition 412 terminalization, late matching event after `dispatch_rejected + not_created` becoming one durable conflict, all three conflict dispositions, malformed/unmatched/late-legacy events becoming durable quarantine evidence, stable-ID fingerprint `SHA-256(JCS({ providerEventId }))`, exact fallback fingerprint `SHA-256(JCS({ sourceQueueId, bodySha256 }))`, source-Queue-to-DLQ relocation with changed ephemeral message ID still reusing one quarantine, two same-body messages producing separate location/action histories, latest-pointer CAS, both quarantine dispositions ACKing every matching lease, replay intent/publish/adopt convergence after crash before the publish result is recorded, verified `resolved -> open` history-preserving reopen when an unwrapped replay is still malformed, refusal to replay from hashes when no current body exists, crash after action intent/partial ACK/ACK success before outcome append, process restart after DB commit before ACK, quoted HEAD versus unquoted response/event ETag, true destination ETag mismatch, source-key mismatch, consumed-session DeleteObject timeout, abandon followed by late PUT, legitimate current-result deletion, explicit legacy-image deletion, non-R2 deletion writers persisting `non_r2_deferred/legacy_deferred`, deferred non-R2 deletion exclusion, and reclaim loser. Add explicit restart/idempotency tests for all six bounded loops: Queue settlement, pending-session expiry CAS, promotion recovery, temporary-session cleanup, `ImageObjectDeletion`, and rate-limit-event cleanup.

- [x] **Step 2: Run focused tests and observe failure**

```powershell
npm test --workspace=backend -- r2-copy-settlement.service.spec.ts image-upload-reconciler.service.spec.ts image-upload-provider-event-quarantine-location.repository.spec.ts image-upload-provider-event-quarantine-action.repository.spec.ts image-upload-provider-event-quarantine-resolution.repository.spec.ts image-upload-provider-event-quarantine-location-rebuilder.service.spec.ts pending-upload-expiry.service.spec.ts image-upload-rate-limit-cleanup.service.spec.ts upload-cleanup.service.spec.ts image-deletion.service.spec.ts --runInBand
npm run test:integration --workspace=backend -- image-upload-settlement.integration-spec.ts
```

Expected: FAIL before settlement and reconciliation exist.

- [x] **Step 3: Implement ack-after-commit settlement**

For every pulled message, decode and validate the body before promotion matching. A malformed envelope creates/reuses `ImageUploadProviderEventQuarantine` with `reason=malformed_event`, null provider/event-envelope IDs, and a valid event with no exact promotion creates/reuses it with `reason=unmatched_event`, non-null provider/event-envelope IDs, in a committed transaction with fingerprint `SHA-256(JCS({ providerEventId }))` when a stable provider ID is available, otherwise exactly `SHA-256(JCS({ sourceQueueId, bodySha256 }))`. Ephemeral message and lease IDs are forbidden from the fallback input. Call an idempotent `appendOrReuseLocationObservation` repository method containing source-or-DLQ kind, Queue ID, ephemeral message/lease/deadline, attempts, and its observation hash. It inserts or reuses the unique history row, then CAS-updates the denormalized latest-location pointer to the newest observation; a crash between the two steps is repaired by a bounded pointer-rebuild pass from the append-only history. Duplicate malformed messages with the same source Queue/body deliberately share one quarantine row but retain distinct observations and actions. Retry with bounded delay and let normal retries move it to DLQ; never ACK it as ordinary settlement and never authorize deletion. A late event matching an existing legacy `Image` but no promotion follows the same quarantine path unless the operator has separately committed an exact legacy bridge disposition.

For each valid matched event:

1. Find the exact promotion by account, bucket, source key, and destination key.
2. If it is `dispatch_rejected + not_created`, create/reuse the exact open `ImageUploadPromotionConflict`, copy every rejection reason/timestamp/source/destination observation plus account/bucket/event/key evidence and its canonical hash before any repair, preserve all promotion rejection/provider fields, and retry without acknowledging; normal Queue retries must carry it to the DLQ until an operator resolution is committed.
3. Otherwise persist `providerEventId`, `providerEventObservedAt`, event ETag, settlement source, `providerSettlementObservedAt`, and `copyState=provider_settled` in a transaction. If CopyObject response evidence already settled the row, require matching ETags and attach event evidence without replacing response evidence.
4. Apply only the matrix action allowed by current lease and disposition.
5. Commit the database change.
6. ACK the Queue lease.

If step 3–5 fails, retry the message. A `committed` disposition is immutable and always wins over failed-promotion cleanup. Duplicate event identity only reuses the stored provider evidence and then evaluates the current row again.

The promotion loop selects bounded batches of every unresolved row with `copyState='dispatched'` and `nextReconcileAt <= now`, regardless of whether disposition is `pending`, `committed`, or cleanup-related; the state matrix decides the only legal action after selection. This includes a committed row whose synchronous response transaction did not durably settle `copyState`. Current rows with null scheduling facts are invalid/critical rather than silently skipped. For stale rows without provider settlement, an exact existing destination waits for its event and advances `nextReconcileAt` by bounded backoff. An absent destination records `firstDestinationAbsentAt` if missing and permits one create-only retry using only persisted inspected facts, canonical source ETag, destination, metadata, and condition. Before every retry, atomically increment `dispatchAttempts`, set `lastDispatchAttemptAt=now`, and advance `nextReconcileAt`; never leave a due row with null schedule.

On HTTP 412, immediately HEAD destination and source within the current operation deadline. The request owner may persist only the first observation and return `finalizing`; it never waits a visibility timeout on the HTTP request. The reconciler performs the scheduled second observation and terminal CAS. The same rules apply when a reconciler retry receives 412:

1. Existing destination: keep `dispatched + pending`, record only the observation, and wait for an exact event; do not infer which dispatch created it.
2. Destination absent and source ETag still exact: keep `dispatched + pending` and use normal bounded retry/backoff.
3. Destination absent and source missing or canonically different: keep `dispatched + pending`, persist the first absence/source observation, and schedule the second observation no earlier than one Queue visibility timeout.
4. At the second observation, atomically require destination still absent, no matching event, no Image reference, source still missing/different, and elapsed visibility timeout; then write `copyState=dispatch_rejected`, `disposition=not_created`, rejection evidence, upload failure `upload_dispatch_rejected`, and release the album reservation.

A 412 response or a single absent HEAD never authorizes this terminal transition. The terminal branch performs no canonical DeleteObject and only queues best-effort temporary-key cleanup.

- [x] **Step 4: Implement safe cleanup authority**

Only terminal failed/expired/abandoned sessions that never committed can CAS promotion disposition `pending→cleanup_required`, and only when no `Image` references the destination. Failed-promotion canonical deletion requires provider settlement plus matching canonical destination ETag. Promotion `verified_deleted` requires a final absent HEAD after DeleteObject. Absence before provider settlement is never sufficient. The separate `dispatch_rejected + not_created` terminal pair bypasses canonical cleanup entirely and may delete only its temporary source key.

Temporary-source cleanup is a separate durable session workflow. Every terminal upload, including `consumed`, validation failure, expired, abandoned, dispatch rejected, and cutover aborted, atomically enters `temporaryCleanupState=pending`. Immediate best-effort DELETE is allowed, but each timeout/failure increments `temporaryCleanupAttempts`, stores only a closed redacted error category, and schedules `temporaryCleanupNextAttemptAt` with bounded backoff. The loop scans all due unverified terminal sessions, not only failed/expired rows. A terminal row with null `presignExpiresAt` is a critical invariant failure and remains unverified; only the cutover apply may backfill a legacy row from its verified conservative drain deadline. The loop writes `verified_deleted` and `temporaryCleanupVerifiedAt` only when `now >= presignExpiresAt + IMAGE_UPLOAD_PRESIGN_CLOCK_SKEW_SECONDS` and a final HEAD is absent; this makes restart idempotent and prevents abandon/late-PUT recreation from closing cleanup incorrectly.

A committed result deletion never enters this path. The image-deletion loop has two closed authority branches. `current_result` requires the exact `ImageObjectDeletion` row, matching idempotency `resultDeletedAt`, committed promotion, and object-key hash. `legacy_image` requires an immutable snapshot hash over the exact legacy Image ID, provider, and object-key hash and must not fabricate upload/promotion/idempotency evidence. Both R2 branches delete only the snapshotted destination, verify absence, and terminalize that deletion record; the current-result promotion remains `committed`. Existing `provider='cloudflare_legacy', status='deferred'` and every other non-R2 deletion row receive an explicit provider disposition, are skipped by the R2 loop, and are excluded from R2 unresolved-work gates.

- [x] **Step 5: Install the dedicated PostgreSQL client**

```powershell
npm install --workspace=backend pg@^8 --save
npm install --workspace=backend @types/pg@^8 --save-dev
```

Expected: backend package and lockfile contain explicit `pg` dependencies before the reconciler tests compile; Prisma pool affinity is never used for the session advisory lock.

- [x] **Step 6: Implement singleton scheduling and alerts**

Use one dedicated `pg.Client`, never a returned Prisma pool connection, to acquire the session advisory lock. Upsert `ImageUploadReconcilerHeartbeat(id='singleton')` with owner/build fingerprints and per-loop completion times through that connection. On connection error, abort every in-flight loop controller and perform no further mutation until a fresh process owns the lock.

While holding the lock, run six independently bounded loops in this order:

1. pull/settle at most 100 Queue messages, including durable quarantine creation for malformed/unmatched events;
2. terminalize due `pending` sessions with CAS over upload ID, owner, `status='pending'`, and `presignExpiresAt <= now`, writing stable `failed/upload_expired`, releasing the album reservation, and scheduling temporary cleanup exactly once;
3. scan a bounded page of every unresolved `dispatched` promotion with non-null `nextReconcileAt <= now`;
4. clean every due unverified terminal temporary session including consumed rows;
5. process only applicable R2 `ImageObjectDeletion` rows under `current_result | legacy_image` authority and disposition non-R2 deferred rows separately;
6. delete `ImageUploadRateLimitEvent` rows older than ten minutes in bounded batches.

Before each loop, count invalid current promotions whose scheduling fields are null; any nonzero count records a critical invariant failure instead of excluding those rows. Update the matching heartbeat completion timestamp only after each bounded loop returns successfully. A CAS loser is re-read and never overwritten; one loop failure is recorded and retried but cannot make later work unbounded. Release the lock on graceful shutdown. One-minute cadence, heartbeat freshness within two cadences, 15-minute warning, and one-hour critical age/bytes alerts are explicit.

- [x] **Step 7: Verify settlement and cleanup tests**

```powershell
npm test --workspace=backend -- r2-copy-settlement.service.spec.ts image-upload-reconciler.service.spec.ts image-upload-provider-event-quarantine-location.repository.spec.ts image-upload-provider-event-quarantine-action.repository.spec.ts image-upload-provider-event-quarantine-resolution.repository.spec.ts image-upload-provider-event-quarantine-location-rebuilder.service.spec.ts pending-upload-expiry.service.spec.ts image-upload-rate-limit-cleanup.service.spec.ts upload-cleanup.service.spec.ts image-deletion.service.spec.ts --runInBand
npm run test:integration --workspace=backend -- image-upload-settlement.integration-spec.ts
```

Expected: all matrix, late-COPY, ack-after-commit, duplicate, quarantine/DLQ, six-loop restart/idempotency, pending-expiry CAS, rate-limit cleanup, temporary cleanup, current-result deletion, legacy-image deletion, and non-R2 deferred-disposition tests PASS.

### Task 6: Add production entrypoint and settlement runbook

**Files:**

- Create: `apps/backend/src/scripts/reconcile-image-uploads.ts`
- Create: `apps/backend/src/scripts/reconcile-image-uploads.spec.ts`
- Create: `apps/backend/src/scripts/resolve-image-upload-promotion-conflict.ts`
- Create: `apps/backend/src/scripts/resolve-image-upload-promotion-conflict.spec.ts`
- Create: `apps/backend/src/scripts/resolve-image-upload-provider-event-quarantine.ts`
- Create: `apps/backend/src/scripts/resolve-image-upload-provider-event-quarantine.spec.ts`
- Modify: `apps/backend/package.json`
- Create: `docs/runbooks/image-upload-r2-settlement.md`

- [x] **Step 1: Write the entrypoint contract test**

Assert the reconciler script refuses non-reconciler role, obtains the advisory lock on one dedicated PostgreSQL connection, publishes the singleton heartbeat, runs all six bounded loops, aborts all work on lock-connection loss, handles SIGTERM, never boots HTTP routes, and exits nonzero on duplicate lock ownership or invalid Queue/DLQ/R2 configuration. Assert both operator resolvers refuse to start unless `IMAGE_UPLOAD_PROCESS_ROLE=cutover`, require `IMAGE_UPLOAD_OPERATOR_TOKEN`, reject API/reconciler-only secret sets, and never bootstrap the HTTP application.

- [x] **Step 2: Add production scripts under the Nest source root**

Keep every executable under `apps/backend/src/scripts/`, because `apps/backend/nest-cli.json` has `sourceRoot: "src"` and `nest build` does not compile `apps/backend/scripts/*.ts`. Register the emitted artifacts:

```json
{
    "images:uploads:reconcile": "node /app/dist/scripts/reconcile-image-uploads.js",
    "images:uploads:resolve-conflict": "node /app/dist/scripts/resolve-image-upload-promotion-conflict.js",
    "images:uploads:resolve-quarantine": "node /app/dist/scripts/resolve-image-upload-provider-event-quarantine.js"
}
```

The colocated `*.spec.ts` files stay under the existing Jest root and are excluded from production emission by the existing Nest/TypeScript test exclusions. Do not document or invoke an artifact that the backend build does not emit.

- [x] **Step 3: Implement and test executable conflict disposition**

Register an operator-only CLI that requires explicit conflict ID, provider event ID, disposition, source Queue ID, DLQ ID, absolute evidence-receipt path, operator identity fingerprint, approval digest, `IMAGE_UPLOAD_OPERATOR_TOKEN`, and the distinct `IMAGE_UPLOAD_CUTOVER_QUEUE_TOKEN`. Before pulling, it acquires the singleton advisory lock on a dedicated connection, refuses concurrent reconciler/resolver ownership, and waits one configured Queue visibility timeout so pre-existing hidden leases can reappear; lock loss aborts without finalizing. It pulls bounded pages from the recorded current Queue location, matches the stable provider event ID, and uses only the newly returned ephemeral message/lease ID for ACK; a stale receipt lease is never reused. It supports only:

```text
confirmed_absent_ack
cleanup_authorized
committed_authorized
```

`confirmed_absent_ack` requires provider investigation plus final absent HEAD. `cleanup_authorized` requires exact event/HEAD identity, no Image authority, a committed cleanup-authority record, canonical DeleteObject, and final absent HEAD. `committed_authorized` requires exact live Image/result authority, snapshots the complete rejection evidence, and only then repairs committed authority in the same transaction. Every branch preserves the full rejection snapshot plus hash, closes the conflict transaction before ACK/quarantine, searches source/DLQ deterministically after message relocation, is restart-idempotent, and rejects stale leases or cross-event evidence. Tests cover DLQ inspect, each resolution, crash before/after commit and ACK, wrong approval/evidence, and zero-open-conflict gates.

- [x] **Step 4: Implement and test executable quarantine disposition**

The cutover-only quarantine CLI requires quarantine record ID, resolution, explicit source Queue and DLQ IDs, absolute evidence-receipt path, operator fingerprint, approval digest, `IMAGE_UPLOAD_OPERATOR_TOKEN`, and the distinct `IMAGE_UPLOAD_CUTOVER_QUEUE_TOKEN`. It acquires the singleton advisory lock on a dedicated connection, refuses to run while the reconciler owns it, and waits one full configured Queue visibility timeout after acquisition before its final exhaustive scan. Every begin/finalize operation uses a fresh resolution-attempt UUID; completed attempts are immutable snapshots in `ImageUploadProviderEventQuarantineResolution`. It recomputes the raw-body hash plus an optional canonical envelope hash (null for `malformed_event`) and the exact `SHA-256(JCS({ providerEventId }))` or `SHA-256(JCS({ sourceQueueId, bodySha256 }))` fingerprint from immutable evidence, then CASes `open -> resolving` before provider mutation. It exhaustively pulls both Queue locations, matches stable provider ID or the fallback source-Queue/body tuple, appends/reuses every fresh location, and commits an `ack_requested` action tagged with the current resolution-attempt ID and real location-observation hash for every distinct current lease before ACK. After each provider ACK (or idempotent provider “already absent”), it appends `ack_succeeded` with provider outcome `acknowledged | already_absent`; an orphan success, action/location mismatch, or success timestamp earlier than its intent is fatal; a crash after intent, partial ACK, ACK success, or before outcome append resumes from action history without creating a second quarantine. The CLI repeats until both Queue scans are exhausted and no matching non-replay message remains. Only then may it store the acknowledged count/scan timestamp and CAS `resolving -> resolved`. `replay_requested` requires a freshly pulled matching body and refuses to reconstruct bytes from hashes. It wraps the exact bytes in `image-upload-replay/v1` with UUID `replayRequestId`, original body SHA-256, source Queue ID, quarantine fingerprint, and base64 payload; it commits `replay_publish_requested` against that observation before sending. The source consumer unwraps only this exact verified envelope and carries `replayRequestId` through location/action history. If the unwrapped bytes are still malformed/unmatched, it records the replay location and calls `reopenProviderEventQuarantineAfterReplay` only after verifying the prior immutable resolution snapshot/hash; it deliberately leaves that lease unacknowledged because the reopened row has no new resolution attempt with ACK authority. The old replay request ID is retired from the new attempt: the next `quarantined_ack` sweep must ACK that old envelope, while the next `replay_requested` sweep may use it as the fresh body only while publishing a new stable request ID, then ACKs that retired envelope under the new attempt before closure. The CAS clears current working fields, keeps all prior attempts, and returns the row to `open` for a new attempt. If the publish result is uncertain, restart waits the visibility barrier and scans both queues for that stable request ID, deterministically adopts exactly one current envelope as canonical replay, appends its source/DLQ observation plus `replay_published` with outcome `published | adopted_after_uncertain_publish`, records that identity, and ACKs every other matching envelope/lease. If no envelope exists after the barrier, it reuses the committed `replay_publish_requested` intent to republish the exact envelope with the same stable request ID, then rescans without creating a second intent. The final scan excludes only the active attempt's stable request ID; retired replay IDs are matching work for the new attempt, so the workflow converges idempotently across DLQ relocation without relying on ephemeral message ID or claiming cross-system exactly-once. Neither branch may delete or promote an object. Tests reject missing/wrong fields, wrong role/secret, concurrent resolver/reconciler lock ownership, hidden leases that reappear before the visibility-timeout barrier, lock loss, stale lease, malformed-envelope null/non-null evidence drift, hash/fingerprint drift, action/location mismatch, orphan success, success-before-intent, cross-event evidence, unknown resolution, hash-only replay, incomplete scans, an unacknowledged duplicate lease, multiple surviving replay identities, replay reopen without matching immutable snapshot/hash, retired replay envelopes left unacknowledged on the next attempt, overwritten prior attempts, and ACK/replay before committed intent.

- [x] **Step 5: Document provider configuration and DLQ disposition**

The runbook records Queue/DLQ names and IDs, source consumer ID/type/settings/DLQ binding, DLQ inspection consumer ID/type with no recursive DLQ, event-rule ID/action/prefix, retention, role-specific secrets, a bucket-scoped reconciler R2 credential with Object Read & Write permission for HEAD/COPY/DELETE, pull/ack endpoints for both Queues, dashboards, alert thresholds, pause/resume, DLQ inspect/replay/quarantine/ACK steps tied to the durable conflict and quarantine CLIs, and teardown/readback commands. Provider actions require sanitized operator receipts. An event cannot be manually ACKed merely because it reached the DLQ.

- [x] **Step 6: Verify compiled entrypoints**

```powershell
npm test --workspace=backend -- reconcile-image-uploads.spec.ts resolve-image-upload-promotion-conflict.spec.ts resolve-image-upload-provider-event-quarantine.spec.ts --runInBand
npm run build --workspace=backend
node --check apps/backend/dist/scripts/reconcile-image-uploads.js
node --check apps/backend/dist/scripts/resolve-image-upload-promotion-conflict.js
node --check apps/backend/dist/scripts/resolve-image-upload-provider-event-quarantine.js
```

Expected: reconciler/conflict/quarantine role and disposition tests pass; the normal backend build exits 0 and emits all three syntax-valid runtime artifacts under `dist/scripts/`.

### Task 7: Stage gate and commit

- [x] **Step 1: Run complete backend verification**

```powershell
npm test --workspace=backend -- --runInBand
npm run test:e2e --workspace=backend -- --runInBand
npm run test:integration --workspace=backend
npm run build --workspace=backend
git diff --check
```

Expected: all commands exit 0.

- [x] **Step 2: Commit**

```powershell
git add apps/backend docs/runbooks/image-upload-r2-settlement.md package-lock.json
git commit -m "feat(images): add durable copy settlement"
```
