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

With API ingress disabled, cover:

- queued event plus an existing `Image.r2ObjectKey` reference: create/mark committed settlement and never delete;
- retained consumed upload with the same final key: committed and ACK;
- retained pending/finalizing/failed upload with no Image reference: mark `failureCode=cutover_aborted`, create cleanup authority, settle matching event, delete exact destination, verify absent, and ACK;
- destination ETag mismatch: no delete and nonzero exit;
- unmatched event: no delete, retry/DLQ, and nonzero exit;
- duplicate event: one bridge record and stable disposition;
- restart after DB commit before Queue ACK: idempotent replay;
- operator receipt contains IDs/counts only.

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

The bridge processes only retained rows and Queue events captured for the maintenance window. It never accepts HTTP requests and never creates a new image for an unfinished old session. Existing `Image.r2ObjectKey` is keep authority; otherwise exact event/promotion evidence plus no Image reference is required for deletion.

- [ ] **Step 5: Verify bridge tests**

```powershell
npm test --workspace=backend -- image-upload-cutover.service.spec.ts --runInBand
npm run test:integration --workspace=backend -- image-upload-cutover.integration-spec.ts
npm run build --workspace=backend
node --check apps/backend/dist/scripts/image-upload-cutover.js
docker build -f apps/backend/Dockerfile .
```

Expected: classification, no-delete, replay, compiled-entrypoint, and backend-image tests PASS. The Docker builder and final runner both assert `/app/dist/scripts/image-upload-cutover.js` exists.

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
ruleset ID and exact required contexts
staging acceptance receipt
```

It rejects secrets, presigned URLs, full keys, or image bytes in the receipt.

- [ ] **Step 2: Add exact SQL gates**

Active uploads:

```sql
SELECT COUNT(*) AS active_uploads
FROM "ImageUpload"
WHERE status = 'finalizing'
   OR (status = 'pending' AND "expiresAt" > NOW());
```

Unresolved promotions:

```sql
SELECT COUNT(*) AS unresolved_promotions
FROM "ImageUploadPromotion"
WHERE disposition IN ('pending', 'cleanup_required')
   OR "copyState" <> 'provider_settled';
```

Invalid committed/deletion authority:

```sql
SELECT COUNT(*) AS invalid_promotion_authority
FROM "ImageUploadPromotion" p
WHERE (p.disposition = 'committed' AND NOT EXISTS (
        SELECT 1 FROM "Image" i
        WHERE i."r2ObjectKey" = p."destinationObjectKey"
      ))
   OR (p.disposition IN ('cleanup_required', 'verified_deleted') AND EXISTS (
        SELECT 1 FROM "Image" i
        WHERE i."r2ObjectKey" = p."destinationObjectKey"
      ));
```

Every gate must be zero where specified and recorded twice when the runbook says “twice”.

- [ ] **Step 3: Verify actual fleet decode budget**

Read actual ready API replicas and Node worker count from Dokploy/Compose/runtime health. Require:

```text
actual process count = IMAGE_UPLOAD_PROCESS_COUNT
actual process count × permits per process <= 2
exactly one reconciler advisory-lock owner
```

A declared environment value alone is not evidence.

- [ ] **Step 4: Verify GitHub and provider readbacks**

Fetch the ruleset by ID and validate exact rules. Fetch both Queue consumers and the event rule, not only the Queue resources. Require source-to-DLQ name binding, retry settings, retention, visibility timeout, a DLQ inspection consumer with no recursive DLQ, action `CopyObject`, prefix `albums/`, and zero DLQ before proceeding.

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
- Queue read/write runtime token and separate operator provisioning token.

The API must not receive either Queue or operator token. The reconciler receives only the Queue runtime token. Failure to prove every required resource is present and correctly bound aborts maintenance.

- [ ] **Step 3: Prove the required CI rules**

Run the ruleset verifier by ID and store the sanitized result. A list-only response or unhandled branch-protection 404 is insufficient.

### Task 4: Execute the serial maintenance cutover

**Files:**

- Modify: `docs/runbooks/image-upload-roll-forward.md`

- [ ] **Step 1: Block new upload creation**

Set the ingress maintenance rule for `POST /images/upload-url` and verify HTTP 503 `upload_presign_disabled`. Leave already-started confirm/status/abandon available for one maximum confirm deadline.

- [ ] **Step 2: Stop old scheduled mutations while events collect**

Stop the old upload cleanup, image deletion, migration, and scheduler jobs. Keep only the old API confirm path during the bounded drain. Verify the newly provisioned Queue is receiving CopyObject events.

- [ ] **Step 3: Stop every old writer**

After the deadline, block confirm/abandon and stop every old backend/API instance. Verify zero ready old replicas, zero old scheduler processes, closed old health endpoints, and no active database lease renewal. Do not start an old process again.

- [ ] **Step 4: Apply the migration**

```powershell
npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma
npx prisma validate --schema apps/backend/prisma/schema.prisma
```

Expected: both commands exit 0 while all API ingress remains closed.

- [ ] **Step 5: Run the one-shot bridge**

```powershell
$env:IMAGE_UPLOAD_PROCESS_ROLE = "cutover"
$env:IMAGE_UPLOAD_PRESIGN_ENABLED = "false"
node /app/dist/scripts/image-upload-cutover.js
```

Expected: retained unfinished old sessions become `cutover_aborted` and safely clean up; existing Image references are preserved; every captured event has an explicit committed/cleaned/DLQ disposition.

- [ ] **Step 6: Require zero maintenance gates**

Run active-upload, unresolved-promotion, invalid-authority, Queue backlog, and DLQ checks. Require all zero twice, separated by one Queue visibility timeout. Any unmatched event, missing provider readback, or nonzero gate keeps maintenance active.

### Task 5: Start only the new generation

**Files:**

- Modify: `docs/runbooks/image-upload-roll-forward.md`

- [ ] **Step 1: Start API and reconciler with presign disabled**

Deploy the recorded new image digest. Start `backend` with role `api` and `images-upload-reconciler` with role `reconciler`. Require one API process with two permits for the initial rollout and exactly one advisory-lock owner. No old image digest may be running.

- [ ] **Step 2: Verify process roles and secret isolation**

Read sanitized fingerprints and container secret mounts. Prove the API has no Queue/operator token, reconciler has no operator token, and cutover credentials are no longer mounted.

- [ ] **Step 3: Run presign-disabled route and provider smoke**

Verify health, schema, policy, maintenance 503, status/abandon authorization, R2 PUT/HEAD/COPY/DELETE, Queue event settlement, duplicate ACK behavior, DLQ zero, notification rule, signed imgproxy variants, and serializer/log redaction.

- [ ] **Step 4: Deploy/purge the current frontend**

Deploy the new frontend, purge/expire old CDN assets and service workers, and verify every presign request contains the current bounded request shape. Old shapes must receive `policy_refresh_required`; they are never translated.

- [ ] **Step 5: Enable presign and run acceptance uploads**

Enable `IMAGE_UPLOAD_PRESIGN_ENABLED=true` on every API instance, verify the readback, then open ingress. Upload portrait, high-detail, dark/noisy, PNG, orientation, ICC, cancellation, response-loss, retry, and late-COPY fixtures.

Require:

- canonical bytes <= 5 MiB and exact digest;
- one Image and one promotion per upload;
- promotion `provider_settled + committed`;
- imgproxy variants render;
- source Queue and DLQ return zero;
- no unresolved cleanup or sensitive logs;
- three browser benchmark contexts pass absolute and relative memory gates.

- [ ] **Step 6: Add the uploads lifecycle fallback**

After all active/promotion/Queue gates remain zero, add/read back a 24-hour lifecycle rule for `uploads/` only. Verify `albums/` is excluded.

### Task 6: Drill roll-forward incident recovery

**Files:**

- Modify: `docs/runbooks/image-upload-roll-forward.md`

- [ ] **Step 1: Simulate a new-version failure**

Disable presign on every API instance and block ingress. Do not deploy the old frontend or old backend. Capture sanitized active-upload, promotion, Queue/DLQ, role, replica, and heartbeat evidence.

- [ ] **Step 2: Preserve only proven-safe background work**

Keep status/reconciliation/cleanup running only if role health, singleton ownership, provider readback, and database invariants pass. Otherwise stop the affected new role while retaining Queue messages.

- [ ] **Step 3: Deploy a corrected forward image**

Build a new immutable digest, apply only forward-compatible migrations, start the corrected new API/reconciler with presign disabled, and rerun the complete smoke gates.

- [ ] **Step 4: Re-enable only after clean disposition**

Require zero invalid authority, zero unresolved critical promotions, zero Queue/DLQ, healthy singleton, correct actual replica budget, and successful uploads before reopening.

Expected: incident recovery completes without starting any prior application generation.

### Task 7: Capture acceptance evidence and commit the runbook

- [ ] **Step 1: Store sanitized evidence**

Store counts, policy hash, image digest, migration checksum, ruleset-by-ID result, provider resource/consumer/rule readbacks, process-role fingerprints, actual replica count, benchmark summaries, smoke results, bridge receipt, and roll-forward drill decision.

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
