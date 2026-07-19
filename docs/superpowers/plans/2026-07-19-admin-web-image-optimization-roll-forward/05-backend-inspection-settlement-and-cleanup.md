# Backend Inspection, Settlement, and Cleanup Implementation Plan

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

- [ ] **Step 1: Write failing deadline tests**

Cover never-resolving HEAD, GetObject body reads, CopyObject, and DeleteObject. The effective deadline is the earliest of operation timeout, request/job deadline, session expiry, and finalization lease expiry. Timers and listeners must be removed in `finally`. Add canonical ETag vectors for unquoted Cloudflare events, quoted AWS SDK HEAD/Copy responses, case preservation, conditional-header quoting, and rejection of weak, empty, control-character, or malformed quoted values.

- [ ] **Step 2: Run focused tests and observe failure**

```powershell
npm test --workspace=backend -- canonical-etag.spec.ts image-upload-deadline.spec.ts storage.service.spec.ts --runInBand
```

Expected: FAIL because bounded operations and the canonical ETag representation are absent.

- [ ] **Step 3: Implement exact CopyObject construction**

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

The leading slash in `CopySource` and create-only destination header are required. A missing/unsupported header fails staging and rollout; there is no overwrite fallback. HTTP 412 means the destination already exists and is reconciled through HEAD plus the provider event. A successful CopyObject response performs no destination HEAD on the request path. Copy timeout or connection loss after dispatch is ambiguous, not a definite failure.

- [ ] **Step 4: Verify storage tests**

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

- [ ] **Step 1: Write failing semaphore tests**

Assert FIFO acquisition, abort removal, release in `finally`, no permit leak, and exactly `IMAGE_UPLOAD_DECODE_PERMITS_PER_PROCESS` concurrent decodes.

- [ ] **Step 2: Write failing inspector vectors**

Cover exact digest, MIME spoofing, malformed/trailing bytes, dimensions, pixel count, pages, animation, orientation, metadata rules, ICC limits, parser/Sharp same-buffer identity, body overflow at 5,242,881 bytes, and complete decode rather than metadata-only parsing.

- [ ] **Step 3: Install and implement the inspector**

```powershell
npm install --workspace=backend sharp@^0.35.3 --save
```

Read at most 5,242,881 bytes, hash once, run `validate-stored`, acquire the decode permit, perform one Sharp decode with page/pixel limits and a 15-second deadline, discard pixels, and release every resource in `finally`.

- [ ] **Step 4: Verify inspection tests**

```powershell
npm test --workspace=backend -- image-inspection-semaphore.service.spec.ts stored-image-inspector.service.spec.ts --runInBand
```

Expected: all resource, grammar, digest, and decode tests PASS.

### Task 3: Implement tokenized confirm and durable promotion

**Files:**

- Modify: `apps/backend/src/images/images.service.ts`
- Modify: `apps/backend/src/images/images.service.spec.ts`
- Modify: `apps/backend/test/image-concurrency.integration-spec.ts`

- [ ] **Step 1: Write failing barrier and response-loss tests**

Cover:

- HEAD held across session expiry;
- confirm racing abandon;
- many confirms for one upload;
- stale-lease reclaim;
- source ETag change;
- CopyObject response success with later event;
- CopyObject response loss followed by event;
- crash after the dispatched row commits but before the HTTP call;
- stale recovery retry with create-only destination condition;
- HTTP 412 because another dispatch won;
- event arriving before the Image transaction;
- final transaction response loss;
- request restart with the same clientRequestId.

Assert one GetObject/Sharp/COPY owner and one `Image`.

- [ ] **Step 2: Run focused tests and observe failure**

```powershell
npm test --workspace=backend -- images.service.spec.ts --runInBand
npm run test:integration --workspace=backend -- image-concurrency.integration-spec.ts
```

Expected: FAIL before tokenized promotion flow exists.

- [ ] **Step 3: Implement pre-claim and claim transitions**

HEAD occurs before claim. A definitive source validation failure conditionally marks the owned unexpired pending row failed. A transient HEAD failure changes no state. Claim requires owner, `pending`, unexpired session, expected source ETag, and available album capacity, and writes a new lease token.

- [ ] **Step 4: Persist promotion before provider mutation**

In one committed transaction, call `createDispatchedPromotion` with `origin=current`, exact account, bucket, source key, canonical unquoted source ETag, destination key, album, lease token, inspected SHA-256, byte size, canonical MIME, width, height, policy version, `dispatchAttempts=1`, and `lastDispatchAttemptAt=now`. Reject any missing inspected fact. `dispatched` means provider mutation is authorized and outcome-ambiguous even if the process dies before the HTTP call. Only after this transaction commits may `storage.promoteObject` build metadata from the durable promotion and run.

If CopyObject times out after dispatch, leave:

```text
ImageUpload.status = finalizing
ImageUploadPromotion.copyState = dispatched
ImageUploadPromotion.disposition = pending
```

Do not restore pending and do not mark failed.

- [ ] **Step 5: Commit successful promotion atomically**

On a definite successful CopyObject response, one serializable transaction:

- verifies the current lease and promotion;
- creates the exact `Image` with digest, byte count, dimensions, URLs, and order;
- increments album count;
- sets upload `consumed` and result image ID;
- sets idempotency terminal outcome, `terminalAt`, and `resultRetentionExpiresAt=terminalAt+30 days`;
- changes promotion disposition `pending→committed` and stores `committedResultImageId`.

A stale owner or zero-count update re-reads the winner. It never deletes the destination.

- [ ] **Step 6: Verify confirm integration tests**

```powershell
npm test --workspace=backend -- images.service.spec.ts --runInBand
npm run test:integration --workspace=backend -- image-concurrency.integration-spec.ts
```

Expected: ownership, timeout, event-order, response-loss, and exactly-once tests PASS.

### Task 4: Implement the Cloudflare HTTP-pull Queue client

**Files:**

- Create: `apps/backend/src/images/cloudflare-queue.client.ts`
- Create: `apps/backend/src/images/cloudflare-queue.client.spec.ts`
- Create: `apps/backend/src/images/r2-copy-event.ts`
- Create: `apps/backend/src/images/r2-copy-event.spec.ts`
- Modify: `apps/backend/src/images/images.module.ts`

- [ ] **Step 1: Write failing HTTP and body-decoding tests**

Use the documented endpoints:

```text
POST /accounts/{accountId}/queues/{queueId}/messages/pull
POST /accounts/{accountId}/queues/{queueId}/messages/ack
```

Cover batch size up to 100, visibility timeout, authorization redaction, non-2xx responses, network timeout, lease IDs, partial ack/retry batches, and retry delay.

For `metadata.CF-Content-Type`, base64-decode `json` and `bytes`, parse `text` as UTF-8 JSON, and reject `v8` or unknown types.

- [ ] **Step 2: Write failing event validation tests**

Validate exact account, bucket, `action=CopyObject`, destination key, canonicalized unquoted destination ETag, source object, and RFC 3339 event time. Compute:

```text
providerEventId = SHA-256(
  JCS({ account, bucket, action, object, copySource, eventTime })
)
```

Normalize only documented envelope encoding and the explicit canonical ETag representation; never guess a missing key or ETag and never case-fold an ETag.

- [ ] **Step 3: Implement the bounded Queue client and validator**

The Queue token is passed only by the reconciler role. Error objects and logs contain response status, Cloudflare error code, message age, and server IDs, never the bearer token or full object keys.

- [ ] **Step 4: Verify Queue client tests**

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
- Modify: `apps/backend/src/images/upload-cleanup.service.ts`
- Modify: `apps/backend/src/images/upload-cleanup.service.spec.ts`
- Modify: `apps/backend/src/images/image-deletion.service.ts`
- Modify: `apps/backend/src/images/image-deletion.service.spec.ts`
- Modify: `apps/backend/src/images/images.module.ts`
- Modify: `apps/backend/package.json`
- Modify: `package-lock.json`
- Create: `apps/backend/test/image-upload-settlement.integration-spec.ts`

- [ ] **Step 1: Write the complete failing state-matrix tests**

Required cases:

| Session/promotion state                     | Event action                                                                         | Canonical delete |
| ------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------- |
| active finalizing + pending                 | record settlement; owner retains authority                                           | never            |
| stale finalizing + pending + settled        | claim new token and finalize after matching HEAD                                     | never            |
| stale finalizing + pending + no event       | after grace: matching destination waits; absent destination retries create-only COPY | never            |
| consumed or committed                       | record settlement and ACK                                                            | never            |
| failed/expired/abandoned + cleanup_required | matching HEAD, delete, final absent HEAD                                             | allowed          |
| unmatched or malformed                      | retry, then DLQ                                                                      | never            |
| duplicate providerEventId                   | deduplicate evidence, re-read state, and execute the matching row above              | state-dependent  |

Also cover event-before-commit, event-after-consumed, normal success without DLQ growth, crash after durable dispatch before HTTP with the temporary source still present, create-only retry from persisted inspected facts, HTTP 412 recovery, process restart after DB commit before ACK, quoted HEAD versus unquoted event ETag, true destination ETag mismatch, source-key mismatch, DeleteObject timeout, legitimate committed-result deletion, and reclaim loser. Add explicit restart/idempotency tests for each of the four bounded loops: Queue settlement, promotion recovery, temporary-session cleanup, and `ImageObjectDeletion`.

- [ ] **Step 2: Run focused tests and observe failure**

```powershell
npm test --workspace=backend -- r2-copy-settlement.service.spec.ts image-upload-reconciler.service.spec.ts upload-cleanup.service.spec.ts image-deletion.service.spec.ts --runInBand
npm run test:integration --workspace=backend -- image-upload-settlement.integration-spec.ts
```

Expected: FAIL before settlement and reconciliation exist.

- [ ] **Step 3: Implement ack-after-commit settlement**

For each valid event:

1. Find the exact promotion by account, bucket, source key, and destination key.
2. Persist event ID, event ETag, settlement source, timestamp, and `copyState=provider_settled` in a transaction.
3. Apply only the matrix action allowed by current lease and disposition.
4. Commit the database change.
5. ACK the Queue lease.

If step 2–4 fails, retry the message. A `committed` disposition is immutable and always wins over failed-promotion cleanup. Duplicate event identity only reuses the stored provider evidence and then evaluates the current row again. For stale `dispatched` rows without provider settlement, wait the configured event grace period, then HEAD: an exact existing destination waits for its event; an absent destination permits one bounded retry using only the persisted inspected facts, canonical source ETag, destination, metadata, and create-only condition. Increment `dispatchAttempts` before each retry. HTTP 412 waits for settlement and never authorizes cleanup.

- [ ] **Step 4: Implement safe cleanup authority**

Only terminal failed/expired/abandoned sessions that never committed can CAS `pending→cleanup_required`, and only when no `Image` references the destination. Failed-promotion deletion requires provider settlement plus matching canonical destination ETag. `verified_deleted` requires a final absent HEAD after DeleteObject. Absence before provider settlement is never sufficient.

A committed result deletion never enters this path. The image-deletion loop requires the exact `ImageObjectDeletion` row plus matching idempotency `resultDeletedAt`, deletes the destination, verifies absence, and terminalizes that deletion record while leaving the promotion `committed`.

- [ ] **Step 5: Install the dedicated PostgreSQL client**

```powershell
npm install --workspace=backend pg@^8 --save
npm install --workspace=backend @types/pg@^8 --save-dev
```

Expected: backend package and lockfile contain explicit `pg` dependencies before the reconciler tests compile; Prisma pool affinity is never used for the session advisory lock.

- [ ] **Step 6: Implement singleton scheduling and alerts**

Use one dedicated `pg.Client`, never a returned Prisma pool connection, to acquire the session advisory lock. Upsert `ImageUploadReconcilerHeartbeat(id='singleton')` with owner/build fingerprints and per-loop completion times through that connection. On connection error, abort every in-flight loop controller and perform no further mutation until a fresh process owns the lock.

While holding the lock, run four independently bounded loops in this order: pull/settle at most 100 Queue messages, scan due promotions, clean expired or failed temporary sessions, and process due `ImageObjectDeletion` rows. One loop failure is recorded and retried but cannot make later work unbounded. Release the lock on graceful shutdown. One-minute cadence, heartbeat freshness within two cadences, 15-minute warning, and one-hour critical age/bytes alerts are explicit.

- [ ] **Step 7: Verify settlement and cleanup tests**

```powershell
npm test --workspace=backend -- r2-copy-settlement.service.spec.ts image-upload-reconciler.service.spec.ts upload-cleanup.service.spec.ts image-deletion.service.spec.ts --runInBand
npm run test:integration --workspace=backend -- image-upload-settlement.integration-spec.ts
```

Expected: all matrix, late-COPY, ack-after-commit, duplicate, DLQ, four-loop restart/idempotency, temporary cleanup, and committed-result deletion tests PASS.

### Task 6: Add production entrypoint and settlement runbook

**Files:**

- Create: `apps/backend/scripts/reconcile-image-uploads.ts`
- Modify: `apps/backend/package.json`
- Create: `docs/runbooks/image-upload-r2-settlement.md`

- [ ] **Step 1: Write the entrypoint contract test**

Assert the script refuses non-reconciler role, obtains the advisory lock on one dedicated PostgreSQL connection, publishes the singleton heartbeat, runs all four bounded loops, aborts all work on lock-connection loss, handles SIGTERM, never boots HTTP routes, and exits nonzero on duplicate lock ownership or invalid Queue/DLQ/R2 configuration.

- [ ] **Step 2: Add the production script**

Register:

```json
{
    "images:uploads:reconcile": "node /app/dist/scripts/reconcile-image-uploads.js"
}
```

- [ ] **Step 3: Document provider configuration and DLQ disposition**

The runbook records Queue/DLQ names and IDs, source consumer ID/type/settings/DLQ binding, DLQ inspection consumer ID/type with no recursive DLQ, event-rule ID/action/prefix, retention, role-specific secrets, a bucket-scoped reconciler R2 credential with Object Read & Write permission for HEAD/COPY/DELETE, pull/ack endpoints for both Queues, dashboards, alert thresholds, pause/resume, DLQ inspect/replay/quarantine/ACK steps, and teardown/readback commands. Provider actions require sanitized operator receipts.

- [ ] **Step 4: Verify compiled entrypoint**

```powershell
npm run build --workspace=backend
node --check apps/backend/dist/scripts/reconcile-image-uploads.js
```

Expected: build and syntax check exit 0.

### Task 7: Stage gate and commit

- [ ] **Step 1: Run complete backend verification**

```powershell
npm test --workspace=backend -- --runInBand
npm run test:e2e --workspace=backend -- --runInBand
npm run test:integration --workspace=backend
npm run build --workspace=backend
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Commit**

```powershell
git add apps/backend docs/runbooks/image-upload-r2-settlement.md package-lock.json
git commit -m "feat(images): add durable copy settlement"
```
