# Stage 09 Two-Phase Release Evidence Design

**Date:** 2026-07-23

## Problem

Stage 09 currently cannot advance without weakening a production safety gate:

- the staging workflow writes its sanitized receipt only to `$RUNNER_TEMP`, so a successful run leaves no retained artifact;
- the post-start production verifier requires `rollForwardDrillDecision=pass`;
- the roll-forward drill includes operator-only mutating acceptance; and
- operator-only mutating acceptance is forbidden until the post-start production receipt and approval pass.

This creates a closed dependency cycle. Supplying an arbitrary staging digest or recording a drill as passed without evidence would make the gate unauditable and is not permitted.

## Decision

Split release admission into two protected phases.

### Phase 1: post-start admission

The existing production-gate receipt remains the authorization boundary for enabling presign behind operator-only ingress. It proves:

- the exact clean merged release, immutable image identity, per-role image binding, runtime fingerprint, and heartbeat;
- restored pre-migration and post-bridge backups;
- startup approval and its two pre-deploy snapshots;
- two distinct post-start polling snapshots at least 30 seconds apart with all closed gates zero;
- exact CI ruleset contexts;
- retained successful staging qualification evidence.

It must not contain operator-smoke or roll-forward-drill decisions because those operations occur only after this phase authorizes operator-only mutation.

Production verification receives the protected staging receipt as a fourth distinct absolute path. It recomputes the receipt path and byte digests, validates the closed sanitized staging contract, requires `cleanupStatus=complete`, and cross-binds those digests to the post-start receipt. A hash without the retained receipt bytes is insufficient.

### Phase 2: final-ingress admission

A new closed final-ingress receipt and distinct approval are required before general upload ingress opens. The final receipt binds:

- the exact protected post-start receipt and approval;
- the exact protected operator-smoke receipt and approval;
- the exact protected roll-forward-drill receipt and approval;
- the same release commit, release fingerprint, image reference, and image digest approved in Phase 1;
- two new, distinct post-smoke polling snapshots captured at least 30 seconds apart with every closed gate zero; and
- `rollForwardDrillDecision=pass`.

The final-ingress verifier receives every bound evidence file as a distinct protected absolute input, recomputes path and byte digests, validates canonical hashes and phase-specific schemas, and rejects aliases, missing inputs, broad POSIX permissions, unknown fields, forbidden sensitive fields, release drift, or nonzero gates.

General ingress remains blocked if Phase 2 is absent or fails. Phase 1 alone may authorize only the authenticated operator smoke path while general ingress remains blocked.

## Staging Artifact Retention

After the staging cleanup step, the workflow uploads the sanitized receipt with `actions/upload-artifact@v4` using a run/attempt-specific artifact name, `if: always()`, `if-no-files-found: error`, and a bounded retention period. The staging job still fails when qualification or cleanup fails. Production accepts a staging receipt only from a successful workflow run on the approved release commit and only when its cleanup status is complete.

The workflow contract test requires the receipt path to be shared by qualification, cleanup, and artifact upload. It also requires artifact upload to occur after cleanup and rejects missing-file tolerance.

## Optional Memory Diagnostic

The deterministic fixture, pinned stable Chrome, and memory thresholds remain an optional memory diagnostic. They are not CI, Phase 1, Phase 2, smoke, drill, or ingress gates. When an operator chooses to run it, sanitized output may be retained outside the repository with owner-only permissions. The fixed fixture digest remains:

```text
1ac11dd1c64d39e79bdd3682bb11871ee2619b07a86fb923ba8412ab6dc3d581
```

The diagnostic reports the 512 MiB absolute limit and the 0.50 control ratio. Missing diagnostic output never blocks admission and the production smoke runner neither downloads stable Chrome nor runs this benchmark.

## Operator Smoke Execution

Phase 1 permits only the explicit `operator-smoke` ingress state. A dedicated temporary Debian image built from the same commit contains the journal-backed twelve-check CLI and matching Playwright Chromium; the long-lived Alpine backend remains browser-free. The image labels and baked environment bind its release commit and fingerprint, while protected inputs bind the active backend image reference and digest. The runner derives every receipt boolean from an observed check, cleans only journal-owned IDs/keys, and writes no official receipt on failure or incomplete cleanup. Phase 2 must pass before ingress changes to `general`; the stopped smoke container and temporary image are then removed without touching protected evidence or encrypted backups.

## Cleanup Lifecycle

Cleanup is evidence-driven and occurs only after final-ingress approval and the documented rollback window.

The runbook produces a dry-run manifest with two closed sets:

- **retain:** both encrypted database backups, their hashes/receipts/approvals, the final evidence bundle, the running image, and the designated rollback image during the rollback window;
- **purge:** temporary restore/cutover containers and directories, failed-attempt receipts, obsolete build logs and exit markers, diagnostic images, expired staging downloads, merged worktrees, and revoked cutover-only credentials.

No cleanup command deletes encrypted backups automatically. Loose evidence may be removed only after an encrypted evidence archive is verified and its manifest binds every retained file digest. Runtime or rollback images are never removed while referenced by a running container or before the rollback window ends. Config-read credentials are removed only after revocation is read back and the former key is proven denied.

## Failure Handling

- If staging artifact upload fails, rerun staging; never reconstruct the receipt from logs.
- If manual browser evidence is absent, run the manual gate and retain its exact output; never copy fixture values.
- If post-start verification fails, keep presign disabled and general ingress blocked.
- If operator smoke or the drill fails, disable presign, keep general ingress blocked, preserve evidence, and roll forward only.
- If either final snapshot is nonzero or release-bound evidence drifts, discard the final approval attempt and recapture after remediation.

## Verification Strategy

Development follows test-first changes:

1. workflow contract tests fail until staging artifact retention is mandatory;
2. production-gate tests fail until roll-forward evidence is removed from Phase 1 and the protected staging receipt is verified;
3. final-ingress schema/verifier tests fail until all Phase 2 bindings, zero snapshots, decisions, permissions, and canonical hashes are enforced;
4. forbidden-field fixtures prove receipts contain no credentials, URLs, object keys, ETags, or provider-event/Queue evidence;
5. documentation contract checks prove operator-only mutation follows Phase 1 and general ingress follows Phase 2; and
6. all existing backend, packaging, workflow, and production-gate tests remain green.

No production mutation, redeploy, staging rerun, credential revocation, or cleanup is performed by this code change.
