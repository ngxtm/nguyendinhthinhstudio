# Production Album Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a review-gated, resumable Node.js importer that scans the supplied NDT Studio concept archive, generates AI-assisted album metadata, and safely uploads approved albums to the production API.

**Architecture:** A deterministic JSON manifest is the boundary between discovery/AI analysis and production mutation. Discovery reads JPEG metadata, groups capture sessions, splits groups at 50 images, prepares review thumbnails, and writes a draft manifest. Execution accepts only an approved manifest, optimizes sources to the existing WebP contract, resumes from a local journal, respects server rate limits, sets alt text and cover, applies approved tag backfill, and publishes only complete albums.

**Tech Stack:** Node.js 24 ESM, built-in `fetch`/`crypto`/`node:test`, existing `sharp`, production Nest API, OpenAI-compatible vision endpoint configured through environment variables.

---

## File map

- Create `scripts/album-import/constants.mjs`: upload, manifest, rate-limit, and path constants.
- Create `scripts/album-import/exif.mjs`: JPEG EXIF DateTimeOriginal extraction and session grouping.
- Create `scripts/album-import/images.mjs`: thumbnails and deterministic WebP preparation.
- Create `scripts/album-import/manifest.mjs`: manifest schema, validation, slugging, splitting, cover override, and approval digest.
- Create `scripts/album-import/ai.mjs`: OpenAI-compatible thumbnail analysis with strict structured output.
- Create `scripts/album-import/api.mjs`: production API, retry handling, idempotent album/image operations, tag backfill, cover, and publish.
- Create `scripts/album-import/journal.mjs`: atomic local progress journal without credentials.
- Create `scripts/album-import/scanner.mjs`: recursive JPEG discovery, EXIF records, thumbnails, and draft albums.
- Create `scripts/album-import/regroup.mjs`: overlap-window union of AI visual groups for images without EXIF.
- Create `scripts/import-ndt-albums.mjs`: `scan`, `enrich`, `validate`, and `execute` CLI.
- Create `scripts/album-import/*.test.mjs`: Node tests for pure contracts and mocked production workflows.
- Modify `package.json`: add explicit scan, enrich, validate, and execute commands.
- Modify `.gitignore`: exclude local manifests and generated review thumbnails.
- Create `docs/runbooks/production-album-import.md`: operator workflow including cover editing and resume.

No branch, commit, push, deployment, or real production mutation is part of implementation verification.

### Task 1: Manifest and source discovery contracts

**Files:**

- Create: `scripts/album-import/constants.mjs`
- Create: `scripts/album-import/exif.mjs`
- Create: `scripts/album-import/manifest.mjs`
- Test: `scripts/album-import/exif.test.mjs`
- Test: `scripts/album-import/manifest.test.mjs`

- [ ] **Step 1: Write failing tests**

Test NFC paths, EXIF precedence, session grouping, 50-image splitting, `#1`/`#2` names, slug collisions, missing EXIF review state, PSD exclusion, and approval digests.

Run:

```powershell
node --test scripts/album-import/exif.test.mjs scripts/album-import/manifest.test.mjs
```

Expected: FAIL because implementation modules do not exist.

- [ ] **Step 2: Implement source discovery and grouping**

Use this stable source record:

```js
{
  sourcePath: string,
  relativePath: string,
  normalizedFilename: string,
  sourceBytes: number,
  sourceSha256: string,
  capturedAt: string | null,
  reviewReasons: string[]
}
```

Use EXIF `DateTimeOriginal`, never filesystem modified time. Group adjacent captures with a configurable default 90-minute gap. Split groups over 50 images into numbered parts with independent cover and SEO.

- [ ] **Step 3: Implement canonical manifest serialization and approval digest**

The digest excludes execution state and binds album membership, metadata, cover, tag backfill, production origin, and source hashes. `execute` rejects a missing or stale digest.

- [ ] **Step 4: Run focused tests**

Expected: all Task 1 tests PASS.

### Task 2: Thumbnail, AI, and WebP preparation

**Files:**

- Create: `scripts/album-import/images.mjs`
- Create: `scripts/album-import/ai.mjs`
- Test: `scripts/album-import/images.test.mjs`
- Test: `scripts/album-import/ai.test.mjs`

- [ ] **Step 1: Write failing tests**

Cover rotation, 2560-pixel bounding, quality 84, 5 MiB rejection, NFC filenames, thumbnail-only AI payloads, strict categories/tags, SEO lengths, per-image alt text, and cover candidates.

- [ ] **Step 2: Implement deterministic image preparation**

Use existing `sharp`. Output must be non-empty WebP, at most 5 MiB, longest edge at most 2560, and include SHA-256 plus dimensions. Cache only when source hash and encoder contract match.

- [ ] **Step 3: Implement AI enrichment**

Read `NDT_AI_BASE_URL`, `NDT_AI_API_KEY`, and `NDT_AI_MODEL`; never log them. Send only reduced thumbnails. Require structured JSON with concept title, existing category/tag slugs, optional proposed tags, SEO, cover candidates, and alt text keyed by stable image ID. Unknown catalog entries become review issues.

- [ ] **Step 4: Run focused tests**

```powershell
node --test scripts/album-import/images.test.mjs scripts/album-import/ai.test.mjs
```

Expected: PASS without network access.

### Task 3: Production API and resumable journal

**Files:**

- Create: `scripts/album-import/api.mjs`
- Create: `scripts/album-import/journal.mjs`
- Test: `scripts/album-import/api.test.mjs`
- Test: `scripts/album-import/journal.test.mjs`

- [ ] **Step 1: Write failing mocked tests**

Cover bearer authentication, pinned production origin, 429 `retryAfter`, 60/10 pacing, idempotent lookup, checksum resume, partial failure isolation, 50-image capacity, cover-before-publish, tag backfill, and credential exclusion.

- [ ] **Step 2: Implement fail-closed API client**

Require `NDT_ADMIN_ACCESS_TOKEN`; pin origin to `https://api.ndtstudio.site`; reject redirects and absolute endpoints. Wait for server `retryAfter` on 429. Use bounded retry only for network and 5xx failures.

- [ ] **Step 3: Implement per-album workflow**

Create draft, upload missing WebPs, confirm/poll completion, patch alt text, verify count and membership, set cover, apply metadata, then publish. Failed invariants leave the album draft. Process oldest to newest and parts in numeric order.

- [ ] **Step 4: Implement journal persistence**

Write atomically through a temporary file and rename. Store hashes, remote IDs, upload IDs, outcomes, and timestamps. Never store tokens, presigned URLs, or AI credentials.

- [ ] **Step 5: Run focused tests**

```powershell
node --test scripts/album-import/api.test.mjs scripts/album-import/journal.test.mjs
```

Expected: PASS with mocked fetch and timers.

### Task 4: CLI and runbook

**Files:**

- Create: `scripts/import-ndt-albums.mjs`
- Modify: `package.json`
- Create: `docs/runbooks/production-album-import.md`
- Test: `scripts/album-import/cli.test.mjs`

- [ ] **Step 1: Write failing CLI tests**

Cover required arguments, dry-run defaults, explicit `--execute-production`, approval digest validation, refusal when review issues remain, and sanitized output.

- [ ] **Step 2: Implement commands**

```text
scan     -> inspect source and write draft manifest/thumbnails
enrich   -> AI-fill metadata without production mutation
validate -> validate, print summary, and write approval digest
execute  -> require --execute-production and matching approved digest
```

- [ ] **Step 3: Add package scripts and operator documentation**

Document exact `coverFile` edits, validation, token environment setup, dry-run, execution, resume, journal inspection, and tag-backfill review.

- [ ] **Step 4: Run CLI tests**

```powershell
node --test scripts/album-import/cli.test.mjs
```

Expected: PASS without production access.

### Task 5: Integrated verification

- [ ] **Step 1: Run importer tests**

```powershell
node --test scripts/album-import/*.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 2: Run source checks**

```powershell
npm run check-types
git diff --check
git status --short
```

Expected: type checks pass; no whitespace errors; only scoped importer, plan, runbook, and package files plus the user's pre-existing `note.md` appear.

- [ ] **Step 3: Run source scan only**

```powershell
npm run albums:import:scan -- --source "C:\Users\Minh\Downloads\Compressed\ndtstudio-concept\CONCEPT NguyenDinhThinh STUDIO - Nhatrang" --manifest ".artifacts\album-import\manifest.json"
npm run albums:import:validate -- --manifest ".artifacts\album-import\manifest.json"
```

Expected: 1,629 JPEGs discovered, PSD reported as skipped, no production mutation, no credentials written, and missing enrichment marked for review.

- [ ] **Step 4: Self-review**

Confirm no album description is generated, every publish requires complete images and a cover, old-album mutation occurs only through approved `tagBackfill`, and execution remains impossible without both the explicit flag and approval digest.

### Task 6: Resumable AI enrichment hardening

- [ ] Write failing tests for sanitized AI HTTP details, per-album checkpoint/resume, retry, progress output, approval invalidation, and concurrency bounded at two.
- [ ] Save a separate enrichment journal after each successful grouping window or album, and atomically persist the manifest after each applied album analysis.
- [ ] Reuse completed AI results on resume, record individual failures, retry transient `429`/`5xx` failures up to three times, and honor `Retry-After`.
- [ ] Print `grouping current/total` and `album current/total`; never include credentials or thumbnail data in output or journals.
- [ ] Update the runbook with the checkpoint path, resume behavior, and Node 24 commands. Do not make real AI or production calls during verification.
