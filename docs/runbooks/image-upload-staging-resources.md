# Free-compatible image-upload staging resources

Staging uses Cloudflare R2 plus a dedicated non-production Supabase project. It does not require Workers Paid, R2 Event Notifications, Cloudflare Queues, DLQs, HTTP consumers, or a Cloudflare API read token.

## Required protected-environment inputs

In addition to the R2 inputs, the workflow requires environment secrets `NDT_STAGING_DATABASE_URL` and `NDT_STAGING_DIRECT_URL`, plus environment variables `NDT_STAGING_SUPABASE_PROJECT_REF` and `NDT_PRODUCTION_SUPABASE_PROJECT_REF`. Both URLs must target the staging ref and use a session-capable connection. For free-tier GitHub-hosted runners, use the Supavisor Session pooler string ending in port `5432` for both secrets; transaction mode `6543` is rejected because migrations, prepared statements, and session advisory locks require session semantics. Staging must differ from production. Connection strings are never written to receipts or logs; only a SHA-256 project-ref fingerprint is retained.

The preflight rejects placeholders, shared role credentials, staging/production R2 or Supabase identity equality, cross-project database URLs, wildcard/non-local HTTP CORS, and any obsolete Queue/DLQ/Event Notification variable.

## Runtime qualification

Each run receives a UUID and may write only `uploads/staging/{runId}/` and `albums/staging/{runId}/`. The smoke sequence performs PUT → HEAD → create-only COPY → HEAD → DELETE. A response-loss case is settled by the backend's 30-second promotion grace and five-second HEAD polling; a destination mismatch opens a conflict and never overwrites or deletes automatically. Cleanup verifies both exact prefixes are empty.

The live orchestrator runs idempotent migrations against the dedicated Supabase staging project. It never drops or resets that project. Backend suites must roll back or remove their own fixtures; the separate Testcontainers schema regression creates the minimum `auth.users` and Supabase roles before proving `prisma migrate deploy` from an empty database.

The deny-canary bucket is separate from staging and production. Its purpose is to prove every role is denied access without risking either real bucket. imgproxy is read-only.

## Role separation

- API receives only the staging API R2 pair.
- Reconciler receives only its R2 pair plus `IMAGE_UPLOAD_RECONCILE_GRACE_MS=30000` and `IMAGE_UPLOAD_RECONCILE_CADENCE_MS=5000`.
- Cutover receives only its R2 pair and the operator token.
- imgproxy receives only its read-only R2 pair.

The protected `staging` environment and `image-upload-staging` concurrency group are mandatory. Cleanup runs with `always()`.

## Queue deletion reminder

After a fresh zero-reference scan, successful live staging, and confirmation that no deployed runtime or workflow references the old resources, delete these obsolete queues manually from Cloudflare:

```text
ndt-studio-image-upload-staging
ndt-studio-image-upload-staging-dlq
```

Do not delete them before those gates pass.
