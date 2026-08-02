# Album Import Repair Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a resumable `repair` command that fills missing alt text in bounded batches, repairs cover/SEO blockers, reports and rejects unapproved proposed tags, and reports manifest validity without touching production.

**Architecture:** Specialized AI functions produce strictly validated alt-batch and metadata-repair results. A repair orchestrator owns a separate atomic journal, bounded concurrency, manifest commits, and tag-proposal cleanup. Pure report renderers preserve rejected proposals before the CLI mutates the manifest.

**Tech Stack:** Node.js 24 ESM, built-in `fetch`/`crypto`/`node:test`, existing thumbnail/journal/manifest modules, OpenAI-compatible chat completions.

**Execution constraint:** Do not create a branch, commit, push, call real AI, approve the working manifest, upload files, create tags, or mutate production. Preserve `note.md` and all unrelated working-tree changes.

---

## File map

- Create `scripts/album-import/repair-ai.mjs`: strict alt-batch and SEO/cover AI requests.
- Create `scripts/album-import/repair-ai.test.mjs`: payload allowlist and complete-response validation.
- Create `scripts/album-import/proposed-tags-report.mjs`: deterministic rejected-tag Markdown report.
- Create `scripts/album-import/proposed-tags-report.test.mjs`: tag aggregation and rendering tests.
- Create `scripts/album-import/repair.mjs`: selection, checkpoint, concurrency, atomic apply, tag cleanup, and completion summary.
- Create `scripts/album-import/repair.test.mjs`: integration tests using mocked AI/catalog.
- Modify `scripts/import-ndt-albums.mjs`: add the `repair` command and inject dependencies.
- Modify `scripts/album-import/cli.test.mjs`: command parsing, no-production-write, and summary tests.
- Modify `docs/runbooks/production-album-import.md`: repair and resume commands.

### Task 1: Strict repair AI contracts

**Files:**

- Create: `scripts/album-import/repair-ai.mjs`
- Create: `scripts/album-import/repair-ai.test.mjs`

- [ ] **Step 1: Write failing alt-batch tests**

Create fixtures for nine images and assert `buildAltRepairMessages` rejects more than eight images. For an eight-image batch, assert serialized messages contain only album title/category/tag slugs, stable IDs, and `thumbnailDataUrl`; they must not contain `sourcePath`, full-size data, credentials, or unrelated album images.

Test `parseAltRepairResult` with this complete response:

```js
{
    imageAltTexts: {
        'image-1': 'Chân dung người mẫu dưới ánh sáng studio dịu nhẹ.',
        'image-2': 'Người mẫu tạo dáng trong không gian tối giản.',
    },
}
```

Assert partial, unknown, duplicate-equivalent, empty, and over-180-character values throw before returning any result.

- [ ] **Step 2: Write failing metadata-repair tests**

Assert `buildMetadataRepairMessages` includes current title/meta fields, all stable image IDs, and reduced thumbnails, while requesting only `metaTitle`, `metaDescription`, and `coverCandidates`. Assert `parseMetadataRepairResult` accepts lengths 20–70 and 50–170 with a valid cover ID, and rejects invalid lengths or cover IDs.

- [ ] **Step 3: Verify RED**

Run:

```powershell
npx -p node@24 node --test scripts/album-import/repair-ai.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `repair-ai.mjs`.

- [ ] **Step 4: Implement the repair AI module**

Export exactly:

```js
export const ALT_REPAIR_BATCH_SIZE = 8;
export function buildAltRepairMessages({ album, images });
export function parseAltRepairResult(value, { imageIds });
export async function repairAltBatchWithAi(options);
export function buildMetadataRepairMessages({ album });
export function parseMetadataRepairResult(value, { imageIds });
export async function repairMetadataWithAi(options);
```

Use the same endpoint construction, bearer header, JSON response format, HTTP error sanitization, and retry metadata shape as `ai.mjs`; export shared request plumbing from `ai.mjs` rather than duplicating credential handling. Alt parsing iterates the requested IDs and returns a new exact `imageAltTexts` object only after every entry validates. Metadata parsing returns trimmed fields and the first valid cover candidate.

- [ ] **Step 5: Verify GREEN**

Run Task 1 tests. Expected: all PASS without network.

### Task 2: Proposed-tag preservation report

**Files:**

- Create: `scripts/album-import/proposed-tags-report.mjs`
- Create: `scripts/album-import/proposed-tags-report.test.mjs`

- [ ] **Step 1: Write failing aggregation tests**

Use a manifest where two albums request the same proposed slug and `tagBackfill` contains its name. Use published catalog fixtures with matching title/category/tag text. Assert `collectProposedTagReview` returns one normalized tag entry, both requesting album slugs, and matching published album titles in stable order.

- [ ] **Step 2: Write failing Markdown tests**

Assert `renderProposedTagsReport` contains the tag name/slug, requesting albums, published matches, and an explicit `None found` value when no matches exist. Assert Markdown punctuation and backticks are safely escaped and no absolute source path, token, thumbnail, or provider response is serialized.

- [ ] **Step 3: Verify RED**

Run:

```powershell
npx -p node@24 node --test scripts/album-import/proposed-tags-report.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 4: Implement pure collection and rendering**

Export:

```js
export function collectProposedTagReview(manifest, publishedAlbums = []);
export function renderProposedTagsReport(manifest, publishedAlbums = []);
```

Collect proposals from both `album.needsReview` prefixes and `manifest.tagBackfill`. Join requesting albums by slug. Match published albums case-insensitively against proposed name/slug using album title, category names/slugs, and tag names/slugs. Render stable Markdown without mutating inputs.

- [ ] **Step 5: Verify GREEN**

Run Task 2 tests. Expected: all PASS.

### Task 3: Resumable repair orchestrator

**Files:**

- Create: `scripts/album-import/repair.mjs`
- Create: `scripts/album-import/repair.test.mjs`

- [ ] **Step 1: Write failing selection and preservation test**

Build a manifest containing complete values plus nine missing alt texts, one SEO/cover blocker, proposed tags, resolved manual dates, and an approval. Run the wished-for API:

```js
const result = await repairManifest({
    manifest,
    manifestPath,
    checkpointPath,
    proposedTagsReportPath,
    catalog,
    attachThumbnails,
    repairAltBatch,
    repairMetadata,
    sleep: async () => {},
});
```

Assert two alt batches are requested with sizes eight and one. Assert titles, slugs, membership, categories, existing tags, `shootDate`, `capturedAt`, and pre-existing valid values are unchanged. Assert approval is removed.

- [ ] **Step 2: Write failing checkpoint/resume and failure-isolation tests**

Make batch one succeed and batch two throw a transient `503` three times. Assert batch one is in the manifest/journal, batch two is failed, and exit summary reports one failure. Re-run with batch two succeeding; assert batch one is not called again and all missing-alt reasons are removed.

Assert two delayed mock AI operations can overlap but observed active calls never exceed two.

- [ ] **Step 3: Write failing metadata and tag-cleanup tests**

Return valid repaired SEO/cover and assert only those fields/reasons change. Assert the proposed-tag report exists before `tagBackfill` becomes empty, all `proposed_tag:` reasons are removed, and existing `tagSlugs` remain identical. Inject report-write failure and assert proposed tags are not cleared.

- [ ] **Step 4: Verify RED**

Run:

```powershell
npx -p node@24 node --test scripts/album-import/repair.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 5: Implement repair discovery and stable keys**

Export `repairManifest(options)`. Build alt work items in album/image manifest order using chunks of `ALT_REPAIR_BATCH_SIZE`. Key each batch with SHA-256 of `alt`, album image-membership key, and ordered batch IDs. Key metadata work with SHA-256 of `metadata` and album image IDs. Compute a repair source digest from source root, source hashes, and membership only.

- [ ] **Step 6: Implement bounded workers and serialized commits**

Reuse or extract the existing `retryAi`, concurrency-two mapper, error sanitizer, thumbnail stripping, and commit queue. AI work runs outside the commit queue; journal/manifest/report mutation runs inside it. Store complete validated results before applying them, so a crash between journal and manifest writes resumes without another AI call.

- [ ] **Step 7: Implement exact mutation rules**

For alt batches, update only blank target `altText` fields and remove exact `missing_alt_text:<id>` reasons. For metadata, update only invalid fields and remove `invalid_cover_candidate`, `meta_title_length`, and `meta_description_length`. Write the proposed-tag report atomically, then remove `proposed_tag:` reasons and clear `tagBackfill`. Never alter dates, names, membership, categories, existing tags, or valid metadata.

- [ ] **Step 8: Implement completion summary**

Call `validateManifest` without approval and return:

```js
{
    manifest,
    altBatches,
    metadataAlbums,
    discardedProposedTags,
    failed,
    remainingReviewAlbums,
    valid: validation.valid,
    checkpointPath,
    proposedTagsReportPath,
}
```

Exit status is decided by the CLI: `1` when `failed > 0`, otherwise `0`, even when unrelated review issues leave `valid: false`.

- [ ] **Step 9: Verify GREEN**

Run Task 3 tests. Expected: all PASS.

### Task 4: CLI, runbook, and integrated verification

**Files:**

- Modify: `scripts/import-ndt-albums.mjs`
- Modify: `scripts/album-import/cli.test.mjs`
- Modify: `docs/runbooks/production-album-import.md`

- [ ] **Step 1: Write failing CLI tests**

Assert `parseCliArgs` accepts `repair`. Run `repair --manifest <temp>` with injected catalog and AI dependencies; assert summary JSON, checkpoint/report paths, and exit status. Make every fetch URL assertion allow only pinned public GET catalog endpoints and fail on methods other than GET or any admin/write path.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx -p node@24 node --test scripts/album-import/cli.test.mjs
```

Expected: FAIL because `repair` is not recognized.

- [ ] **Step 3: Implement CLI wiring**

Add `repair` to the command allowlist. Require `--manifest`; default paths to `<manifest>.repair-journal.json` and `<manifest directory>/proposed-tags-review.md`. Fetch public catalogs, attach thumbnails, pass injected/default repair AI functions, print the exact result summary, and never read `NDT_ADMIN_ACCESS_TOKEN` or invoke production mutation classes.

- [ ] **Step 4: Update runbook**

Document the exact repair command, checkpoint/report locations, `resumed` behavior, tag-rejection policy, validation summary, and the requirement to run `validate --approve` only after `valid: true` and manual review.

- [ ] **Step 5: Format and run all importer tests**

Run:

```powershell
npx -p node@24 node node_modules/prettier/bin/prettier.cjs --write scripts/import-ndt-albums.mjs scripts/album-import/repair-ai.mjs scripts/album-import/repair-ai.test.mjs scripts/album-import/proposed-tags-report.mjs scripts/album-import/proposed-tags-report.test.mjs scripts/album-import/repair.mjs scripts/album-import/repair.test.mjs scripts/album-import/cli.test.mjs docs/runbooks/production-album-import.md docs/superpowers/specs/2026-08-01-album-import-repair-design.md docs/superpowers/plans/2026-08-01-album-import-repair.md
npx -p node@24 node --test scripts/album-import/*.test.mjs
```

Expected: all tests PASS without real AI/production calls.

- [ ] **Step 6: Run repository safety checks**

Run:

```powershell
npx -p node@24 npm run check-types
git diff --check
git status --short
```

Scan changed source for secret-like literals and thumbnail data embedded in journals/reports. Expected: checks exit `0`; only scoped importer/docs changes plus preserved earlier work and untouched `note.md` appear.

- [ ] **Step 7: Do not run real repair yet**

Hand the verified command to the user. Real repair uses paid AI and modifies the current manifest, so implementation verification stops before invoking it.
