# Image Upload Production Cold Cutover and Roll-Forward

This runbook implements the polling-only production cutover in the canonical image-upload spec. It does not provision or use R2 Event Notifications, Cloudflare Queues, a DLQ, provider-event receipts, or a generic outbox.

## Safety contract

- Run one bounded maintenance window. Stop the old upload generation before starting the new API or reconciler.
- Keep `IMAGE_UPLOAD_PRESIGN_ENABLED=false` through drain, audit, migration, bridge apply, post-bridge backup, and read-only startup checks.
- Never start an old backend, cleanup process, or scheduler after migration. Recover only by deploying a corrected forward build.
- Store backups, receipts, approvals, and dispositions outside the repository with owner-only permissions. Never put credentials, presigned URLs, full object keys, ETags, filenames, or image bytes in evidence.
- Commands that mutate production require the explicit approval named in that section. Preparation and read-only inspection do not authorize migration, R2 deletion, presign enablement, or ingress changes.

## 1. Preparation before maintenance

Record the planned immutable image reference, exact merged commit, migration checksum, current policy hash, successful CI contexts, staging receipt, production bucket/CORS readback, exact polling readback (`reconcileGraceMs=30000`, `reconcileCadenceMs=5000`), four distinct bucket-scoped R2 data-plane credential fingerprints, and the distinct temporary production R2 Admin Read Only config-credential fingerprint. The actual Docker image ID and image commit label are post-build evidence collected after startup.

The deterministic fixture, pinned stable Chrome, and memory thresholds remain an optional memory diagnostic. They are not CI, Phase 1, Phase 2, smoke, drill, or ingress gates. Missing optional diagnostic results do not block admission.

Require these exact CI contexts:

```text
backend-image-upload
image-upload-packaging
frontend-playwright-chromium
```

The API, reconciler, cutover, and imgproxy R2 data-plane fingerprints must all differ. The temporary config-read fingerprint must differ from all four and is supplied only to the cutover container as `IMAGE_UPLOAD_CUTOVER_R2_CONFIG_READ_ACCESS_KEY_ID`/`IMAGE_UPLOAD_CUTOVER_R2_CONFIG_READ_SECRET_ACCESS_KEY`. Confirm the bucket-scoped cutover credential passes object LIST/HEAD but is denied `GetBucketCors`; confirm the temporary Admin Read Only credential passes `GetBucketCors` and cannot write. Confirm the production CORS readback has only explicit HTTPS admin origins, method `PUT`, allowed header `Content-Type`, no wildcard, and no exposed header.

An early rehearsal backup is non-authoritative. It cannot authorize audit, migration, or apply.

## 2. Establish the no-new-upload boundary and drain old work

The standard path is a production ingress mutation and requires the maintenance-start approval. The approved initial-cutover exception avoids that mutation but still requires a protected maintenance-start evidence record.

Choose exactly one boundary:

1. **Standard:** block every upload-creation route at ingress, set old API presign disabled, and verify `503 upload_presign_disabled`.
2. **Approved initial-cutover exception — `maintenance_route_absent`:** do not provision a new maintenance Worker/rule. Record that the public frontend is in maintenance mode; inventory every deployed API generation and prove no upload-creation route is registered; run an authenticated admin canary against every known creation path and prove fail-closed behavior with no new upload/session; and prove the route/deployment state remained unchanged for at least the maximum legacy signed-PUT lifetime plus clock skew. Record the start of that stable interval as `presignDisabledAt`. Any missing, reachable, successful, ambiguous, or drifted evidence requires the standard path.

The exception waives only the new ingress Worker/rule. It does not waive the drain deadline, stopping writers, backups, audit, migration approval, new-generation presign-disabled startup, operator smoke, or zero gates.

3. Keep only old confirm, status, and abandon routes during the bounded drain. Stop old scheduled cleanup, deletion, migration, and scheduler jobs.
4. Record the conservative latest outstanding signed-PUT deadline. Use legacy `expiresAt` only when the legacy signer contract proves it equals the signed URL expiry; otherwise use `presignDisabledAt` plus the maximum legacy PUT lifetime. Add configured clock skew.
5. Wait past that deadline and every active confirm/R2/finalization deadline.
6. Block confirm and abandon, stop every old API instance, and verify zero old ready replicas, zero scheduler processes, no lease renewal across two lease cadences, no in-flight R2 mutation, and a late-PUT canary that cannot mutate R2.

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

## 6. Post-bridge backup, pre-deploy snapshots, and startup approval

Create and restore-verify a second encrypted full backup after bridge completion. It must differ from the pre-migration backup and prove the migrated tables, constraints, bridge rows, deterministic lease tokens, idempotency evidence, and migration history.

Record two complete pre-deploy polling snapshots at least 30 seconds apart. Both must be zero for:

- active and unterminalized expired uploads;
- unresolved promotions and invalid response/HEAD settlement;
- invalid committed or cleanup authority;
- incomplete/open promotion conflicts;
- due or unverified temporary cleanup;
- unresolved/invalid applicable R2 image deletion and invalid non-R2 disposition;
- legacy terminal and pre-dispatch temporary sources;
- production CORS mismatch.

Also require backup/disposition mismatches zero. Runtime image, advisory-lock, heartbeat, loop, and replica evidence does not exist yet and must not be invented in this phase.

Create a distinct owner-only startup approval with schema version `image-upload-production-startup-approval/v1`. Bind it to the exact merged commit, recomputed release fingerprint, image reference, migration checksum, zero-ambiguity audit approval, pre/post-backup receipts and approvals, both pre-deploy snapshot digests, operator fingerprint, approval time, `decision=approved`, and `IMAGE_UPLOAD_PRESIGN_ENABLED=false`. This approval authorizes only starting the new generation with presign disabled; it does not authorize a PUT/COPY/DELETE smoke, presign enablement, or ingress opening.

Do not create or verify the complete production-gate receipt yet. Its runtime observations are collected only after startup.

## 7. Start only the new generation and create post-start acceptance

Starting the new roles requires the protected startup approval and all pre-deploy gates above. A complete production-gate receipt is necessarily post-start evidence and is not a startup prerequisite.

Before starting the roles, fetch `origin/main`, prove the checkout is exactly clean merged `main`, and only then derive the release identity:

```sh
git fetch origin main
test "$(git branch --show-current)" = main
test -z "$(git status --porcelain --untracked-files=all)"
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"
RELEASE_COMMIT="$(git rev-parse HEAD)"
IMAGE_UPLOAD_BUILD_FINGERPRINT="$(
  node scripts/image-upload-release-fingerprint.mjs "$RELEASE_COMMIT"
)"
test "$IMAGE_UPLOAD_BUILD_FINGERPRINT" = "$(
  node scripts/image-upload-release-fingerprint.mjs "$(git rev-parse origin/main)"
)"
```

Configure three distinct Dokploy variables for the release:

```text
BACKEND_IMAGE=<unique Docker image reference or release tag>
IMAGE_UPLOAD_RELEASE_COMMIT=<exact lowercase 40-character merged commit>
IMAGE_UPLOAD_BUILD_FINGERPRINT=sha256:<64 lowercase hexadecimal characters>
```

`BACKEND_IMAGE` selects the image Docker runs. `IMAGE_UPLOAD_RELEASE_COMMIT` is
the required Docker build argument stored in the final image label.
`IMAGE_UPLOAD_BUILD_FINGERPRINT` is
the version-1 stable release identity recorded in the reconciler heartbeat. Compute
it from the exact full commit with no trailing newline through the canonical helper:

```sh
printf '%s\n' "RELEASE_COMMIT=$RELEASE_COMMIT"
printf '%s\n' "IMAGE_UPLOAD_RELEASE_COMMIT=$RELEASE_COMMIT"
printf '%s\n' "IMAGE_UPLOAD_BUILD_FINGERPRINT=$IMAGE_UPLOAD_BUILD_FINGERPRINT"
```

Copy the commit build argument and fingerprint into Dokploy before starting the generation. After Dokploy
builds, record `docker image inspect .Id` separately as `release.imageDigest`; do
not copy it into the heartbeat fingerprint. Read the label
`studio.nguyendinhthinh.image-upload.release-commit` from the actual running image.
Record the full commit ID, `BACKEND_IMAGE`, release fingerprint, image label, and
actual image ID with the release evidence.
A corrected source revision gets a new image reference and release fingerprint.
API, migration, and reconciler containers for one deployment must use the same
actual image ID.

1. Start the recorded new API image with role `api` and presign disabled.
2. Start the same release with role `reconciler`, its dedicated PostgreSQL advisory-lock connection, and its separate R2 credential.
3. Verify no old digest runs; the image label equals the exact merged commit; the reconciler environment and database heartbeat equal the recomputed fingerprint; API, migration, and reconciler share one actual image ID; all cutover credentials, including the temporary config-read pair, are unmounted; API has no reconciler/cutover secret; exactly one reconciler owns the lock; all five loop timestamps advance.
4. Run only read-only health, schema, route, production CORS, pre-existing R2 HEAD, signed imgproxy, serializer/redaction, replica, and heartbeat checks.
5. Deploy/purge the current frontend while general upload ingress remains blocked.

Now build the sanitized post-start production-gate receipt matching `scripts/schemas/image-upload-production-evidence.schema.json`. Its closed `release` evidence contains the image reference, actual image ID, image commit label, release commit, and release fingerprint. Its `roles` evidence contains each observed API/migration/reconciler image ID plus the reconciler environment and heartbeat fingerprints. Its top-level `preDeployPollingSnapshotSha256` contains exactly the two distinct snapshot digests approved before deploy. It binds those digests plus the protected startup-approval path/bytes and deliberately contains no later operator-smoke receipt.

Verify the protected post-start receipt and its distinct approval:

```powershell
node scripts/verify-image-upload-production-gates.mjs `
  --receipt $env:IMAGE_UPLOAD_PRODUCTION_GATE_RECEIPT `
  --approval $env:IMAGE_UPLOAD_PRODUCTION_GATE_APPROVAL `
  --startup-approval $env:IMAGE_UPLOAD_PRODUCTION_STARTUP_APPROVAL `
  --staging-receipt $env:IMAGE_UPLOAD_STAGING_RECEIPT
if ($LASTEXITCODE -ne 0) { throw "production polling gates failed" }
```

This is the **Phase 1 post-start approval**. It authorizes only operator-only ingress and smoke; it cannot authorize general ingress and deliberately contains no smoke or drill decision.

## 8. Operator-only mutating acceptance

Presign enablement is a production mutation and requires both the passing protected post-start production receipt/approval and a separate operator-smoke approval. Keep general ingress blocked. Redeploy only the API with `IMAGE_UPLOAD_PRESIGN_ENABLED=true`, `IMAGE_UPLOAD_INGRESS_MODE=operator-smoke`, and a new high-entropy `IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN`; the reconciler and migration roles remain `disabled` and never receive that token. A request without the token must return `403 upload_operator_smoke_required` without creating a rate-limit or upload row.

Build the temporary runner from the same clean merged commit and computed release fingerprint. Use `nohup` on the VPS so an SSH/Tailscale session loss does not terminate the build:

```bash
cd "$HOME/ndt-cutover-src"
RELEASE_COMMIT="$(git rev-parse HEAD)"
RELEASE_FINGERPRINT="$(node scripts/image-upload-release-fingerprint.mjs "$RELEASE_COMMIT")"
SMOKE_IMAGE="ndt-studio-operator-smoke:${RELEASE_COMMIT:0:12}"
SMOKE_BUILD_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SMOKE_BUILD_LOG="$HOME/ndt-operator-smoke-build-${RELEASE_COMMIT:0:12}-${SMOKE_BUILD_STAMP}.log"
SMOKE_BUILD_EXIT="$HOME/ndt-operator-smoke-build-${RELEASE_COMMIT:0:12}-${SMOKE_BUILD_STAMP}.exit"
export RELEASE_COMMIT RELEASE_FINGERPRINT SMOKE_IMAGE SMOKE_BUILD_EXIT

nohup sh -c '
  docker build \
    -f apps/backend/Dockerfile.operator-smoke \
    --build-arg "IMAGE_UPLOAD_RELEASE_COMMIT=$RELEASE_COMMIT" \
    --build-arg "IMAGE_UPLOAD_BUILD_FINGERPRINT=$RELEASE_FINGERPRINT" \
    -t "$SMOKE_IMAGE" .
  code=$?
  printf "%s\n" "$code" >"$SMOKE_BUILD_EXIT"
  exit "$code"
' \
  >"$SMOKE_BUILD_LOG" 2>&1 &
echo "SMOKE_BUILD_PID=$!"
echo "SMOKE_BUILD_LOG=$SMOKE_BUILD_LOG"
echo "SMOKE_BUILD_EXIT=$SMOKE_BUILD_EXIT"
```

Reconnect safely if necessary, wait until `SMOKE_BUILD_EXIT` exists, and require its exact content to be `0`. Inspect both `studio.nguyendinhthinh.image-upload.release-commit` and `studio.nguyendinhthinh.image-upload.release-fingerprint`; they must equal the active backend release tuple. Do not use the image if either label drifts.

Create one owner-only smoke environment file outside the repository. It contains the production API/imgproxy/browser origins, one existing empty smoke album UUID, ephemeral admin bearer token, distinct smoke/cutover operator tokens, session-capable database URL, cutover R2 credentials, active backend image reference/digest, Phase 1 receipt/approval, smoke authorization, and distinct journal/receipt paths. It must include all names below and mode `600`; never print its values:

```text
NDT_PRODUCTION_SMOKE_API_BASE_URL
NDT_PRODUCTION_SMOKE_IMGPROXY_BASE_URL
NDT_PRODUCTION_SMOKE_BROWSER_ORIGIN
NDT_PRODUCTION_SMOKE_ALBUM_ID
NDT_PRODUCTION_SMOKE_ADMIN_BEARER_TOKEN
NDT_PRODUCTION_SMOKE_TOKEN
NDT_PRODUCTION_SMOKE_OPERATOR_TOKEN
NDT_PRODUCTION_SMOKE_IMAGE_REFERENCE
NDT_PRODUCTION_SMOKE_IMAGE_DIGEST
NDT_PRODUCTION_SMOKE_PHASE1_RECEIPT
NDT_PRODUCTION_SMOKE_PHASE1_APPROVAL
NDT_PRODUCTION_SMOKE_AUTHORIZATION
NDT_PRODUCTION_SMOKE_JOURNAL
NDT_PRODUCTION_SMOKE_RECEIPT
IMAGE_UPLOAD_RELEASE_COMMIT
IMAGE_UPLOAD_BUILD_FINGERPRINT
IMAGE_UPLOAD_R2_ENDPOINT
IMAGE_UPLOAD_R2_BUCKET
IMAGE_UPLOAD_CUTOVER_R2_ACCESS_KEY_ID
IMAGE_UPLOAD_CUTOVER_R2_SECRET_ACCESS_KEY
DATABASE_URL
```

Run the one-shot CLI on the Dokploy network. Mount the protected evidence directory at the identical absolute path so the approved path hashes remain stable:

```bash
SMOKE_ENV="$HOME/.ndt-production-smoke.env"
EVIDENCE_ROOT="$HOME/ndt-cutover-evidence"
chmod 600 "$SMOKE_ENV"

docker run --rm \
  --name "ndt-operator-smoke-${RELEASE_COMMIT:0:12}" \
  --network dokploy-network \
  --user "$(id -u):$(id -g)" \
  --env-file "$SMOKE_ENV" \
  -v "$EVIDENCE_ROOT:$EVIDENCE_ROOT" \
  "$SMOKE_IMAGE" run
```

`run-image-upload-production-smoke.js run` executes and journals all twelve checks: representative browser upload, fixed absolute presign-expiry retry, allowed and denied browser CORS, response-first settlement, deliberate CopyObject response loss followed by exact destination HEAD settlement after at least 30 seconds, unchanged destination on recovery, conflict fail-closed behavior, committed-result deletion, failed-promotion cleanup, temporary cleanup after expiry plus skew, and imgproxy rendering. It creates the official receipt only after all checks and exact-ID/R2 cleanup pass. It never runs the optional memory benchmark or downloads stable Chrome.

If the run is interrupted or cleanup fails, immediately disable presign and restore `IMAGE_UPLOAD_INGRESS_MODE=disabled`, retain the journal, and run only resumable cleanup:

```bash
docker run --rm \
  --name "ndt-operator-smoke-cleanup-${RELEASE_COMMIT:0:12}" \
  --network dokploy-network \
  --user "$(id -u):$(id -g)" \
  --env-file "$SMOKE_ENV" \
  -v "$EVIDENCE_ROOT:$EVIDENCE_ROOT" \
  "$SMOKE_IMAGE" cleanup
# Equivalent packaged entrypoint: run-image-upload-production-smoke.js cleanup
```

Keep general ingress blocked after a successful smoke. Retain its protected journal, authorization, and receipt for Phase 2; do not delete earlier protected evidence or encrypted backups.

## 9. Complete the roll-forward drill and final-ingress admission

The release transition used to correct Stage 09 may serve as the drill transition only when its receipt binds the distinct previous and active releases and proves the sequence below. Never relabel a same-release restart or a log summary as a drill.

1. Disable presign on every new API and prove general ingress is blocked.
2. Capture sanitized session, promotion, polling, conflict, object-deletion, replica, role, and heartbeat evidence.
3. Keep a new reconciler running only while its dedicated lock, five loop timestamps, role secrets, provider readback, and database invariants remain healthy.
4. Build the forward release and apply only forward-compatible migrations.
5. Start the forward API/reconciler with presign disabled and obtain its Phase 1 receipt and approval.
6. Enable presign only behind operator-only ingress and smoke; create the protected smoke authorization and receipt.
7. Create the protected drill receipt and approval ending at that active release.
8. Capture **two final zero polling snapshots** at least 30 seconds apart after smoke and drill.
9. Build and verify the Phase 2 final-ingress receipt with every protected input.

The operational order is closed and may not be rearranged:

1. Phase 1 post-start approval
2. operator-only ingress and smoke
3. roll-forward drill ending at the active release
4. two final zero polling snapshots
5. Phase 2 final-ingress approval
6. open general ingress
7. rollback-window cleanup

Verify Phase 2:

```powershell
npm run verify:image-upload-final-ingress -- `
  --receipt $env:IMAGE_UPLOAD_FINAL_INGRESS_RECEIPT `
  --approval $env:IMAGE_UPLOAD_FINAL_INGRESS_APPROVAL `
  --post-start-receipt $env:IMAGE_UPLOAD_PRODUCTION_GATE_RECEIPT `
  --post-start-approval $env:IMAGE_UPLOAD_PRODUCTION_GATE_APPROVAL `
  --smoke-authorization $env:IMAGE_UPLOAD_OPERATOR_SMOKE_AUTHORIZATION `
  --smoke-receipt $env:IMAGE_UPLOAD_OPERATOR_SMOKE_RECEIPT `
  --drill-receipt $env:IMAGE_UPLOAD_ROLL_FORWARD_DRILL_RECEIPT `
  --drill-approval $env:IMAGE_UPLOAD_ROLL_FORWARD_DRILL_APPROVAL
if ($LASTEXITCODE -ne 0) { throw "final ingress gates failed" }
```

Never start a prior application generation during this drill.

## 10. Open general ingress and schedule cleanup

Opening general upload ingress requires the Phase 2 final-ingress approval. Remove the operator-only allowlist only after the verifier passes. If any gate changes, disable presign and keep ingress closed.

Redeploy the API with `IMAGE_UPLOAD_PRESIGN_ENABLED=true`, `IMAGE_UPLOAD_INGRESS_MODE=general`, and `IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN` removed. After general-ingress canaries pass, remove only the temporary runner artifact; `--rm` has already removed the container:

```bash
docker image rm "$SMOKE_IMAGE"
```

Never remove an image referenced by any running container or the protected evidence/backup paths.

After stable acceptance, add/read back the `uploads/`-only 24-hour lifecycle fallback. Prove `albums/` is excluded. Revoke `ndt-prod-r2-config-ro`, verify its former Access Key ID is denied, remove `IMAGE_UPLOAD_CUTOVER_R2_CONFIG_READ_ACCESS_KEY_ID`/`IMAGE_UPLOAD_CUTOVER_R2_CONFIG_READ_SECRET_ACCESS_KEY` from Dokploy, and retain only the sanitized credential fingerprint plus revocation receipt.

Perform cleanup only through `docs/runbooks/image-upload-evidence-cleanup.md`, after the rollback window.

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
