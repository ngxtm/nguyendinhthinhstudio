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
7. [07-frontend-queue-and-admin-ui.md](./07-frontend-queue-and-admin-ui.md)
8. [08-packaging-ci-and-staging.md](./08-packaging-ci-and-staging.md)
9. [09-production-cold-cutover-and-roll-forward.md](./09-production-cold-cutover-and-roll-forward.md)

## Removed architecture

The following requirements from the superseded plan are intentionally absent:

- runtime `legacy-v0` request support;
- `IMAGE_UPLOAD_ALLOW_LEGACY_POLICY`;
- prior Prisma-client compatibility;
- prior-image smoke containers;
- blue-green old/new upload generations;
- a deployed drain-only backend generation;
- rollback by starting the previous backend or cleanup binary.

Existing unfinished upload rows are handled once by the cutover bridge command while all API ingress is disabled.

## Global invariants

- The current wire policy is `web-v1-<hash>` with `inspectionMode=bounded-image`.
- Initial policy values are `minimumChromiumMajor=136`, `softTargetBytes=3145728`, `maxStoredBytes=5242880`, `webpQuality=0.84`, `maxWidth=maxHeight=2560`, and `maxBrowserMemoryDeltaBytes=536870912`.
- The backend recomputes the processed digest and completely decodes the sole frame before promotion.
- Every post-claim mutation matches upload ID, admin owner, status, source ETag, and finalization lease token.
- Every current-generation CopyObject dispatch has an `ImageUploadPromotion` row with immutable inspected digest, bytes, MIME, dimensions, policy, canonical source ETag, destination, and lease committed before R2 is called.
- Provider copy state and object disposition are separate. `provider_settled` never implies deletion.
- `committed` is immutable historical promotion authority. A live Image reference or a result tombstone plus matching `ImageObjectDeletion` proves a valid committed result.
- Failed-promotion deletion requires `cleanup_required`, no `Image` reference, exact event identity, matching canonical destination ETag, DeleteObject, and a final absent HEAD.
- User-requested committed-result deletion uses only `ImageObjectDeletion`; it never transitions the promotion to `cleanup_required`.
- ETags are persisted unquoted without case folding and rendered quoted only for conditional HTTP headers.
- Queue acknowledgement happens only after the corresponding PostgreSQL transaction commits. Duplicate events re-enter the current state matrix.
- Unmatched or malformed events never authorize deletion and are retried into the configured DLQ.
- API and reconciler are separate process roles from the same new release. The API never receives Queue/operator tokens.
- The reconciler owns one dedicated PostgreSQL advisory-lock connection, publishes a database heartbeat, and runs Queue settlement, promotion recovery, temporary-session cleanup, and image-object deletion.
- The reconciler receives a separate bucket-scoped R2 Object Read & Write credential because recovery requires HEAD, COPY, and DELETE.
- Initial deployment uses one API process with two decode permits. Rollout verifies actual ready replicas equal the configured process count.
- Result responses are retained for exactly 30 days; the compact idempotency record remains permanent. There is no daily/per-admin upload quota beyond authenticated route throttling and album capacity 50.
- The exact required CI contexts are `backend-image-upload`, `image-upload-packaging`, `frontend-playwright-chromium`, `frontend-stable-chrome`, and `frontend-image-memory`; the active ruleset is read back by ruleset ID.
- Staging uses non-production long-lived R2/Queue resources, a unique run prefix, a disposable PostgreSQL database, and one `try/finally` orchestrator.

## P1 closure mapping

| Finding                                                | Closed in                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------- |
| Routine CopyObject events had no safe disposition      | Stages 03 and 05                                              |
| HTTP-pull consumer/DLQ was not provisioned             | Stages 05, 08, and 09                                         |
| Staging lacked R2 data-plane credentials               | Stage 08                                                      |
| Settlement process boundary was undefined              | Stages 04, 05, and 08                                         |
| Staging teardown did not cover all commands            | Stage 08                                                      |
| Manifest deletion made readback impossible             | Stage 08 uses long-lived provider resources and a run receipt |
| Cutover Queue presence wording was inverted            | Stage 09                                                      |
| Forward acceptance omitted promotion/Queue drain       | Stage 09                                                      |
| Decode budget trusted a declared replica count         | Stages 04 and 09                                              |
| Docker smoke expected nonexistent `dist/index.js`      | Stages 01 and 08                                              |
| Ruleset list readback could not prove required checks  | Stages 08 and 09                                              |
| Committed result deletion violated promotion authority | Stages 03, 04, 05, and 09                                     |
| Recovery lacked durable inspected facts                | Stages 03 and 05                                              |
| Reconciler lacked COPY permission                      | Stages 04, 05, 08, and 09                                     |
| Legacy pre-dispatch rows could invent promotions       | Stage 09                                                      |
| Presign-disabled smoke could not mutate provider state | Stage 09 uses read-only gates plus operator-only ingress      |
| Provider ETag representations were inconsistent        | Stages 03, 05, and 09                                         |
| Duplicate events incorrectly implied committed         | Stage 05                                                      |
| Old cleanup/deletion jobs had no new owner             | Stages 05, 08, and 09                                         |
| API result discriminants conflicted                    | Stages 01, 04, and 07                                         |
| Quota and result retention were unspecified            | Stages 03 and 04                                              |
| Required rules omitted backend and packaging           | Stages 08 and 09                                              |
| Memory benchmark depended on a local-only photo        | Stage 08 uses a deterministic generated fixture               |
| Advisory-lock connection and heartbeat were undefined  | Stages 03, 05, 08, and 09                                     |

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

Expected: Node 24 or 26, npm 11, commands exit 0, and only planned files plus the local benchmark fixture appear. The fixture may be untracked before Stage 08 adds the exact root ignore rule and must never be committed.

## Production hard gates

- Encrypted database backup and immutable new image digest recorded.
- Queue, DLQ, both HTTP-pull consumers, source-to-DLQ binding, event rule, names, IDs, retry settings, retention, and secrets read back before maintenance.
- New presign blocked before old in-flight confirms drain.
- All old API and scheduled jobs stopped, then legacy ambiguity is proven zero before migration.
- Pre-dispatch legacy rows create no promotion; the bridge creates `legacy_bridge` rows only from exact dispatch/event evidence.
- Cutover bridge completes with active uploads, unresolved promotions, invalid authority, Queue backlog, DLQ depth, and image-deletion backlog all zero twice.
- Only the new API and reconciler start, both with presign disabled.
- Process roles, secret isolation, dedicated singleton lock/heartbeat, actual replica count, read-only R2/imgproxy paths, routes, and schema pass.
- Presign is enabled while general ingress remains blocked and only the authenticated operator smoke path is allowlisted.
- General ingress opens only after browser, R2 mutation, Queue settlement, image-deletion, and cleanup gates pass.

## Roll-forward summary

1. Disable presign and block upload creation at ingress.
2. Preserve safe status/reconciliation only when their process-role health is proven.
3. Capture sanitized database, Queue, DLQ, and heartbeat evidence.
4. Fix the new version and build a new immutable image.
5. Apply only forward-compatible migrations.
6. Run presign-disabled read-only gates.
7. Enable presign behind operator-only ingress and run full mutating acceptance.
8. Open general ingress after Queue/DLQ/object-deletion disposition and corruption-risk checks pass.
