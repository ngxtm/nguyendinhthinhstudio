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

Read the Compose project label and check that project's backend health:

```sh
PROJECT=$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$MID")
BID=$(docker ps -q \
  --filter "label=com.docker.compose.project=$PROJECT" \
  --filter 'label=com.docker.compose.service=backend' | head -n 1)
test -n "$BID"
docker inspect -f '{{.State.Health.Status}}' "$BID"
```

Expected: `healthy`.

## Migration failure

Do not run `prisma migrate dev`, `prisma db push`, append `|| true`, or edit an
already-applied migration. Read the failed migration log first. Then use the
failed container's Compose labels to run status with the same migration image,
project, configuration, and environment:

```sh
PROJECT=$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$MID")
WORKDIR=$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' "$MID")
CONFIG=$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project.config_files" }}' "$MID")
cd "$WORKDIR"
docker compose -p "$PROJECT" -f "$CONFIG" run --rm backend-migrate \
  /app/node_modules/.bin/prisma migrate status \
  --schema /app/prisma/schema.prisma
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
