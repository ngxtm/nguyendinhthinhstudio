# Prisma Release Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Dokploy apply committed Prisma migrations in a one-shot Compose service before starting a new backend revision.

**Architecture:** Add `backend-migrate` to the production Compose stack, built from the same backend Dockerfile and gated with `service_completed_successfully`. Keep Dokploy's default `docker compose up -d --build --remove-orphans` command and document production diagnosis and recovery separately from application startup and cleanup jobs.

**Tech Stack:** Docker Compose v2, Docker multi-stage builds, Prisma 6, PostgreSQL/Supabase, Dokploy

---

## File Structure

- Modify `docker-compose.yml`: define the shared backend build configuration, one-shot migration service, and backend dependency gate.
- Create `docs/deployment/prisma-migrations.md`: production release, verification, failure diagnosis, and rollback runbook.

### Task 1: Gate the backend on a one-shot migration service

**Files:**
- Modify: `docker-compose.yml:1-64`

- [ ] **Step 1: Capture the failing Compose contract check**

Run before editing:

```powershell
$services = docker compose config --no-interpolate --services
if ($services -contains 'backend-migrate') {
  Write-Output 'backend-migrate already exists'
  exit 0
}
Write-Error 'backend-migrate service is missing'
exit 1
```

Expected: exit `1` with `backend-migrate service is missing`.

- [ ] **Step 2: Add the shared backend build and migration service**

Add this extension before `services:`:

```yaml
x-backend-build: &backend-build
  context: .
  dockerfile: apps/backend/Dockerfile
```

Add this service before `backend`:

```yaml
  backend-migrate:
    build: *backend-build
    command:
      - /app/node_modules/.bin/prisma
      - migrate
      - deploy
      - --schema
      - /app/prisma/schema.prisma
    restart: "no"
    environment:
      - DATABASE_URL=${DATABASE_URL:?DATABASE_URL is required}
      - DIRECT_URL=${DIRECT_URL:?DIRECT_URL is required}
    networks:
      - dokploy-network
```

Replace the backend build mapping with the anchor and add its dependency:

```yaml
  backend:
    build: *backend-build
    depends_on:
      backend-migrate:
        condition: service_completed_successfully
    restart: unless-stopped
```

Do not pass R2, Supabase Auth, imgproxy, or application secrets to
`backend-migrate`. Do not change the frontend dependency or cleanup command.

- [ ] **Step 3: Validate the rendered Compose contract**

Run:

```powershell
docker compose config --no-interpolate --quiet
$services = docker compose config --no-interpolate --services
if ($services -notcontains 'backend-migrate') { throw 'backend-migrate missing' }
$config = (docker compose config --no-interpolate) -join "`n"
if ($config -notmatch 'condition: service_completed_successfully') {
  throw 'backend migration gate missing'
}
Write-Output 'COMPOSE_MIGRATION_GATE_OK'
```

Expected: exit `0` and print `COMPOSE_MIGRATION_GATE_OK` without Compose schema warnings.

- [ ] **Step 4: Build and inspect the migration runtime image**

Run:

```powershell
docker build -t ndt-backend-migrate-verify -f apps/backend/Dockerfile .
docker run --rm --entrypoint sh ndt-backend-migrate-verify -c 'test -f /app/prisma/schema.prisma && test -d /app/prisma/migrations && test -x /app/node_modules/.bin/prisma && /app/node_modules/.bin/prisma --version'
```

Expected: both commands exit `0`; Prisma reports version `6.19.3`, and no file check fails.

- [ ] **Step 5: Commit the Compose gate**

```powershell
git add docker-compose.yml
git commit -m "build(deploy): gate backend on Prisma migrations"
```

### Task 2: Add the production migration runbook

**Files:**
- Create: `docs/deployment/prisma-migrations.md`

- [ ] **Step 1: Write the runbook**

Create `docs/deployment/prisma-migrations.md` with this content:

````markdown
# Production Prisma Migrations

Dokploy deploys the Compose stack with its default command. The one-shot
`backend-migrate` service runs `prisma migrate deploy` before a new backend
revision can start. Do not put migration commands in the backend startup or the
upload-cleanup schedule.

## Normal deployment

1. Create migrations locally with `prisma migrate dev` and review the generated
   SQL.
2. Commit `schema.prisma` and the new `prisma/migrations` directory together.
3. Validate on a PostgreSQL staging clone.
4. Confirm Supabase backup/PITR before destructive or large migrations.
5. Deploy normally from Dokploy; leave **Advanced → Run Command** empty.
6. Confirm `backend-migrate` exited with status `0`, then confirm backend and
   frontend are healthy.

No pending migration is a successful deployment and is expected to log:

```text
No pending migrations to apply.
```

## Verify from the VPS

Find the migration container for the Dokploy Compose project:

```sh
docker ps -a --filter 'name=backend-migrate' \
  --format 'table {{.ID}}\t{{.Names}}\t{{.Status}}'
```

Inspect its logs and require exit status `0`:

```sh
MID=$(docker ps -aq --filter 'name=backend-migrate' | head -n 1)
test -n "$MID"
docker logs "$MID"
test "$(docker inspect -f '{{.State.ExitCode}}' "$MID")" = "0"
```

Check backend health:

```sh
BID=$(docker ps -q --filter 'name=backend' | head -n 1)
test -n "$BID"
docker inspect -f '{{.State.Health.Status}}' "$BID"
```

Expected: `healthy`.

## Migration failure

Do not run `prisma migrate dev`, `prisma db push`, append `|| true`, or edit an
already-applied migration. Read the failed migration log first, then inspect
status from a backend image/container that contains the same release:

```sh
docker exec "$BID" sh -c '
cd /app &&
./node_modules/.bin/prisma migrate status \
  --schema /app/prisma/schema.prisma
'
```

Use `prisma migrate resolve` only after confirming whether the SQL completed and
how `_prisma_migrations` records it. Fix forward with a new migration whenever
possible.

## Rollback

For additive migrations, leave the new schema in place and redeploy the previous
application revision. Prisma has no automatic down migration. Restore the
database only for confirmed data damage and only from a verified backup/PITR
point.

Breaking schema changes must use expand-migrate-contract across separate
releases so the old and new applications remain compatible during deployment.
````

- [ ] **Step 2: Check the runbook and repository diff**

Run:

```powershell
rg -n "migrate deploy|migrate status|migrate resolve|db push|Run Command" docs/deployment/prisma-migrations.md
rg -n "T[B]D|T[O]DO|F[I]XME|PLACEH[O]LDER" docs/deployment/prisma-migrations.md
git diff --check
git diff -- docker-compose.yml docs/deployment/prisma-migrations.md
```

Expected: the first command finds every operational topic; the placeholder scan
prints nothing; `git diff --check` exits `0`; the diff contains only the agreed
Compose gate and runbook.

- [ ] **Step 3: Commit the runbook**

```powershell
git add docs/deployment/prisma-migrations.md
git commit -m "docs(deploy): add Prisma migration runbook"
```

### Task 3: Final verification and Dokploy handoff

**Files:**
- Verify: `docker-compose.yml`
- Verify: `docs/deployment/prisma-migrations.md`

- [ ] **Step 1: Run final local verification**

Run:

```powershell
docker compose config --no-interpolate --quiet
docker build -t ndt-backend-migrate-verify -f apps/backend/Dockerfile .
docker run --rm --entrypoint sh ndt-backend-migrate-verify -c 'test -f /app/prisma/schema.prisma && test -d /app/prisma/migrations && /app/node_modules/.bin/prisma --version'
git diff --check HEAD~2..HEAD
git status --short --branch
```

Expected: all commands exit `0`, Prisma is `6.19.3`, and the worktree is clean.

- [ ] **Step 2: Deploy through Dokploy without overriding its command**

Leave **Advanced → Run Command** empty and redeploy the Compose project. Expected
deployment state:

```text
backend-migrate  exited (0)
backend          healthy
frontend         healthy
```

Because the Phase 4 migrations were already applied manually, migration logs
must include `No pending migrations to apply.`

- [ ] **Step 3: Perform production smoke checks**

Verify the public gallery returns successfully, create and confirm one admin
image upload, then run the existing cleanup schedule manually:

```sh
node /app/dist/scripts/cleanup-expired-image-uploads.js
```

Expected: the schedule exits `0` and prints JSON counters with `failed: 0`.
