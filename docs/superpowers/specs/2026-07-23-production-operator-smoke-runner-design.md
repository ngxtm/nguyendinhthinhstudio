# Production Operator Smoke Runner Design

## Status and scope

This design closes the Stage 09 gap between Phase 1 post-start approval and Phase 2 final-ingress approval. The current release can represent and verify an operator-smoke receipt, but it has no executable that performs the twelve production checks and no ingress state that distinguishes an approved operator from every other authenticated administrator.

The change adds a Cloudflare-compatible application gate and a packaged, bounded production smoke runner. It does not open general upload ingress, add a public fault-injection endpoint, restore Queue/DLQ/Event Notification architecture, change the polling reconciler, or make the optional memory benchmark a release gate.

## Goals

- Keep upload creation fail-closed until the exact Phase 1 evidence and operator-smoke authorization have been approved.
- Allow one authenticated administrator possessing a separate temporary smoke secret to exercise the production upload workflow through Cloudflare.
- Execute all twelve checks required by `image-upload-operator-smoke-receipt/v1-polling` and derive each boolean from observed behavior.
- Isolate every mutation to runner-owned database rows and R2 keys and make cleanup resumable after interruption.
- Package the runner in a temporary one-shot smoke image built from the same release commit as the immutable backend image.
- Preserve the existing separation between the cutover operator token and API/reconciler runtime secrets.
- Leave a protected, canonical receipt only after all checks and cleanup pass.

## Non-goals

- Cloudflare Access, Workers, WAF rules, or IP allowlists are not provisioned by this change.
- The public frontend never receives a smoke token and is not modified to expose a smoke UI.
- The API does not receive `IMAGE_UPLOAD_OPERATOR_TOKEN` or cutover credentials.
- No production-only HTTP route is added for response-loss, conflict, expiry, or cleanup injection.
- The runner does not modify schemas, migrations, CI branch protection, encrypted backups, or previously approved evidence.
- A failed run never emits an official all-true smoke receipt.

## Alternatives considered

### Cloudflare Access service-token policy

This can protect a path at the edge, but it creates unversioned external state, needs an additional Cloudflare credential and cleanup procedure, and still does not provide the missing twelve-check runner. It is not the default path.

### Temporary Traefik router

A dynamic router is available on the host, but a source-IP allowlist cannot identify the operator behind Cloudflare. A secret query parameter would enter URLs and access logs, while a custom-header router would duplicate application CORS and authentication behavior outside the repository. This is rejected.

### Application gate and packaged runner

This is the selected approach. Cloudflare forwards the request to the existing API, while the API enforces administrator JWT authorization and a temporary, constant-time-checked smoke token. The complete contract is versioned, tested, packaged, and removed operationally by changing the explicit ingress state.

## Ingress state machine

Add `IMAGE_UPLOAD_INGRESS_MODE` with the closed values `disabled`, `operator-smoke`, and `general`. `IMAGE_UPLOAD_PRESIGN_ENABLED` remains the independent hard kill.

| Presign | Ingress mode                  | Smoke token              | Result                                          |
| ------- | ----------------------------- | ------------------------ | ----------------------------------------------- |
| `false` | omitted or `disabled`         | absent                   | API boots; upload creation is disabled          |
| `false` | `operator-smoke` or `general` | any                      | startup fails                                   |
| `true`  | omitted or `disabled`         | any                      | startup fails                                   |
| `true`  | `operator-smoke`              | present and high entropy | only operator-smoke requests are admitted       |
| `true`  | `general`                     | absent                   | general authenticated-admin ingress is admitted |
| `true`  | `operator-smoke`              | absent/weak              | startup fails                                   |
| `true`  | `general`                     | present                  | startup fails                                   |

Omitting `IMAGE_UPLOAD_INGRESS_MODE` is backward-compatible only while presign is false; it resolves to `disabled`. There is no backward-compatible path from `presign=true` to general ingress. General ingress therefore always requires an explicit Phase 2 deployment choice.

`IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN` is an API-only secret accepted only in `operator-smoke` mode. Reconciler and cutover runtime validation reject it. The existing `IMAGE_UPLOAD_OPERATOR_TOKEN` remains cutover-only and remains rejected by API and reconciler roles.

## Request admission

The upload workflow routes retain class-level `JwtAuthGuard`, `RolesGuard`, and `@Roles('admin')`. After authentication and role authorization, but before rate-limit admission or session mutation:

1. `disabled` returns the existing `503 upload_presign_disabled` response for upload creation.
2. `operator-smoke` requires `X-Image-Upload-Smoke-Token` and compares its digest with the configured token using a constant-time comparison. Missing, duplicated, malformed, or incorrect headers return `403 upload_operator_smoke_required` and create no rate-limit or upload row.
3. `general` admits the existing authenticated-admin workflow without the smoke header.

The operator check applies to `POST /images/upload-url`, `POST /images/confirm-upload`, `GET /images/upload-sessions/:uploadId`, and `POST /images/upload-sessions/:uploadId/abandon`. Public image reads and unrelated admin routes are unchanged. Owner checks remain authoritative after admission.

The global CORS configuration adds only the header name `X-Image-Upload-Smoke-Token`. The token value is never returned. Audit and error logging must not serialize the header, process environment, presigned URL, administrator JWT, or R2 credentials.

## Runtime configuration and deployment binding

The parsed API runtime exposes only:

- `presignEnabled`;
- `ingressMode`; and
- an in-memory digest of the smoke token when operator mode is active.

The raw token is not exposed through runtime observation, Swagger, health endpoints, receipts, or logs. Runtime fingerprints include the ingress mode and the smoke-token fingerprint, not secret bytes, so a redeploy with a different token is detectable.

`docker-compose.yml` mounts the smoke token only into the backend service. The migration and reconciler services do not receive it. The Docker runtime contract proves the long-lived role boundary. The one-shot smoke image separately proves its release commit/fingerprint binding before it may contact production.

## One-shot production smoke runner image

Add `dist/scripts/run-image-upload-production-smoke.js` to a dedicated image built with `apps/backend/Dockerfile.operator-smoke`, with commands:

```text
run-image-upload-production-smoke.js run
run-image-upload-production-smoke.js cleanup
```

The production backend remains based on Node Alpine and does not contain a browser. The smoke image uses a pinned Node 24 Debian/Playwright-compatible base and installs the matching Playwright Chromium browser. It does not download or depend on stable Chrome. This avoids unsupported Chromium-on-musl behavior and keeps browser binaries out of the long-lived API/reconciler image.

The runner image is temporary and one-shot: it never boots Nest HTTP routes, is not part of the Dokploy service topology, and must be removed from the VPS after Phase 2 acceptance. It has a dedicated strict input parser rather than relaxing the long-lived API/reconciler role parser. Secrets are accepted only through environment variables or a mode-600 environment file, never command-line arguments. Its image labels and runtime inputs bind it to the exact release commit, release fingerprint, backend image reference, and observed backend image digest.

Required inputs include:

- production API and imgproxy base URLs;
- an ephemeral administrator bearer token;
- the temporary smoke token under a runner-specific environment name;
- the production session-capable database URL;
- the cutover-scoped R2 data-plane pair, endpoint, and bucket;
- exact release commit, release fingerprint, image reference, and actual image digest;
- absolute protected paths for the Phase 1 receipt, Phase 1 approval, smoke authorization, journal, and output receipt; and
- the expected operator fingerprint input needed to verify the authorization without printing it.

Before mutation, the runner:

1. requires POSIX mode 600 and the expected owner for every protected input;
2. validates canonical hashes and byte/path bindings;
3. invokes or shares the official Phase 1 verification logic;
4. verifies the authorization decision, release tuple, approval ordering, and operator fingerprint;
5. verifies the live API image label/fingerprint and `operator-smoke` ingress mode; and
6. proves a request without the smoke header fails before row creation.

## Run identity, journal, and mutation boundary

Every run receives a UUID. Before the first mutation, the runner atomically creates a mode-600 journal outside the repository with `wx` semantics. The journal stores only sanitized identifiers, exact runner-owned row IDs, expected object keys, lifecycle state, completed checks, and cleanup state. It stores no JWT, smoke token, database URL, R2 secret, or presigned URL.

Ordinary upload rows and keys are created through the production API so the server remains the key authority. After receiving an upload ID and server-generated keys, the runner records them before the next operation. Direct database/R2 preparation is permitted only for fault scenarios that cannot be produced through the wire contract, and only after all of these checks pass:

- the row ID is recorded in the current journal;
- the row belongs to the authenticated smoke administrator;
- its upload/session/promotion identifiers equal the current run's recorded identifiers;
- every object key exactly equals a key returned by the API or derived by the existing closed key builders; and
- no referenced `Image` predates the current run.

The runner never lists and deletes a broad production prefix. Cleanup uses the journal's closed ID/key set and rechecks ownership immediately before every delete.

## Twelve production checks

The runner derives the receipt checks as follows:

1. `browserUpload`: bundled Playwright Chromium loads the approved production origin, obtains a presign through the API with admin JWT plus smoke header, uploads a generated small WebP, confirms it, and observes the owner-scoped terminal result.
2. `absoluteExpiryRetry`: the runner deliberately discards the first upload-url response client-side, retries the same idempotency request, and proves upload ID and absolute `presignExpiresAt` are unchanged and not extended.
3. `allowedCorsPut`: browser `fetch` from an exact configured production origin completes the signed PUT with the required content type.
4. `deniedCorsPut`: browser `fetch` from a runner-controlled unapproved local origin is rejected by CORS, followed by HEAD proof that no denied-origin object was written.
5. `responseFirstSettlement`: confirm observes the response-first/finalizing contract, then owner-scoped status polling observes the polling reconciler settle the same promotion.
6. `copyResponseLossHeadSettlement`: using only a runner-owned promotion, the runner prepares the exact post-copy/pre-response-loss state, waits between 30 and 35 seconds, and proves the live reconciler commits by exact destination HEAD evidence.
7. `unchangedDestinationRetry`: the runner records destination ETag, length, SHA-256 metadata, and image identity before a recovery retry and proves all remain unchanged afterward.
8. `conflictFailClosed`: a runner-owned conflicting destination with mismatched evidence is prepared; the live reconciler records an open conflict, does not overwrite the destination, and does not mark the promotion committed.
9. `committedDeletion`: the authenticated API deletes a runner-created committed image; polling proves the deletion result and an absent destination HEAD without deleting unrelated data.
10. `failedPromotionCleanup`: a runner-owned failed promotion is made cleanup-due; the live reconciler deletes only its temporary source and records verified deletion.
11. `temporaryCleanupAfterExpiry`: a runner-owned session is prepared with an absolute expiry older than the configured skew boundary; the live reconciler terminalizes it and verifies temporary-source absence.
12. `imgproxyRendering`: a signed imgproxy URL for a runner-created committed image returns a decodable WebP with expected dimensions, while no imgproxy write credential is introduced.

Direct preparation for checks 6, 8, 10, and 11 is implemented in a narrowly scoped adapter with explicit precondition queries and transaction boundaries. It does not expose a network endpoint or accept arbitrary SQL, row IDs, or object keys.

## Polling and time bounds

The runner uses condition polling, not fixed sleeps, except that the response-loss check must also prove an elapsed 30–35 second recovery barrier. Every poll has an absolute deadline and reports only sanitized state names and identifiers. Timeout, heartbeat drift, advisory-lock count other than one, release drift, or reconciler fingerprint drift fails the run.

## Cleanup and interruption behavior

Cleanup runs exactly once in `finally` and is idempotent. It:

- abandons or terminalizes any runner-owned active session;
- deletes runner-owned temporary and destination objects by exact key;
- removes runner-created images, promotions, conflicts, deletion operations, and sessions only after ownership revalidation;
- verifies absent HEAD for every recorded object;
- verifies no open runner-owned promotion/conflict/deletion remains; and
- records `cleanupStatus=complete` in the journal.

Rate-limit events are deliberately not deleted by the runner because the current rows are keyed by administrator and route rather than smoke run ID. They remain bounded by the normal route limits and are removed by the existing rate-limit cleanup loop. The runner stays below every configured limit and fails before starting if the dedicated operator identity lacks enough remaining admission capacity for the complete run.

SIGINT and SIGTERM trigger the same cleanup path. If cleanup cannot complete, `run` exits nonzero, retains the journal, and does not create the official receipt. `cleanup` accepts only that journal, revalidates release/ownership/key bindings, resumes idempotently, and still does not create a pass receipt.

The journal is retained as protected diagnostic evidence until Phase 2 acceptance. It may be removed only by the later evidence-cleanup procedure; encrypted backups and earlier approved evidence are never touched.

## Receipt creation

After all twelve observations are true and cleanup is verified complete, the runner atomically writes the existing closed `image-upload-operator-smoke-receipt/v1-polling` document with mode 600 and `wx` semantics. It binds:

- its absolute path digest;
- exact release tuple;
- smoke-authorization path and byte digests; and
- the twelve booleans derived from the completed check records.

The canonical hash excludes only `canonicalSha256`, matching the final-ingress verifier. The runner immediately validates the written bytes against the repository schema. An existing output path, false check, incomplete cleanup, changed authorization, or release drift is fatal.

## Testing strategy

Development follows test-first cycles.

- Runtime-config tests cover every state-machine row, backward-compatible disabled startup, role-secret rejection, entropy validation, and sanitized fingerprints.
- Controller/e2e tests prove auth then operator gate then rate-limit ordering; correct/missing/wrong/duplicated headers; owner isolation; disabled/general behavior; and no row creation on rejection.
- CORS contract tests prove the smoke header name is admitted without exposing its value.
- Runner unit tests use dependency injection to prove the exact twelve-check order, one-time cleanup, abort handling, receipt suppression on every failure, `wx` persistence, canonical hashing, and secret redaction.
- Integration tests use disposable PostgreSQL and fake/local provider adapters to prove closed ownership queries, conflict/response-loss state preparation, condition polling, cleanup resumption, and refusal to touch foreign rows or keys.
- Packaging tests require the compiled runner, matching Playwright Chromium, cleanup command, and release labels in the dedicated one-shot image; they also prove the long-lived backend image does not acquire the browser layer.
- Verifier tests prove the official receipt produced by the runner passes unchanged and that a hand-edited or incomplete receipt fails.
- The existing image-upload unit, integration, e2e, workflow-contract, production-gate, final-ingress, policy-build, backend-build, and Docker runtime-contract suites remain green.

No automated test receives production credentials. The live production run remains an explicitly approved operator action after merge and deployment.

## Operational sequence

1. Merge and deploy the new image with presign false and ingress mode `disabled`.
2. Re-run Phase 1 evidence for the new immutable release; earlier release evidence remains protected.
3. Create and approve a new smoke authorization bound to that release.
4. Configure the API service only with ingress mode `operator-smoke`, presign true, and the temporary smoke token; redeploy and prove unauthenticated, ordinary-admin, and missing-token requests fail closed.
5. Build the one-shot smoke image from the same release commit, verify its labels/runtime binding, run it with protected inputs, and retain its journal and official receipt.
6. Set presign false and ingress mode `disabled` before the roll-forward drill required by the existing runbook.
7. Complete drill evidence, final zero snapshots, Phase 2 receipt, approval, and official final-ingress verification.
8. Only after Phase 2 passes, redeploy with presign true and ingress mode `general`, with the smoke token absent.
9. Verify general ingress, then revoke/remove the temporary smoke secret, remove the stopped smoke container and one-shot smoke image, and perform only the separately authorized evidence cleanup.

At no point does Phase 1 approval or a smoke receipt alone authorize general ingress.

## Failure and rollback rules

- API startup validation failure: keep the currently running disabled generation and correct configuration without enabling ingress.
- Operator-gate canary failure: set presign false, restore `disabled`, and redeploy; do not run the smoke CLI.
- Runner check failure: cleanup from the journal, retain diagnostic evidence, keep general ingress blocked, and fix by roll-forward.
- Cleanup failure: keep the journal and rerun only `cleanup`; never mark the check pass manually.
- Release/image/fingerprint drift: invalidate the authorization and restart Phase 1 for the new release.
- Reconciler health/lock drift: disable presign immediately and resolve by roll-forward.

No rollback step restores an older schema or deletes an encrypted backup.
