# Prisma Release Migration Design

**Date:** 2026-07-13
**Status:** Pending written-spec review
**Scope:** Dokploy Docker Compose production deployment

## Context

The backend image contains the Prisma schema and committed migrations, but the
current Dokploy deployment only runs `docker compose up -d --build`. Prisma does
not apply migrations automatically, so the Phase 4 backend was deployed before
the production database had the `ImageUpload` and `ImageObjectDeletion` tables.
The upload cleanup job then failed when it queried the old database schema.

Dokploy exposes a general deployment-command override but no dedicated
pre-deploy or release hook for this Compose stack. Production currently runs a
single backend replica, and a short maintenance interruption during deployment
is acceptable.

## Goals

- Apply committed Prisma migrations before a newly built backend starts.
- Use the same backend Dockerfile and source revision for the migration runner
  and application.
- Prevent the new backend from starting when migration deployment fails.
- Keep the default Dokploy Compose deployment command unchanged.
- Make repeated deployments idempotent when no migrations are pending.
- Preserve clear migration logs and exit status for diagnosis.

## Non-goals

- Zero-downtime, rolling, or blue-green deployment.
- Automatic database rollback.
- Schema generation or drift repair in production.
- Running migrations from the cleanup schedule or backend startup command.
- Refactoring upload, deletion, or cleanup application logic.

## Architecture

Add a one-shot `backend-migrate` service to `docker-compose.yml`. It uses the
same build context and `apps/backend/Dockerfile` as `backend`, but overrides the
container command to run:

```sh
/app/node_modules/.bin/prisma migrate deploy --schema /app/prisma/schema.prisma
```

The migration service receives only `DATABASE_URL` and `DIRECT_URL`, exposes no
port, has no health check, and uses `restart: "no"`. It may attach to the same
external Dokploy network for consistent outbound connectivity.

The backend declares this dependency:

```yaml
depends_on:
  backend-migrate:
    condition: service_completed_successfully
```

The existing frontend dependency on a healthy backend remains unchanged. The
cleanup schedule remains an independent daily job and never applies schema
migrations.

## Deployment Flow

Dokploy continues to execute its generated equivalent of:

```sh
docker compose up -d --build --remove-orphans
```

Compose performs the release in this order:

1. Build the backend and migration service from the deployed revision.
2. Start `backend-migrate`.
3. Prisma acquires its migration lock and applies pending committed migrations.
4. The migration container exits with status `0`.
5. Compose starts or recreates the backend.
6. The backend health check passes.
7. The frontend dependency is satisfied and the stack becomes healthy.

When there are no pending migrations, `prisma migrate deploy` exits successfully
without changing the database. Running the one-shot service again is therefore
expected and safe.

## Failure Handling

If Prisma exits non-zero, `backend-migrate` remains failed and the new backend
must not start. The migration command must not use `|| true`, ignore failures,
or invoke `prisma migrate resolve` automatically. Dokploy should surface the
Compose deployment failure and retain the migration container logs.

Because this is a single-replica Compose deployment, an unsuccessful deployment
may cause an outage until the failure is diagnosed or the previous revision is
redeployed. Preserving the old running container during every failure stage is
not guaranteed by this design.

Operators diagnose a failure by inspecting the migration service logs and
running `prisma migrate status`. `prisma migrate resolve` is permitted only after
the exact partial-migration state is understood. Production must never use
`prisma migrate dev` or `prisma db push`.

## Migration Compatibility Rules

Migrations run before the new backend is healthy, so schema changes should
remain compatible with the previously deployed application. Additive changes
such as new tables and nullable columns are preferred.

Breaking changes use expand-migrate-contract across separate releases:

1. Add the new schema while retaining the old schema.
2. Backfill data with a separate resumable job when required.
3. Deploy code that reads and writes the new schema.
4. Remove obsolete schema only after no deployed code depends on it.

Large or destructive migrations require a verified Supabase backup or PITR,
staging validation, and an explicit rollout plan.

## Database Connectivity and Security

The migration runner uses `DIRECT_URL` as configured by Prisma. For Supabase,
the connection must be a direct connection or session pooler suitable for DDL;
transaction-mode pooling should not be used for schema migration.

Only database connection variables are passed to `backend-migrate`. R2,
Supabase Auth, imgproxy, and application secrets are not required by this
service. Secrets remain supplied by Dokploy and are never embedded in the image
or Compose file.

## Rollback Strategy

Prisma does not automatically reverse deployed SQL. Application rollback is the
normal first response: additive schema remains in place and the previous
backend revision is redeployed. Database restore is reserved for confirmed data
damage or a destructive migration failure.

Applied migration files are immutable. A correction is delivered as a new
migration rather than editing a migration already recorded in
`_prisma_migrations`.

## Verification

Before production deployment:

1. Validate the Compose model with `docker compose config`.
2. Build both backend services.
3. Confirm `/app/prisma/schema.prisma`, `/app/prisma/migrations`, and the Prisma
   CLI exist in the migration image.
4. Run `migrate deploy` against a test or staging PostgreSQL database.
5. Run it a second time and confirm it succeeds with no pending migrations.

After the first Dokploy deployment:

1. Confirm `backend-migrate` exited with status `0`.
2. Confirm its log reports no pending migrations, because Phase 4 migrations
   have already been applied manually.
3. Confirm backend and frontend health checks pass.
4. Smoke-test public gallery access and an authenticated admin upload.
5. Run the upload cleanup schedule manually and confirm exit status `0`.

## Acceptance Criteria

- Dokploy uses its existing default deployment command.
- A one-shot migration container runs on every relevant Compose deployment.
- A new backend revision cannot start unless migration deployment succeeds.
- A no-op migration run exits successfully.
- Migration failure is visible in logs and is not suppressed.
- Runtime application and cleanup commands remain unchanged.
- The deployment procedure and recovery commands are documented.
