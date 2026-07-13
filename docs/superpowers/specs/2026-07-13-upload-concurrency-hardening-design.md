# Upload Concurrency Hardening Design

**Date:** 2026-07-13
**Status:** Pending written-spec review
**Scope:** Phase 4 upload confirmation, cleanup, album deletion, and PostgreSQL integration tests

## Context

Phase 4 persists upload sessions, verifies R2 objects, uses Serializable Prisma
transactions, and queues object deletion. Local unit tests, E2E authorization
tests, backend build, and Prisma schema validation pass. A source review found
four remaining correctness gaps:

1. Serializable transactions do not retry Prisma `P2034` transaction conflicts.
2. A stale `finalizing` upload session cannot be safely reclaimed using its R2
   ETag lease.
3. Cleanup treats every expired `finalizing` session as immediately removable,
   rather than applying separate grace and lease rules.
4. Concurrency tests mock Prisma and do not prove the 49/50 capacity boundary or
   distinct `orderIndex` values against PostgreSQL.

The review also found an album-deletion race: the current deletion code reads
the image list before it marks an album `deleting`. A presigned upload issued
before the lock can confirm between that stale read and album deletion, causing
the database cascade to remove an image whose R2 object was not queued.

## Goals

- Retry Serializable Prisma transaction conflicts up to three attempts.
- Reclaim only an old `finalizing` session whose temporary R2 object still has
  the ETag that the abandoned attempt recorded.
- Keep active uploads safe during a one-hour cleanup grace period.
- Queue every final R2 key that belongs to an album at the point it is deleted.
- Prove the capacity and ordering behavior with an isolated PostgreSQL database
  launched by Testcontainers.

## Non-goals

- Replace the existing R2 direct-upload protocol.
- Add a global database migration runner or change Dokploy deployment behavior.
- Add a unique `(albumId, orderIndex)` constraint; the existing reorder endpoint
  updates positions in-place and would require a separate reorder migration.
- Introduce a long-running upload worker.

## Confirm Transaction Retry

Add a focused helper in the image domain that invokes a Serializable Prisma
transaction and retries only errors with Prisma code `P2034`. It makes at most
three attempts, immediately rethrows non-transaction errors, and rethrows the
third `P2034` so the request does not pretend to have succeeded.

Use this helper for both confirmation transactions:

1. Capacity check plus `pending -> finalizing` reservation.
2. `Image` creation, next `orderIndex`, album counter increment, and
   `finalizing -> consumed` transition.

The final transaction remains atomic. A retry only repeats database work that
was rolled back by PostgreSQL; it never repeats the R2 copy after a committed
image row exists.

## Finalizing Lease Reclaim

`confirmUpload` loads the persisted session before promotion.

- `consumed` and `failed` remain terminal failures.
- `pending` follows the normal verify, reserve, promote, and consume flow.
- A `finalizing` session younger than ten minutes returns `409 Conflict`.
- For a `finalizing` session at least ten minutes old, confirm reads the
  temporary object and compares its current ETag with `sourceEtag`.
- If the ETag differs or `sourceEtag` is absent, the session becomes `failed`;
  no final object is promoted.
- If the ETag matches, a conditional update changes the old session back to
  `pending` and clears the old lease fields. Only the caller whose conditional
  update affects one row continues through a normal reservation attempt.

This makes a process crash recoverable without allowing a browser overwrite of
the temporary object to be promoted as the old upload.

## Cleanup Semantics

`UploadCleanupService` uses three independent selections:

| Session state | Eligible time | Object behavior |
|---|---|---|
| `pending` / `failed` | `expiresAt` older than one hour | Delete temporary key and unreferenced final key, then delete session |
| `finalizing` | `finalizationStartedAt` older than one hour | Delete temporary key; delete final key only when no `Image` references it; then delete session |
| `consumed` | `consumedAt` older than seven days | Delete only temporary key, then delete session |

The cleanup loop retains conditional `deleteMany` by session id and status.
Repeated R2 deletion is safe, but a conditional database delete prevents the
cleanup job from deleting a session that another confirmation flow changed.

## Album Deletion Consistency

Album deletion first persists `deleteStatus=deleting`, preventing all newly
requested presigned uploads. After expired cleanup, its retried Serializable
transaction reads the current album, active `pending`/`finalizing` sessions, and
current images inside the same transaction.

- If an active upload exists, it returns `409` and retains `deleting`.
- Otherwise, it upserts deletion queue rows from the freshly read image list,
  removes eligible upload-session rows, and deletes the album in that same
  transaction.
- The transaction retries `P2034` up to three times. A confirm racing with
  deletion either remains active and blocks deletion, or commits before the
  deletion retry reads the final image and queues its R2 key.

The preissued upload may still confirm after the album is locked, as required;
the deletion retry is responsible for observing and queueing its result.

## Integration Tests

Add `@testcontainers/postgresql` as a backend development dependency and a
dedicated Jest configuration plus `test:integration` script. The suite starts a
disposable PostgreSQL container, runs the repository's committed Prisma
migrations using the container connection, and disconnects/stops the container
after the suite.

The integration service uses a real Prisma client and deterministic mocked R2
and variant-URL collaborators. It verifies:

1. Two simultaneous confirmations at 49 existing images finish with exactly
   one new image and exactly one capacity failure.
2. Simultaneous successful confirmations persist distinct `orderIndex` values.
3. A retried album deletion sees an image confirmed after the first stale album
   snapshot and creates its R2 deletion queue row.

Fast unit tests cover retry counting, stale lease ETag match/mismatch, grace
period selection, active-session protection, and cleanup rerun idempotency.

## Failure and Rollback

`P2034` after all three attempts is surfaced as an error while the session stays
in its persisted state; it is not marked consumed or silently swallowed. ETag
mismatch marks only the affected session failed and leaves the canonical final
object unmodified.

These changes do not require a database migration. Rollback consists of
redeploying the previous application revision; persisted upload and deletion
rows remain compatible with it.

## Acceptance Criteria

- Unit tests prove exactly three `P2034` attempts and no retry for other errors.
- A stale finalizing session is reclaimed only when its stored and current ETag
  match; a fresh finalizing session returns `409`.
- Pending/failed sessions are retained for one hour after expiry, and
  finalizing sessions use `finalizationStartedAt` rather than `expiresAt`.
- Cleanup never deletes a canonical final key referenced by an `Image`.
- Album deletion queues every current R2 image key even when confirmation races
  with deletion.
- Testcontainers PostgreSQL tests pass for the 49/50 boundary and concurrent
  `orderIndex` behavior.
