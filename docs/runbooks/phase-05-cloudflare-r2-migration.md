# Phase 05: Cloudflare Images to R2 production migration

This runbook copies completed legacy Cloudflare Images originals to deterministic
R2 keys, verifies the bytes and one imgproxy variant, and only then updates
`Image.r2ObjectKey`. It does not cut image delivery over to imgproxy; that is
Phase 06.

## Safety invariants

- Run exactly one migration process for an environment.
- Use a Cloudflare Images read-only token. Never grant delete permission to the
  Phase 05 token.
- Keep the token in the operator secret store and process environment only. Do
  not inject it into the long-running backend container.
- Do not print or commit secrets, signed URLs, full legacy delivery URLs,
  database connection strings, or R2 credentials. The database backup is the
  only approved full-data export and must remain encrypted and access-restricted.
- Do not delete Cloudflare originals or clear the legacy URL columns.
- Treat every non-zero command exit, `failed > 0`, unexpected `skipped > 0`,
  pending cleanup, hash mismatch, or typed conflict as a stop condition.
- Do not proceed to Phase 06 until final reconciliation is clean.

## Required access and evidence

The operator needs:

- the reviewed Phase 05 commit checked out;
- `DATABASE_URL` and `DIRECT_URL` for the intended environment;
- the two variables from `apps/backend/.env.migration.example`;
- backend R2 read/write credentials and imgproxy signing configuration;
- access to database backup/PITR, application health, imgproxy logs, and the
  public website;
- an operator-controlled evidence directory outside the repository, such as
  `D:/secure-evidence/phase-05`, for backups, inventory, command output,
  timestamps, and hashes.

Record the Git SHA, operator, environment, start/end timestamps, backup SHA-256,
inventory SHA-256, every JSON summary, reconciliation results, health checks,
and the final decision. Do not put secrets or full URLs in logs, reports, or
the inventory; treat the database backup as restricted database material.

## 1. Preflight

Work from the repository root in PowerShell:

```powershell
git status --short
git rev-parse HEAD
npm ci --include=dev
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$evidenceRoot = "D:/secure-evidence/phase-05/$stamp"
New-Item -ItemType Directory -Force $evidenceRoot | Out-Null
```

Require a clean worktree and record the SHA. Confirm the migration schema is
already deployed by the normal release process:

```powershell
npx prisma migrate status --schema apps/backend/prisma/schema.prisma
```

Do not use `prisma migrate dev` or `prisma db push` against staging or
production. Follow `docs/deployment/prisma-migrations.md` if deployment status
is not clean.

Check variable presence without printing values:

```powershell
$required = @(
  'NODE_ENV',
  'DATABASE_URL',
  'DIRECT_URL',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_IMAGES_READ_TOKEN',
  'CLOUDFLARE_R2_BUCKET_NAME',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_S3_ENDPOINT',
  'IMGPROXY_KEY',
  'IMGPROXY_SALT',
  'IMGPROXY_BASE_URL'
)
$missing = $required | Where-Object {
  [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_))
}
if ($missing.Count -gt 0) {
  throw "Missing required environment variables: $($missing -join ', ')"
}
if ($env:NODE_ENV -ne 'production') {
  throw 'NODE_ENV must be production for production endpoint validation'
}
```

Independently confirm in the Cloudflare dashboard that the Images token is
read-only and scoped to the correct account. Confirm the R2 bucket and database
are for the same environment.

Require healthy endpoints before touching data:

```powershell
curl.exe -fsS https://api.ndtstudio.site/health | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Backend health check failed' }
curl.exe -fsS https://img.ndtstudio.site/health | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Imgproxy health check failed' }
```

Also record imgproxy restart count and current 5xx/timeout baseline. Stop if the
backend, imgproxy, database, R2, or Cloudflare Images API is already degraded.

## 2. Backup and inventory

Create and validate a PostgreSQL custom-format backup. The command references
the environment variable; it must not contain a literal connection string.

```powershell
$backup = Join-Path $evidenceRoot 'database.dump'
pg_dump --format=custom --no-owner --no-acl --file=$backup "$env:DIRECT_URL"
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed' }
pg_restore --list $backup | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Backup validation failed' }
Get-FileHash -Algorithm SHA256 $backup
```

Require a current, restorable backup/PITR point before continuing. A file that
only exists but has not passed `pg_restore --list` is not sufficient.

Open `psql "$env:DIRECT_URL" -v ON_ERROR_STOP=1` and capture the independent
baseline:

```sql
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE "r2ObjectKey" LIKE 'albums/%') AS migrated,
  COUNT(*) FILTER (WHERE "r2ObjectKey" IS NULL) AS missing,
  COUNT(*) FILTER (
    WHERE "r2ObjectKey" IS NOT NULL
      AND "r2ObjectKey" NOT LIKE 'albums/%'
  ) AS legacy,
  COUNT(*) FILTER (
    WHERE "r2ObjectKey" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) AS eligible_uuid
FROM "Image"
WHERE "uploadStatus" = 'completed';
```

Before the migration, `missing` must be zero and `eligible_uuid` must equal
`legacy`. Any non-null non-`albums/` key that is not a UUID is an unsupported
record and must be reconciled before execution. The historical estimate is 37,
but the live database count is authoritative.

Export only the approved inventory fields. In `psql`, replace the output path
with an absolute path under the local evidence directory and run this as one
`\copy` command:

```sql
\copy (SELECT "id", "albumId", "r2ObjectKey" AS "legacyCloudflareImageId", "filename", substring(NULLIF("thumbnailUrl", '') from '^https?://([^/]+)') AS "thumbnailHost", substring(NULLIF("smallUrl", '') from '^https?://([^/]+)') AS "smallHost", substring(NULLIF("mediumUrl", '') from '^https?://([^/]+)') AS "mediumHost", substring(NULLIF("largeUrl", '') from '^https?://([^/]+)') AS "largeHost", substring(NULLIF("xlargeUrl", '') from '^https?://([^/]+)') AS "xlargeHost" FROM "Image" WHERE "uploadStatus" = 'completed' AND "r2ObjectKey" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' ORDER BY "id") TO 'D:/secure-evidence/phase-05/20260714T000000Z/legacy-image-inventory.csv' WITH (FORMAT csv, HEADER true);
```

Do not export the URL columns themselves. Save the file as
`legacy-image-inventory.csv` under `$evidenceRoot`, then hash it and verify
its row count equals `eligible_uuid`:

```powershell
$inventory = Join-Path $evidenceRoot 'legacy-image-inventory.csv'
Get-FileHash -Algorithm SHA256 $inventory
(Import-Csv -LiteralPath $inventory).Count
```

Record current journal and cleanup queue counts:

```sql
SELECT "status", COUNT(*)
FROM "ImageStorageMigration"
GROUP BY "status"
ORDER BY "status";

SELECT "status", COUNT(*)
FROM "ImageObjectDeletion"
WHERE "provider" = 'r2'
GROUP BY "status"
ORDER BY "status";
```

Unexpected pre-existing `failed` migrations or pending target deletions are a
stop condition.

## 3. Staging rehearsal

Run this entire procedure first against a recent production clone with staging
Cloudflare/R2/imgproxy credentials. The rehearsal must finish with:

- dry-run eligible count equal to the clone's independent legacy count;
- every execute batch reporting `failed = 0`;
- no unresolved conflicts or pending deletion rows;
- source and target hashes equal for every verified journal row;
- final `missing = 0` and `legacy = 0`;
- healthy website, backend, and imgproxy checks.

Do not run production until the staging evidence has been reviewed. Never point
a staging clone at the production R2 bucket.

## 4. Production dry-run

Dry-run only reads the database; it must not construct R2/imgproxy clients,
upload objects, or update rows.

```powershell
$dryRunOutput = & npm.cmd run images:migrate:dry-run --workspace=backend 2>&1
$dryRunExitCode = $LASTEXITCODE
$dryRunOutput | Tee-Object -FilePath (Join-Path $evidenceRoot 'dry-run.log')
if ($dryRunExitCode -ne 0) { throw 'Production dry-run failed' }
```

The final JSON line must have:

- `mode = "dry-run"`;
- `eligible` equal to the independent `eligible_uuid` and inventory count;
- `migrated = 0`, `skipped = 0`, and `failed = 0`.

Do not assume the estimate of 37 if the three live counts disagree.

## 5. First production batch

Record the UTC batch start, then migrate at most five images with concurrency
two:

```powershell
$batchStartedAt = (Get-Date).ToUniversalTime().ToString('o')
$batchOutput = & npm.cmd run images:migrate --workspace=backend -- --limit=5 --concurrency=2 2>&1
$batchExitCode = $LASTEXITCODE
$batchOutput | Tee-Object -FilePath (Join-Path $evidenceRoot 'batch-first.log')
if ($batchExitCode -ne 0) { throw 'Migration batch exited non-zero' }
```

The command can exit zero after non-fatal per-image failures, so inspect the
final JSON line. For the first stable batch, require:

- `mode = "execute"`;
- `eligible` between 1 and 5;
- `migrated = eligible`;
- `skipped = 0`;
- `failed = 0`.

A typed conflict exits non-zero and stops new scheduling after in-flight work
settles. Do not immediately rerun it.

### Drain durable target cleanup

After every batch, run the deletion worker until it reports
`processed = 0`. Stop immediately if it reports any failure:

```powershell
do {
  $deletionOutput = & npx.cmd tsx apps/backend/scripts/process-image-deletions.ts
  $deletionExitCode = $LASTEXITCODE
  if ($deletionExitCode -ne 0) { throw 'Deletion worker exited non-zero' }
  $deletion = ($deletionOutput | Select-Object -Last 1) | ConvertFrom-Json
  $deletion | ConvertTo-Json -Compress
  if ($deletion.failed -gt 0) {
    throw 'Deletion queue has failed items; reconcile before migration resumes'
  }
} while ($deletion.processed -gt 0)
```

This worker may process other legitimate pending R2 deletions. Do not replace it
with an ad-hoc `DeleteObject` command.

### Reconcile the batch

Run:

```sql
SELECT "status", COUNT(*)
FROM "ImageStorageMigration"
GROUP BY "status"
ORDER BY "status";

SELECT COUNT(*) AS invalid_verified
FROM "ImageStorageMigration"
WHERE "status" = 'verified'
  AND (
    "sourceSize" IS NULL
    OR "targetSize" IS NULL
    OR "sourceSha256" IS NULL
    OR "targetSha256" IS NULL
    OR "sourceSize" <> "targetSize"
    OR "sourceSha256" <> "targetSha256"
    OR "verifiedAt" IS NULL
  );

SELECT COUNT(*) AS active_mapping_mismatch
FROM "ImageStorageMigration" AS migration
JOIN "Image" AS image ON image."id" = migration."imageId"
WHERE migration."status" = 'verified'
  AND image."r2ObjectKey" <> migration."targetR2ObjectKey";

SELECT "status", COUNT(*)
FROM "ImageObjectDeletion"
WHERE "provider" = 'r2'
GROUP BY "status"
ORDER BY "status";
```

Require `invalid_verified = 0`, `active_mapping_mismatch = 0`, no unexpected
journal `failed` rows, and no pending deletion rows.

Then:

- check API and imgproxy health again;
- inspect imgproxy/backend/R2 logs from `$batchStartedAt`;
- verify representative public album pages on desktop and mobile;
- confirm imgproxy restart count did not increase;
- compare 5xx and timeout rates with the preflight baseline.

Stop if any image is broken, imgproxy 5xx/timeouts rise, R2 verification fails,
the container restarts, or memory/CPU becomes unsafe. Phase 05 still serves
legacy delivery URLs, so a healthy website alone is not proof that R2 migration
succeeded; the journal integrity queries are mandatory.

## 6. Remaining production batches

Only continue after the first batch has 100% verification and all gates above
pass. Repeat batches of five at concurrency two:

```powershell
$batchId = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$batchOutput = & npm.cmd run images:migrate --workspace=backend -- --limit=5 --concurrency=2 2>&1
$batchExitCode = $LASTEXITCODE
$batchOutput | Tee-Object -FilePath (Join-Path $evidenceRoot "batch-$batchId.log")
if ($batchExitCode -ne 0) { throw 'Migration batch exited non-zero' }
```

After every invocation:

1. save the final JSON summary;
2. stop on non-zero exit, `failed > 0`, or unexpected `skipped > 0`;
3. drain the deletion queue;
4. run journal integrity and mapping reconciliation;
5. check website, health, logs, resource use, and restarts.

Repeated runs are the resume mechanism: successfully migrated rows no longer
have UUID keys and are not selected again. Use `--album-id` or
`--resume-after` only for an explicitly reviewed recovery plan; do not combine
them casually with repeated `--limit=5` batches.

## 7. Final reconciliation

A final dry-run must report `eligible = 0`:

```powershell
npm run images:migrate:dry-run --workspace=backend
```

Run the required completed-image reconciliation:

```sql
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE "r2ObjectKey" LIKE 'albums/%') AS migrated,
  COUNT(*) FILTER (WHERE "r2ObjectKey" IS NULL) AS missing,
  COUNT(*) FILTER (WHERE "r2ObjectKey" NOT LIKE 'albums/%') AS legacy
FROM "Image"
WHERE "uploadStatus" = 'completed';
```

Require `migrated = total`, `missing = 0`, and `legacy = 0`.

Also require all of the following queries to return zero:

```sql
SELECT COUNT(*) AS invalid_verified
FROM "ImageStorageMigration"
WHERE "status" = 'verified'
  AND (
    "sourceSize" IS NULL
    OR "targetSize" IS NULL
    OR "sourceSha256" IS NULL
    OR "targetSha256" IS NULL
    OR "sourceSize" <> "targetSize"
    OR "sourceSha256" <> "targetSha256"
    OR "verifiedAt" IS NULL
  );

SELECT COUNT(*) AS failed_or_incomplete
FROM "ImageStorageMigration"
WHERE "status" IN ('pending', 'uploaded', 'failed');

SELECT COUNT(*) AS active_mapping_mismatch
FROM "ImageStorageMigration" AS migration
JOIN "Image" AS image ON image."id" = migration."imageId"
WHERE migration."status" = 'verified'
  AND image."r2ObjectKey" <> migration."targetR2ObjectKey";

SELECT COUNT(*) AS pending_target_cleanup
FROM "ImageObjectDeletion"
WHERE "provider" = 'r2'
  AND "status" = 'pending';
```

Compare the number of `verified` journal rows plus legitimate
`skipped_deleted` rows with the original inventory, accounting explicitly for
images intentionally deleted during the run. Confirm legacy URL hosts remain
present and unchanged for rollback. Do not remove the journal, revoke shared R2
runtime credentials, delete Cloudflare originals, or start Phase 06 without
reviewed evidence.

## Stop conditions and recovery

Stop scheduling new batches when any of these occurs:

- command exit is non-zero;
- summary has `failed > 0` or unexpected `skipped > 0`;
- a typed conflict or “checkpoint could not be persisted” error appears;
- a journal row is `failed`, hashes/sizes differ, or mapping reconciliation is
  non-zero;
- target cleanup remains pending or its worker reports a failure;
- health fails, imgproxy 5xx/timeouts rise, a container restarts, or resource
  limits are approached;
- the live eligible count differs from the inventory or dry-run count.

Preserve the logs and record the last successful batch. Do not edit journal
rows, delete R2 objects, or rerun with a different selector until the conflict
has been explained.

## Rollback

Because Phase 05 does not switch delivery and keeps all legacy URL columns,
stopping the migration is the first rollback action. Cloudflare originals must
remain untouched.

If a reviewed incident decision requires restoring selected
`Image.r2ObjectKey` values:

1. build an explicit list of affected image IDs from the batch evidence;
2. verify each current key still equals its journal `targetR2ObjectKey`;
3. restore only those rows to `legacyCloudflareImageId` with a compare-and-set
   update inside one database transaction;
4. enqueue each journal `targetR2ObjectKey` in `ImageObjectDeletion`;
5. drain and verify the deletion queue;
6. keep the migration journal for audit.

Use an explicit temporary ID list; never rollback by timestamp alone. Review the
SQL with a second operator before running it:

```sql
BEGIN;

CREATE TEMP TABLE phase05_rollback_ids (
  "imageId" TEXT PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO phase05_rollback_ids ("imageId")
VALUES
  ('replace-with-reviewed-image-id');

SELECT image."id", image."r2ObjectKey", migration."targetR2ObjectKey"
FROM "Image" AS image
JOIN "ImageStorageMigration" AS migration
  ON migration."imageId" = image."id"
JOIN phase05_rollback_ids AS selected
  ON selected."imageId" = image."id"
WHERE image."r2ObjectKey" <> migration."targetR2ObjectKey";

-- The query above must return zero rows.
UPDATE "Image" AS image
SET "r2ObjectKey" = migration."legacyCloudflareImageId"
FROM "ImageStorageMigration" AS migration,
     phase05_rollback_ids AS selected
WHERE image."id" = migration."imageId"
  AND selected."imageId" = image."id"
  AND image."r2ObjectKey" = migration."targetR2ObjectKey";

INSERT INTO "ImageObjectDeletion" (
  "id",
  "imageId",
  "provider",
  "objectKey",
  "status",
  "attempts",
  "lastError",
  "deletedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'phase05-rollback-' || md5(migration."targetR2ObjectKey"),
  migration."imageId",
  'r2',
  migration."targetR2ObjectKey",
  'pending',
  0,
  NULL,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "ImageStorageMigration" AS migration
JOIN phase05_rollback_ids AS selected
  ON selected."imageId" = migration."imageId"
ON CONFLICT ("provider", "objectKey") DO UPDATE
SET "status" = 'pending',
    "attempts" = 0,
    "lastError" = NULL,
    "deletedAt" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP;

COMMIT;
```

The journal remains the audit source and may still be terminal `verified`.
After this operator rollback, do not automatically rerun migration for those
IDs. A reviewed forward-recovery procedure must reconcile the journal and
cleanup row first.

Restore the whole database backup only for confirmed broad data damage and
under the database incident/restore procedure. Do not use a full restore as the
normal response to a single-image conflict.

## Closeout

After clean final reconciliation:

```powershell
Remove-Item Env:CLOUDFLARE_IMAGES_READ_TOKEN -ErrorAction SilentlyContinue
Remove-Item Env:CLOUDFLARE_ACCOUNT_ID -ErrorAction SilentlyContinue
```

Keep the read-only token in the approved secret store until the Phase 08 cleanup
procedure revokes it. Keep the backup, inventory, journal, and evidence for the
observation window. Cloudflare assets must still exist at closeout.
