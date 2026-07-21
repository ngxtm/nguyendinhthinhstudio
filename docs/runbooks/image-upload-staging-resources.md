# Free-compatible image-upload staging resources

Staging uses Cloudflare R2 only. It does not require Workers Paid, R2 Event Notifications, Cloudflare Queues, DLQs, HTTP consumers, or a Cloudflare API read token.

## Required protected-environment inputs

The workflow supplies 20 inputs: staging account, R2 endpoint/bucket/CORS origins; four role-separated R2 credential pairs (API, reconciler, cutover, imgproxy); the staging operator token; a dedicated deny-canary endpoint/bucket; the production bucket name; and the four production role access-key IDs used only for identity-inequality checks.

The preflight rejects placeholders, shared role credentials, staging/production identity equality, wildcard/non-local HTTP CORS, and any obsolete Queue/DLQ/Event Notification variable.

## Runtime qualification

Each run receives a UUID and may write only `uploads/staging/{runId}/` and `albums/staging/{runId}/`. The smoke sequence performs PUT → HEAD → create-only COPY → HEAD → DELETE. A response-loss case is settled by the backend's 30-second promotion grace and five-second HEAD polling; a destination mismatch opens a conflict and never overwrites or deletes automatically. Cleanup verifies both exact prefixes are empty.

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
