# Admin Web Image Optimization Roll-Forward Plan Set

This plan set implements `docs/superpowers/specs/2026-07-19-admin-web-image-optimization-roll-forward-design.md` as nine ordered stages.

## Execution contract

- Execute stages in numeric order.
- Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`.
- Do not start a stage until the previous stage gate passes with fresh evidence.
- Use TDD: write the focused failing test, observe the expected failure, implement the smallest complete behavior, and rerun the focused test.
- Production uses one maintenance-window cold cutover. The old upload generation is stopped before the new generation starts.
- Recovery is roll-forward only. Never start the old backend or old cleanup binary after the migration.
- Keep `IMAGE_UPLOAD_PRESIGN_ENABLED=false` throughout migration, bridge reconciliation, and new-generation read-only checks. Enable it only behind authenticated operator-only ingress for mutating smoke; general ingress remains blocked until acceptance passes.
- Never commit `0W9A1500.jpg`, credentials, presigned URLs, full object keys, or image bytes.
- Each stage ends with focused tests, relevant builds, `git diff --check`, and one scoped commit.

## Required order

1. [01-policy-and-api-contracts.md](./01-policy-and-api-contracts.md)
2. [02-image-grammar-and-fixtures.md](./02-image-grammar-and-fixtures.md)
3. [03-prisma-and-promotion-foundation.md](./03-prisma-and-promotion-foundation.md)
4. [04-backend-policy-and-session-api.md](./04-backend-policy-and-session-api.md)
5. [05-backend-inspection-settlement-and-cleanup.md](./05-backend-inspection-settlement-and-cleanup.md)
6. [06-frontend-optimizer-and-capability.md](./06-frontend-optimizer-and-capability.md)
7. [07-frontend-upload-queue-and-admin-ui.md](./07-frontend-queue-and-admin-ui.md)
8. [08-packaging-ci-and-staging.md](./08-packaging-ci-and-staging.md)
9. [09-production-cold-cutover-and-roll-forward.md](./09-production-cold-cutover-and-roll-forward.md)

For Stages 03, 04, 05, 08, and 09, also execute [free-compatible-polling-amendment.md](./free-compatible-polling-amendment.md). Its replacement tasks supersede every older Cloudflare Queue/DLQ/R2 Event Notification instruction while preserving completed checkbox history.

## Removed architecture

The following requirements from the superseded plan are intentionally absent:

- runtime `legacy-v0` request support;
- `IMAGE_UPLOAD_ALLOW_LEGACY_POLICY`;
- prior Prisma-client compatibility for application runtime (the one-shot audit still uses an explicit legacy-schema projection);
- prior-image smoke containers;
- blue-green old/new upload generations;
- a deployed drain-only backend generation;
- rollback by starting the previous backend or cleanup binary.

Existing unfinished upload rows are handled once by the cutover bridge command while all API ingress is disabled. Its pre-migration audit is database/R2-object read-only and selects only legacy-schema columns; terminalization and temporary-key cleanup occur in apply mode after migration.

## Global invariants

- The current wire policy is `web-v1-<hash>` and contains exactly the 18 hashed fields defined by the spec. Backend inspection uses the operational `bounded-image` mode, which is not a wire-policy property and is excluded from the policy hash.
- The wire hash covers the exact 18-field `ImageUploadPolicy` defined in Stage 01; operational TTLs/timeouts and the 512 MiB benchmark gate are excluded.
- The normative backend order is `HEAD → claim lease → acquire inspection permit → conditional GetObject → grammar/full decode → persist dispatched promotion → CopyObject`; no losing confirm reads a body or holds a permit.
- Every post-claim mutation matches upload ID, admin owner, status, source ETag, and finalization lease token.
- Every current-generation CopyObject dispatch has an `ImageUploadPromotion` row with immutable inspected digest, bytes, MIME, dimensions, policy, canonical source ETag, destination, lease, `copyDispatchedAt`, `lastDispatchAttemptAt`, and non-null `nextReconcileAt` committed before R2 is called.
- Provider copy state and object disposition are separate. `provider_settled` is proven by either exact durable CopyObject-response evidence or exact destination HEAD evidence (ETag, bytes, MIME, digest, dimensions, promotion metadata, and policy); response-only settlement does not invent polling evidence. `provider_settled` never implies deletion; `dispatch_rejected + not_created` is the only terminal no-destination pair.
- `committed` is immutable historical promotion authority. A live Image reference or a result tombstone plus matching `ImageObjectDeletion` proves a valid committed result.
- Failed-promotion deletion requires `cleanup_required`, no `Image` reference, exact CopyObject-response or destination-HEAD settlement identity, matching canonical destination ETag, DeleteObject, and a final absent HEAD.
- HTTP 412 alone identifies neither source nor destination precondition failure. Proven source rejection requires two absent destination HEADs separated by 30 seconds, no Image, and a missing or mismatched source; it performs no canonical DeleteObject.
- User-requested committed-result deletion uses only `ImageObjectDeletion`; it never transitions the promotion to `cleanup_required`.
- ETags are persisted unquoted without case folding and rendered quoted only for conditional HTTP headers.
- The first successful session creation persists one whole-second absolute `presignExpiresAt=expiresAt`. Every idempotent retry signs only the remaining seconds against that immutable instant; it never extends expiry, and a retry at/after expiry returns no URL and terminalizes `failed/upload_expired`.
- A destination metadata/ETag mismatch never authorizes deletion or overwrite; it creates an immutable promotion-conflict snapshot and can close only through one of the three operator CLI dispositions.
- API and reconciler are separate process roles from the same new release. The API never receives reconciler/cutover credentials.
- The reconciler owns one dedicated PostgreSQL advisory-lock connection, publishes a database heartbeat, and runs five bounded loops: pending-session expiry CAS, promotion recovery, temporary-session cleanup, applicable R2 image-object deletion, and rate-limit-event cleanup. Promotion rows are due for polling at `copyDispatchedAt + 30 seconds`; temporary cleanup covers every terminal session including consumed uploads and closes only after presign expiry plus clock skew and a final absent HEAD. Existing non-R2 deferred deletion rows are explicitly dispositioned and excluded from R2 backlog gates.
- Long-lived R2 credentials are truthfully treated as bucket-scoped. Prefix and operation restrictions are enforced by typed application key builders, fixed command paths, negative traversal/cross-prefix tests, and role separation; create-only overwrite is proven by the conditional COPY command path and unchanged-destination canary, not by a credential-level overwrite-denial claim.
- Production and staging R2 CORS are provisioned and read back with explicit HTTPS admin origins, method `PUT`, allowed header `Content-Type`, and no wildcard origin/header; real cross-origin browser PUTs prove allowed and denied cases.
- Initial deployment uses one API process with two decode permits. Rollout verifies actual ready replicas equal the configured process count.
- Result responses are retained for exactly 30 days; the compact idempotency record remains permanent. There is no daily/per-admin upload quota beyond authenticated route throttling and album capacity 50. That route throttle uses PostgreSQL `ImageUploadRateLimitEvent` rows under a per-admin transaction advisory lock and fails closed with 503 `upload_rate_limit_unavailable` if the limiter store is unavailable.
- The exact required CI contexts are `backend-image-upload`, `image-upload-packaging`, `frontend-playwright-chromium`, `frontend-stable-chrome`, and `frontend-image-memory`; the active ruleset is read back by ruleset ID.
- Staging uses non-production long-lived R2 resources, a unique run prefix, a disposable PostgreSQL database, and one `try/finally` orchestrator. No R2 Event Notification, Queue, DLQ, consumer, or provider-event token is required.

## Closure mapping

| Requirement | Closed in |
| --- | --- |
| Durable promotion exists before CopyObject | Stages 03 and 05 |
| Response loss recovers through exact destination HEAD after 30 seconds | Stages 03, 05, 08, and 09 |
| Destination mismatch cannot overwrite or delete automatically | Stages 03, 05, 08, and 09 |
| Reconciler has a dedicated advisory-lock connection and five bounded loops | Stages 03, 05, 08, and 09 |
| Temporary and committed-result deletion authorities remain separate | Stages 03, 04, 05, and 09 |
| Soft-deleted albums retain compact evidence | Stages 03, 04, 05, and 09 |
| Presign retries never extend absolute expiry | Stages 03, 04, 08, and 09 |
| Staging uses free-compatible R2 without Event Notifications or Queues | Stage 08 |
| Staging cleanup covers both exact run prefixes | Stage 08 |
| Production cutover verifies polling recovery before general ingress | Stage 09 |
| R2 credentials remain role-separated and bucket-scoped | Stages 04, 05, 08, and 09 |
| Browser memory tests use a deterministic fixture | Stage 08 |
| Required ruleset contexts are verified exactly | Stages 08 and 09 |
| Existing legacy ambiguity is resolved through protected dispositions | Stage 09 |

## Baseline commands

```powershell
node --version
npm --version
npm run build
npm test --workspace=backend -- --runInBand
npm run test:e2e --workspace=backend -- --runInBand
npm run test:integration --workspace=backend
npm test --workspace=frontend
npm run build --workspace=frontend
docker compose config --quiet
git diff --check
git status --short
```

Expected: Node 24 or 26, npm 11, commands exit 0, frontend focused tests use the explicit `test:focused` no-glob script, and only planned files plus the local benchmark fixture appear. The fixture may be untracked before Stage 08 adds the exact root ignore rule and must never be committed.

## Production hard gates

- After outstanding signed PUTs expire and every old writer/lease is proven quiesced, the authoritative encrypted pre-migration database backup is created, restored, and referenced by audit/migration/apply; an earlier preparation backup is invalid. A separate encrypted post-bridge backup is restored before startup. Receipts and distinct approvals are permission-checked and digest-verified outside the repository.
- Production bucket, exact CORS, role-separated R2 identities, 30-second promotion grace, five-second scan cadence, and secrets are read back before maintenance.
- New presign is blocked, HTTP confirm/status/abandon drain in a bounded window, and the cutover waits through the conservative latest legacy signed-PUT expiry plus clock skew and all active confirm/R2/lease deadlines.
- All old API and scheduled jobs stop with zero lease renewal and a late-PUT mutation canary before the authoritative backup, audit, and migration.
- The pre-migration audit reads only the exact legacy schema and performs no database/R2-object mutation. It receives explicit authoritative backup receipt/approval paths, embeds their canonical paths and digests, and exits nonzero until every ambiguous row has one protected signed `committed_authorized` or `cleanup_authorized` disposition supplied through an explicit path. After migration, apply revalidates those exact bindings, writes proven pre-dispatch rows as `failed/upload_cutover_aborted` without a promotion, and requires their temporary keys to pass final absent HEAD verification. The bridge creates `legacy_bridge` rows only from exact persisted dispatch and destination HEAD/response evidence and derives the deterministic UUIDv5 finalization lease token.
- Cutover completes with active uploads, expired pending uploads, unresolved promotions, invalid response/HEAD settlement, incomplete promotion-conflict evidence, unverified terminal temporary cleanup, open promotion conflicts, legacy pre-dispatch temporary sources, invalid committed/rejected authority, backup/disposition mismatches, production CORS mismatch, and image-deletion backlog all zero twice separated by 30 seconds.
- Only the new API and reconciler start, both with presign disabled.
- Process roles, secret isolation, dedicated singleton lock/heartbeat, actual replica count, read-only R2/imgproxy paths, routes, and schema pass.
- Presign is enabled while general ingress remains blocked and only the authenticated operator smoke path is allowlisted.
- General ingress opens only after fixed-absolute-expiry retry tests, exact CORS readback plus real allowed/denied cross-origin PUT tests, browser/R2 mutation, response-loss polling settlement, image-deletion, and cleanup gates pass.

## Roll-forward summary

1. Disable presign and block upload creation at ingress.
2. Preserve safe status/reconciliation only when their process-role health is proven.
3. Capture sanitized database, polling, conflict, and heartbeat evidence.
4. Fix the new version and build a new immutable image.
5. Apply only forward-compatible migrations.
6. Run presign-disabled read-only gates.
7. Enable presign behind operator-only ingress and run full mutating acceptance.
8. Open general ingress after polling/conflict/object-deletion disposition and corruption-risk checks pass.
