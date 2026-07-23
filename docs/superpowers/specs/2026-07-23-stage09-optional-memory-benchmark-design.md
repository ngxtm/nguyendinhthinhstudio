# Stage 09 Optional Memory Benchmark Design

**Date:** 2026-07-23

## Problem

The post-start production receipt currently requires deterministic browser-memory evidence before operator-only smoke can begin. The operator has explicitly chosen to remove this release gate because its operational cost is not justified for this deployment.

Memory evidence must not become an ambiguous optional field. Leaving the field in the receipt with partial, stale, or invented values would be worse than removing the gate explicitly.

## Decision

Remove browser-memory and stable-Chrome evidence from production admission while retaining the benchmark as an optional diagnostic tool.

### Production evidence

The closed Phase 1 schema no longer contains or requires `memory`. The production verifier no longer carries fixture constants, memory context names, delta thresholds, or memory semantic checks.

Because the schema remains closed, a receipt containing the former `memory` object is rejected. This makes the policy change explicit and prevents old templates from appearing to satisfy a gate that no longer exists.

Phase 2 final-ingress evidence remains unchanged. It continues to require Phase 1, operator smoke, a roll-forward drill ending at the active release, two final zero snapshots, and a distinct approval.

### Optional diagnostics

Retain:

- `apps/backend/test/generate-image-upload-memory-fixture.ts`;
- `apps/frontend/test/benchmark/image-upload-memory.benchmark.ts`;
- the pinned Chrome for Testing project and version; and
- the deterministic fixture digest and thresholds documented beside the benchmark.

These assets may be run during performance investigations or before a future release at operator discretion. They do not run in required CI, do not appear in production receipts, and do not block Phase 1 or Phase 2.

The optional benchmark must still fail closed when invoked: missing Chrome for Testing, fixture drift, rejected/non-finite measurements, an optimized delta above 512 MiB, or an optimized/control ratio above 0.50 remains a benchmark failure. Removing it as a release gate does not weaken the benchmark itself.

## Migration of fixtures and documentation

- Remove pass-fixture memory data.
- Replace memory-threshold fail fixtures with one schema regression proving a legacy `memory` field is rejected.
- Update the canonical spec, Stage 08/09 plans, runbook, and workflow contract language from “manual release gate” to “optional diagnostic.”
- Keep the three required CI contexts unchanged.
- Keep staging qualification and artifact retention unchanged.

## Release identity consequence

The correction changes the merged commit and therefore the commit-derived release fingerprint and immutable image reference. The staging receipt for `ec74631f72b4f48c55720d57f1161ef4b4e12dff` cannot authorize the new release. After this change merges, staging qualification must run once on the new merge commit and its protected receipt must replace the prior staging input for the new Phase 1 evidence.

## Cleanup

The old staging receipt and artifact are not deleted until the new staging run passes, its receipt is copied to the VPS, and its path/bytes are verified. After that replacement is bound into Phase 1, the old loose staging receipt becomes a purge candidate under the existing dry-run cleanup runbook. Encrypted database backups remain retained.

## Verification

1. A test first proves the current schema still requires `memory`.
2. The schema and verifier are changed minimally until a receipt without memory passes.
3. A legacy receipt containing `memory` must fail at `gate=schema`.
4. Final-ingress verifier tests, workflow verification, backend build, and existing image-upload tests remain green.
5. Repository search proves the benchmark assets remain and production-gate code no longer references memory evidence.

No deploy, staging dispatch, presign enablement, ingress change, evidence deletion, or cleanup occurs as part of this code change.
