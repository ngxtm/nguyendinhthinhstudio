# Production Cold Cutover and Roll-Forward Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old upload generation during a bounded maintenance window, reconcile retained provider events once, start only the new API/reconciler, and recover from incidents by roll-forward.

**Architecture:** Provider event capture begins before old writers stop. Old API/jobs are then fully quiesced, migration runs, and a one-shot bridge safely disposes retained old sessions while ingress remains closed. No old binary starts after migration.

**Tech Stack:** PostgreSQL, Docker Compose/Dokploy, Cloudflare R2/Queues, imgproxy, GitHub rulesets, PowerShell, Playwright.

---

### Task 1: Implement and test the one-shot cutover bridge

**Files:**

- Create: `apps/backend/scripts/image-upload-cutover.ts`
- Create: `apps/backend/src/images/image-upload-cutover.service.ts`
- Create: `apps/backend/src/images/image-upload-cutover.service.spec.ts`
- Create: `apps/backend/test/image-upload-cutover.integration-spec.ts`
- Modify: `apps/backend/package.json`
- Modify: `apps/backend/Dockerfile`

- [ ] **Step 1: Write failing retained-row classification tests**

With API ingress disabled, cover the pre-migration audit and post-migration apply modes:

- a row with no source ETag, no finalization start, no existing destination, no matching CopyObject event, and no `Image` reference is proven pre-dispatch: terminalize it as `cutover_aborted`, delete only its temporary key, and create no promotion;
- an exact existing `Image.id/r2ObjectKey` match is committed keep authority and is never deleted; create an `origin=legacy_bridge`, `disposition=committed` row plus compact internal idempotency evidence only when exact dispatch/event evidence also exists—otherwise preserve the Image without inventing a promotion;
- `sourceEtag` may be null only for that committed legacy bridge when the existing Image plus a matching provider event prove keep authority; a current or cleanup-authorized promotion with null `sourceEtag` is rejected;
- an exact operator disposition for a proven dispatched legacy row records the source, destination, canonical case-preserving ETag/event evidence, and either committed Image authority or cleanup authority before a `legacy_bridge` is created;
- any source ETag, finalization/consumption evidence, existing destination HEAD, or Queue event without complete exact linkage is `legacy_ambiguous`; one ambiguous row blocks migration and no object is deleted;
- a retained `consumed` row without its exact Image is ambiguous, not automatically committed;
- destination ETag/source-key mismatch is ambiguous, causes no delete, and exits nonzero;
- unmatched or malformed event is retried/DLQed, causes no delete, and exits nonzero;
- a duplicate event reuses evidence and re-enters the current bridge state rather than implying committed;
- restart after database commit before Queue ACK is idempotent;
- the tamper-evident operator receipt contains server IDs, classifications, counts, evidence hashes, and disposition decisions only—never full keys, ETags, or secrets.

- [ ] **Step 2: Run focused tests and observe failure**

```powershell
npm test --workspace=backend -- image-upload-cutover.service.spec.ts --runInBand
npm run test:integration --workspace=backend -- image-upload-cutover.integration-spec.ts
```

Expected: FAIL because the cutover role and bridge do not exist.

- [ ] **Step 3: Implement the cutover role**

Register:

```json
{
    "images:uploads:cutover": "node /app/dist/scripts/image-upload-cutover.js"
}
```

The command requires:

```text
IMAGE_UPLOAD_PROCESS_ROLE=cutover
IMAGE_UPLOAD_PRESIGN_ENABLED=false
explicit maintenance receipt path
exact Queue/DLQ/consumer/rule identities
cutover R2 and Queue credentials
```

It refuses to run while any API health endpoint reports presign enabled, any old/new upload writer is live, or the receipt points inside the repository.

- [ ] **Step 4: Implement bounded bridge reconciliation**

Run `images:uploads:cutover audit` before migration. It reads every retained row, exact Image references, destination HEAD results, and captured Queue events; it retries rather than ACKs audit-pulled messages, writes the tamper-evident receipt outside the repository, and exits nonzero unless `legacyAmbiguousCount=0`. Proven pre-dispatch rows receive temporary-key cleanup only and no promotion.

After migration, run `images:uploads:cutover apply --receipt $receiptPath` using the same verified receipt path. It re-reads all database/provider evidence, rejects receipt drift, creates `legacy_bridge` records only for exact committed or operator-disposed dispatch evidence, then waits up to the recorded Queue visibility timeout to re-pull every audit-retried event and ACKs each only after its database transaction commits. A receipt hash alone never substitutes for redelivered provider settlement. It never accepts HTTP requests, invents provider settlement, creates a new Image for an unfinished old session, or deletes an unmatched destination.

- [ ] **Step 5: Verify bridge tests**

```powershell
npm test --workspace=backend -- image-upload-cutover.service.spec.ts --runInBand
npm run test:integration --workspace=backend -- image-upload-cutover.integration-spec.ts
npm run build --workspace=backend
node --check apps/backend/dist/scripts/image-upload-cutover.js
docker build -f apps/backend/Dockerfile .
```

Expected: pre-dispatch/no-promotion, committed legacy bridge, nullable-ETag restriction, ambiguity blocking, no-delete, receipt-drift, replay, compiled-entrypoint, and backend-image tests PASS. The Docker builder and final runner both assert `/app/dist/scripts/image-upload-cutover.js` exists.

### Task 2: Write the production runbook and machine-checkable gates

**Files:**

- Create: `docs/runbooks/image-upload-roll-forward.md`
- Create: `scripts/verify-image-upload-production-gates.mjs`
- Create: `scripts/fixtures/image-upload-production-gates-pass.json`
- Create: `scripts/fixtures/image-upload-production-gates-fail.json`
- Modify: `package.json`

- [ ] **Step 1: Define the sanitized preflight input**

The verifier consumes a JSON receipt with:

```text
new image digest and commit
policy hash and exact policy values
database backup receipt
API/reconciler/cutover process-role fingerprints
actual ready replica/process counts
Queue/DLQ names and IDs
source and DLQ inspection consumer IDs/types/settings
event rule ID/action/prefix
R2 bucket and endpoint identity
ruleset ID and exact required contexts: backend-image-upload, image-upload-packaging, frontend-playwright-chromium, frontend-stable-chrome, frontend-image-memory
deterministic memory-fixture digest and benchmark summary
staging acceptance receipt
```

It rejects secrets, presigned URLs, full keys, or image bytes in the receipt.

- [ ] **Step 2: Add exact SQL gates**

Before migration, enumerate database-evidenced legacy ambiguity:

```sql
SELECT u.id, u.status
FROM "ImageUpload" u
WHERE NOT EXISTS (
        SELECT 1 FROM "Image" i
        WHERE i."r2ObjectKey" = u."finalObjectKey"
      )
  AND (
        u."sourceEtag" IS NOT NULL
        OR u."finalizationStartedAt" IS NOT NULL
        OR u."consumedAt" IS NOT NULL
      )
ORDER BY u.id;
```

The audit must compare this exact ID set with destination HEAD and Queue-event readback, record an explicit operator disposition for every candidate, and emit `legacyAmbiguousCount=0`. A zero SQL row count alone is insufficient because destination/event evidence can exist outside PostgreSQL.

After migration, require zero active uploads:

```sql
SELECT COUNT(*) AS active_uploads
FROM "ImageUpload"
WHERE status = 'finalizing'
   OR (status = 'pending' AND "expiresAt" > NOW());
```

Require zero unresolved promotions:

```sql
SELECT COUNT(*) AS unresolved_promotions
FROM "ImageUploadPromotion"
WHERE disposition IN ('pending', 'cleanup_required')
   OR "copyState" <> 'provider_settled';
```

Require zero invalid committed/deletion authority. A committed promotion is valid either through its exact live Image or through the exact permanent idempotency deletion tombstone plus durable deleted object record:

```sql
SELECT COUNT(*) AS invalid_promotion_authority
FROM "ImageUploadPromotion" p
WHERE (
        p.disposition = 'committed'
        AND NOT (
          EXISTS (
            SELECT 1 FROM "Image" i
            WHERE i.id = p."committedResultImageId"
              AND i."r2ObjectKey" = p."destinationObjectKey"
          )
          OR (
            EXISTS (
              SELECT 1 FROM "ImageUploadIdempotency" idem
              WHERE idem."resultImageId" = p."committedResultImageId"
                AND idem."resultDeletedAt" IS NOT NULL
            )
            AND EXISTS (
              SELECT 1 FROM "ImageObjectDeletion" d
              WHERE d."imageId" = p."committedResultImageId"
                AND d."objectKey" = p."destinationObjectKey"
                AND d.status = 'deleted'
                AND d."deletedAt" IS NOT NULL
            )
          )
        )
      )
   OR (
        p.disposition IN ('cleanup_required', 'verified_deleted')
        AND (
          p."committedResultImageId" IS NOT NULL
          OR EXISTS (
            SELECT 1 FROM "Image" i
            WHERE i."r2ObjectKey" = p."destinationObjectKey"
          )
        )
      );
```

Require zero pending or failed user-deletion work:

```sql
SELECT COUNT(*) AS unresolved_image_object_deletions
FROM "ImageObjectDeletion"
WHERE status <> 'deleted'
   OR "deletedAt" IS NULL;
```

Every zero gate and its sanitized readback must be recorded twice when the runbook says “twice”.

- [ ] **Step 3: Verify actual fleet decode budget**

Read actual ready API replicas and Node worker count from Dokploy/Compose/runtime health. Require:

```text
actual process count = IMAGE_UPLOAD_PROCESS_COUNT
actual process count × permits per process <= 2
exactly one reconciler advisory-lock owner on a dedicated `pg.Client` connection
singleton heartbeat age <= two one-minute cadences
all four per-loop completion timestamps are present and advancing
```

A declared environment value alone is not evidence.

- [ ] **Step 4: Verify GitHub and provider readbacks**

Fetch the ruleset by ID and require exactly the five contexts `backend-image-upload`, `image-upload-packaging`, `frontend-playwright-chromium`, `frontend-stable-chrome`, and `frontend-image-memory`, with active enforcement and no bypass. Fetch both Queue consumers and the event rule, not only the Queue resources. Require source-to-DLQ name binding, retry settings, retention, visibility timeout, a DLQ inspection consumer with no recursive DLQ, action `CopyObject`, prefix `albums/`, and zero DLQ before proceeding. Read back role-separated R2 identities and actively prove the reconciler credential has bucket-scoped Object Read & Write for HEAD/COPY/DELETE without sharing the API credential.

- [ ] **Step 5: Run the verifier against fixtures**

```powershell
node scripts/verify-image-upload-production-gates.mjs scripts/fixtures/image-upload-production-gates-pass.json
node scripts/verify-image-upload-production-gates.mjs scripts/fixtures/image-upload-production-gates-fail.json
```

Expected: pass fixture exits 0; fail fixture exits nonzero with the exact failed gate.

### Task 3: Prepare provider resources before maintenance

**Files:**

- Modify: `docs/runbooks/image-upload-roll-forward.md`

- [ ] **Step 1: Record backup and immutable build evidence**

Create an encrypted operator-only backup of `Image`, `ImageUpload`, `ImageUploadIdempotency`, `ImageUploadPromotion`, and `ImageObjectDeletion`. Record the new Docker digest/commit and migration checksum. Backup is disaster recovery evidence, not permission to restart the old application.

- [ ] **Step 2: Provision and read back settlement resources**

Before blocking uploads, create/read back:

- production Queue name and ID;
- distinct DLQ name and ID;
- source HTTP-pull consumer ID with `type=http_pull`;
- source consumer DLQ name, max retries, retry delay, batch size, and visibility timeout;
- DLQ inspection HTTP-pull consumer ID with no recursive DLQ binding;
- at least 24-hour retention;
- R2 notification rule with action exactly `CopyObject` and prefix exactly `albums/`;
- Queue read/write runtime token and separate operator provisioning token;
- a separate bucket-scoped reconciler R2 Object Read & Write credential for HEAD/COPY/DELETE.

The API must not receive either Queue or operator token and must not share its R2 credential with the reconciler. The reconciler receives only its Queue runtime token and dedicated R2 credential, never the operator token. Failure to prove every required resource and role boundary is present and correctly bound aborts maintenance.

- [ ] **Step 3: Prove the required CI rules**

Run the ruleset verifier by ID and store the sanitized result proving all five required contexts. Also require the `frontend-image-memory` receipt to reference the deterministic generated fixture digest; `0W9A1500.jpg` is optional local visual evidence and cannot satisfy this gate. A list-only response or unhandled branch-protection 404 is insufficient.

### Task 4: Execute the serial maintenance cutover

**Files:**

- Modify: `docs/runbooks/image-upload-roll-forward.md`

- [ ] **Step 1: Block new upload creation**

Set the ingress maintenance rule for `POST /images/upload-url` and verify HTTP 503 `upload_presign_disabled`. Leave already-started confirm/status/abandon available for one maximum confirm deadline.

- [ ] **Step 2: Stop old scheduled mutations while events collect**

Stop the old upload cleanup, image deletion, migration, and scheduler jobs. Keep only the old API confirm path during the bounded drain. Verify the newly provisioned Queue is receiving CopyObject events.

- [ ] **Step 3: Stop every old writer**

After the deadline, block confirm/abandon and stop every old backend/API instance. Verify zero ready old replicas, zero old scheduler processes, closed old health endpoints, and no active database lease renewal. Do not start an old process again.

- [ ] **Step 4: Audit and classify every legacy row before migration**

```powershell
$env:IMAGE_UPLOAD_PROCESS_ROLE = "cutover"
$env:IMAGE_UPLOAD_PRESIGN_ENABLED = "false"
$receiptPath = Join-Path $env:TEMP "ndt-image-upload-cutover-receipt.json"
node /app/dist/scripts/image-upload-cutover.js audit --receipt $receiptPath
node scripts/verify-image-upload-production-gates.mjs --cutover-audit $receiptPath
```

Expected: the SQL candidate set, exact Image references, destination HEAD readback, and retried Queue-event evidence agree; `legacyAmbiguousCount=0`; proven pre-dispatch rows authorize temporary-key cleanup only; no promotion exists yet. Any ambiguous row, receipt drift, ACK during audit, or provider mismatch keeps maintenance active and blocks migration.

- [ ] **Step 5: Apply the migration**

```powershell
npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma
npx prisma validate --schema apps/backend/prisma/schema.prisma
```

Expected: both commands exit 0 while all API ingress remains closed and the verified audit receipt remains unchanged.

- [ ] **Step 6: Apply the one-shot bridge receipt**

```powershell
node /app/dist/scripts/image-upload-cutover.js apply --receipt $receiptPath
```

Expected: pre-dispatch rows receive no promotion; exact existing Image authority is preserved and becomes a committed `legacy_bridge` only with exact dispatch/event evidence; only exact operator-disposed dispatch evidence can create cleanup authority; every audit-retried event is re-pulled and reaches an explicit committed/cleaned/DLQ disposition before the command exits.

- [ ] **Step 7: Require zero maintenance gates**

Run active-upload, unresolved-promotion, invalid-authority, unresolved-`ImageObjectDeletion`, Queue backlog, and DLQ checks. Require all zero twice, separated by one Queue visibility timeout. Also require `legacyAmbiguousCount=0` and zero promotion rows for every pre-dispatch receipt entry. Any unmatched event, missing provider readback, stale receipt, or nonzero gate keeps maintenance active.

### Task 5: Start only the new generation

**Files:**

- Modify: `docs/runbooks/image-upload-roll-forward.md`

- [ ] **Step 1: Start API and reconciler with presign disabled**

Deploy the recorded new image digest. Start `backend` with role `api` and `images-upload-reconciler` with role `reconciler`. Require one API process with two permits for the initial rollout, exactly one advisory-lock owner on its dedicated `pg.Client`, a heartbeat newer than two cadences, and advancing completion timestamps for Queue settlement, promotion recovery, temporary-session cleanup, and `ImageObjectDeletion`. No old image digest may be running.

- [ ] **Step 2: Verify process roles and secret isolation**

Read sanitized fingerprints and container secret mounts. Prove the API has no Queue/operator token, the reconciler has only its Queue token plus separate bucket-scoped R2 Object Read & Write credential, neither runtime role has the operator token, API/reconciler R2 credentials differ, and cutover credentials are no longer mounted.

- [ ] **Step 3: Run presign-disabled read-only checks**

While presign is disabled and general upload ingress remains blocked, verify health, schema, policy, maintenance 503, non-enumerating status/abandon authorization, provider configuration readbacks, HEAD of a pre-existing operator canary, Queue/DLQ depth, notification rule, signed imgproxy read variants, heartbeat/loop freshness, and serializer/log redaction. Do not PUT, COPY, DELETE, create an upload session, synthesize a Queue event, or ACK a smoke message in this phase.

- [ ] **Step 4: Deploy/purge the current frontend with ingress closed**

Deploy the new frontend, purge/expire old CDN assets and service workers, and verify its current bounded request shape from a non-mutating contract probe. Old shapes must receive `policy_refresh_required`; they are never translated. General upload ingress remains blocked.

- [ ] **Step 5: Enable presign behind operator-only smoke ingress**

Enable `IMAGE_UPLOAD_PRESIGN_ENABLED=true` on every API instance and verify the readback, but allowlist only the authenticated operator smoke identity/path at ingress. Run portrait, high-detail, dark/noisy, PNG, orientation, ICC, cancellation, response-loss, retry, late-COPY, canonical quoted/unquoted ETag, durable-promotion recovery, duplicate-event state-matrix, failed-promotion cleanup, and legitimate committed-result deletion cases.

Require:

- canonical bytes <= 5 MiB and exact digest;
- one Image and one promotion per current upload;
- every current dispatch has persisted digest, bytes, MIME, dimensions, policy, canonical source ETag, destination, and lease before COPY;
- promotion `provider_settled + committed` remains committed after legitimate result deletion;
- user deletion is backed by matching idempotency tombstone plus `ImageObjectDeletion`, never `cleanup_required`;
- all four reconciler loops survive restart and remain idempotent;
- imgproxy variants render;
- source Queue, DLQ, unresolved promotion, invalid authority, and image-deletion backlog return zero;
- no sensitive logs;
- three browser benchmark contexts pass absolute and relative memory gates using the deterministic generated fixture, never `0W9A1500.jpg`.

- [ ] **Step 6: Open general upload ingress**

Record the operator-only acceptance receipt, repeat every zero gate after one Queue visibility timeout, verify the five required CI contexts on the deployed commit, and only then remove the operator allowlist/open general upload ingress. If any gate changes, disable presign and keep ingress closed.

- [ ] **Step 7: Add the uploads lifecycle fallback**

After general ingress is open and all active/promotion/Queue/object-deletion gates remain zero, add/read back a 24-hour lifecycle rule for `uploads/` only. Verify `albums/` is excluded.

### Task 6: Drill roll-forward incident recovery

**Files:**

- Modify: `docs/runbooks/image-upload-roll-forward.md`

- [ ] **Step 1: Simulate a new-version failure**

Disable presign on every API instance and block ingress. Do not deploy the old frontend or old backend. Capture sanitized active-upload, promotion, Queue/DLQ, role, replica, and heartbeat evidence.

- [ ] **Step 2: Preserve only proven-safe background work**

Keep status/reconciliation/cleanup running only if role health, the dedicated advisory-lock connection, singleton heartbeat, all four bounded-loop timestamps, role-separated R2/Queue credentials, provider readback, and database invariants pass. Otherwise stop the affected new role while retaining Queue messages.

- [ ] **Step 3: Deploy a corrected forward image**

Build a new immutable digest, apply only forward-compatible migrations, and start the corrected new API/reconciler with presign disabled. Rerun only the presign-disabled read-only checks first; do not PUT/COPY/DELETE or generate Queue events while general ingress is blocked.

- [ ] **Step 4: Run mutating acceptance behind operator-only ingress**

Enable presign only after read-only checks pass, keep general ingress blocked, allowlist the authenticated operator smoke identity/path, and rerun the complete upload/Queue/cleanup/imgproxy acceptance suite with the deterministic generated memory fixture. Require zero invalid authority, zero unresolved critical promotions, zero Queue/DLQ, zero unresolved `ImageObjectDeletion`, healthy dedicated lock/heartbeat/four-loop progress, correct actual replica budget, and all five required CI contexts.

- [ ] **Step 5: Reopen general ingress**

Repeat the zero gates after one Queue visibility timeout, record the corrected-build receipt, and only then remove the operator allowlist. Any regression disables presign and keeps general ingress blocked.

Expected: incident recovery completes without starting any prior application generation.

### Task 7: Capture acceptance evidence and commit the runbook

- [ ] **Step 1: Store sanitized evidence**

Store counts, policy hash, image digest, migration checksum, ruleset-by-ID result for all five contexts, provider resource/consumer/rule readbacks, role-separated R2 credential fingerprints, dedicated lock owner and four-loop heartbeat evidence, actual replica count, deterministic-fixture digest, benchmark summaries, operator-only smoke results, bridge audit/apply receipt, and roll-forward drill decision.

- [ ] **Step 2: Run final documentation checks**

```powershell
node scripts/verify-image-upload-production-gates.mjs
git diff --check
git status --short
```

Expected: every required receipt is present, no destructive provider action lacks an operator receipt, and only planned files are changed.

- [ ] **Step 3: Commit**

```powershell
git add apps/backend/scripts/image-upload-cutover.ts apps/backend/src/images/image-upload-cutover.service.ts apps/backend/src/images/image-upload-cutover.service.spec.ts apps/backend/test/image-upload-cutover.integration-spec.ts apps/backend/package.json apps/backend/Dockerfile docs/runbooks/image-upload-roll-forward.md scripts/verify-image-upload-production-gates.mjs scripts/fixtures package.json
git commit -m "docs(images): add cold cutover and roll-forward gates"
```
