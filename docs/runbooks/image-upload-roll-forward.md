# Image Upload Production Cold Cutover and Roll-Forward

This runbook implements the polling-only production cutover in the canonical image-upload spec. It does not provision or use R2 Event Notifications, Cloudflare Queues, a DLQ, provider-event receipts, or a generic outbox.

## Safety contract

- Run one bounded maintenance window. Stop the old upload generation before starting the new API or reconciler.
- Keep `IMAGE_UPLOAD_PRESIGN_ENABLED=false` through drain, audit, migration, bridge apply, post-bridge backup, and read-only startup checks.
- Never start an old backend, cleanup process, or scheduler after migration. Recover only by deploying a corrected forward build.
- Store backups, receipts, approvals, and dispositions outside the repository with owner-only permissions. Never put credentials, presigned URLs, full object keys, ETags, filenames, or image bytes in evidence.
- Commands that mutate production require the explicit approval named in that section. Preparation and read-only inspection do not authorize migration, R2 deletion, presign enablement, or ingress changes.

## 1. Preparation before maintenance

Record the immutable application image digest, commit, migration checksum, current policy hash, successful CI contexts, staging receipt, deterministic memory-fixture digest, manual browser-memory results, production bucket/CORS readback, exact polling readback (`reconcileGraceMs=30000`, `reconcileCadenceMs=5000`), and four distinct bucket-scoped R2 credential fingerprints.

Require these exact CI contexts:

```text
backend-image-upload
image-upload-packaging
frontend-playwright-chromium
```

The API, reconciler, cutover, and imgproxy R2 fingerprints must all differ. Confirm the production CORS readback has only explicit HTTPS admin origins, method `PUT`, allowed header `Content-Type`, no wildcard, and no exposed header.

An early rehearsal backup is non-authoritative. It cannot authorize audit, migration, or apply.

## 2. Block new uploads and drain old work

This is a production ingress mutation and requires the maintenance-start approval.

1. Block `POST /images/upload-url` at ingress and set old API presign disabled. Verify `503 upload_presign_disabled`.
2. Keep only old confirm, status, and abandon routes during the bounded drain. Stop old scheduled cleanup, deletion, migration, and scheduler jobs.
3. Record the conservative latest outstanding signed-PUT deadline. Use legacy `expiresAt` only when the legacy signer contract proves it equals the signed URL expiry; otherwise use presign-disabled time plus the maximum legacy PUT lifetime. Add configured clock skew.
4. Wait past that deadline and every active confirm/R2/finalization deadline.
5. Block confirm and abandon, stop every old API instance, and verify zero old ready replicas, zero scheduler processes, no lease renewal across two lease cadences, no in-flight R2 mutation, and a late-PUT canary that cannot mutate R2.

Never restart an old process after this point.

## 3. Authoritative quiesced backup

This production database backup requires the backup approval.

Create one encrypted full logical backup after all old writers are quiesced. Include schema, data, migration history, and required ownership/role metadata. Restore it into a disposable PostgreSQL instance; verify `Image`/`ImageUpload` counts and digests; then destroy the restore.

Write the protected backup receipt and a distinct protected approval. Bind both canonical path hashes, receipt/approval digests, ciphertext digest, database identity digest, restore evidence, operator fingerprint, and quiesced time. The quiesced time is the conservative outstanding-PUT deadline used by the bridge.

## 4. Pre-migration read-only audit

Audit is database- and R2-object-read-only. It may run after the authoritative backup approval, but it does not authorize migration.

```powershell
$env:IMAGE_UPLOAD_PROCESS_ROLE = "cutover"
$env:IMAGE_UPLOAD_PRESIGN_ENABLED = "false"

$auditReceipt = $env:IMAGE_UPLOAD_CUTOVER_AUDIT_RECEIPT
$auditApproval = $env:IMAGE_UPLOAD_CUTOVER_AUDIT_APPROVAL
$backupReceipt = $env:IMAGE_UPLOAD_QUIESCED_BACKUP_RECEIPT
$backupApproval = $env:IMAGE_UPLOAD_QUIESCED_BACKUP_APPROVAL
$dispositions = @()

$auditArgs = @(
  "/app/dist/scripts/image-upload-cutover.js", "audit",
  "--receipt", $auditReceipt,
  "--backup-receipt", $backupReceipt,
  "--backup-approval", $backupApproval
)
foreach ($path in $dispositions) { $auditArgs += @("--disposition", $path) }
node @auditArgs
```

The command always writes a protected diagnostic receipt. It exits nonzero while any row remains `legacy_ambiguous`. Audit selects only legacy-schema columns, reads exact `Image` references and R2 HEAD evidence, and performs no database write or R2 PUT/COPY/DELETE.

For each reported ambiguous row, independently inspect sanitized evidence and create exactly one disposition:

```powershell
node /app/dist/scripts/image-upload-cutover.js disposition `
  --audit-receipt $auditReceipt `
  --upload-id $env:IMAGE_UPLOAD_LEGACY_DISPOSITION_UPLOAD_ID `
  --decision $env:IMAGE_UPLOAD_LEGACY_DISPOSITION_DECISION `
  --evidence-receipt $env:IMAGE_UPLOAD_LEGACY_DISPOSITION_EVIDENCE `
  --output $env:IMAGE_UPLOAD_LEGACY_DISPOSITION_OUTPUT `
  --operator-fingerprint $env:IMAGE_UPLOAD_OPERATOR_FINGERPRINT
```

The decision is closed to `committed_authorized | cleanup_authorized`. Append every distinct output path to `$dispositions`, rerun audit with repeated `--disposition` arguments, and require `unresolvedAmbiguous=0`. Then independently review the canonical audit hash and create its distinct approval:

```powershell
node /app/dist/scripts/image-upload-cutover.js approve `
  --receipt $auditReceipt `
  --approval $auditApproval
```

Any path, digest, ACL, backup, disposition, row, Image, source HEAD, or destination HEAD drift invalidates approval and keeps maintenance active.

## 5. Migration and one-shot apply

Migration and apply mutate production and require a separate migration/apply approval referencing the exact zero-ambiguity audit and authoritative backup.

```powershell
npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma
npx prisma validate --schema apps/backend/prisma/schema.prisma

$applyArgs = @(
  "/app/dist/scripts/image-upload-cutover.js", "apply",
  "--receipt", $auditReceipt,
  "--approval", $auditApproval,
  "--backup-receipt", $backupReceipt,
  "--backup-approval", $backupApproval
)
foreach ($path in $dispositions) { $applyArgs += @("--disposition", $path) }
node @applyArgs
```

Apply must preflight the migrated schema before any R2 mutation. It terminalizes proven pre-dispatch rows as `failed/upload_cutover_aborted` without a promotion, preserves exact existing Image authority, creates a committed `legacy_bridge` only from exact dispatch/destination evidence and a pre-existing Image, writes compact idempotency evidence for committed bridges, enters durable temporary cleanup before DELETE, uses bounded quoted `If-Match`, and requires final absent HEAD.

Rerun apply with the same evidence until all retained temporary sources are absent. Never change or replace an approved receipt to force progress.

## 6. Post-bridge backup and two polling snapshots

Create and restore-verify a second encrypted full backup after bridge completion. It must differ from the pre-migration backup and prove the migrated tables, constraints, bridge rows, deterministic lease tokens, idempotency evidence, and migration history.

Build a sanitized production-gate receipt matching `scripts/schemas/image-upload-production-evidence.schema.json`. Record two complete snapshots at least 30 seconds apart. Both must be zero for:

- active and unterminalized expired uploads;
- unresolved promotions and invalid response/HEAD settlement;
- invalid committed or cleanup authority;
- incomplete/open promotion conflicts;
- due or unverified temporary cleanup;
- unresolved/invalid applicable R2 image deletion and invalid non-R2 disposition;
- legacy terminal and pre-dispatch temporary sources;
- production CORS mismatch.

Also require backup/disposition mismatches zero, one advisory-lock owner, a five-loop heartbeat no older than two one-minute cadences, actual API process count equal to configuration, and actual process count multiplied by decode permits no greater than two.

Verify the protected receipt and distinct approval:

```powershell
node scripts/verify-image-upload-production-gates.mjs `
  --receipt $env:IMAGE_UPLOAD_PRODUCTION_GATE_RECEIPT `
  --approval $env:IMAGE_UPLOAD_PRODUCTION_GATE_APPROVAL
if ($LASTEXITCODE -ne 0) { throw "production polling gates failed" }
```

## 7. Start only the new generation

Starting the new roles requires the startup approval and a passing production-gate receipt.

1. Start the recorded new API image with role `api` and presign disabled.
2. Start the same release with role `reconciler`, its dedicated PostgreSQL advisory-lock connection, and its separate R2 credential.
3. Verify no old digest runs; cutover credentials are unmounted; API has no reconciler/cutover secret; exactly one reconciler owns the lock; all five loop timestamps advance.
4. Run only read-only health, schema, route, production CORS, pre-existing R2 HEAD, signed imgproxy, serializer/redaction, replica, and heartbeat checks.
5. Deploy/purge the current frontend while general upload ingress remains blocked.

## 8. Operator-only mutating acceptance

Presign enablement is a production mutation and requires the operator-smoke approval. Keep general ingress blocked and allowlist only the authenticated operator smoke identity/path.

Exercise representative browser uploads, fixed absolute presign-expiry retries, allowed and denied browser CORS, response-first settlement, deliberate CopyObject response loss followed by exact destination HEAD settlement in 30–35 seconds, unchanged destination on retry, conflict fail-closed behavior, committed-result deletion, failed-promotion cleanup, temporary cleanup after expiry plus skew, and imgproxy rendering.

Regenerate both zero polling snapshots after smoke. General ingress may open only when the protected production receipt, operator-smoke receipt, exact CI contexts, manual stable-Chrome result, deterministic memory evidence, and roll-forward drill all pass.

## 9. Open general ingress

Opening general upload ingress requires the final ingress approval. Remove the operator-only allowlist only after every gate remains zero across the second 30-second polling barrier. If any gate changes, disable presign and keep ingress closed.

After stable acceptance, add/read back the `uploads/`-only 24-hour lifecycle fallback. Prove `albums/` is excluded.

## 10. Roll-forward incident drill

1. Disable presign on every new API and block general upload ingress.
2. Capture sanitized session, promotion, polling, conflict, object-deletion, replica, role, and heartbeat evidence.
3. Keep a new reconciler running only while its dedicated lock, five loop timestamps, role secrets, provider readback, and database invariants remain healthy.
4. Fix the new version, build a new immutable digest, and apply only forward-compatible migrations.
5. Start the corrected new API/reconciler with presign disabled; repeat read-only checks.
6. Enable presign only behind operator-only ingress; repeat the complete mutating acceptance and two polling snapshots.
7. Open general ingress only after a new approved production receipt passes.

Never start a prior application generation during this drill.

## Local verifier regression

Fixture mode is test-only and never accepts production paths:

```powershell
$previous = $env:NODE_ENV
try {
  $env:NODE_ENV = "test"
  node scripts/verify-image-upload-production-gates.mjs `
    --fixture scripts/fixtures/image-upload-production-gates/pass.json
  if ($LASTEXITCODE -ne 0) { throw "pass fixture failed" }

  Get-ChildItem scripts/fixtures/image-upload-production-gates/fail/*.json |
    ForEach-Object {
      node scripts/verify-image-upload-production-gates.mjs --fixture $_.FullName
      if ($LASTEXITCODE -eq 0) { throw "fail fixture passed: $($_.Name)" }
    }
} finally {
  if ($null -eq $previous) {
    Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
  } else {
    $env:NODE_ENV = $previous
  }
}
```
