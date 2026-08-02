# Album Import Repair Command Design

## Goal

Add a resumable `repair` command that resolves AI-generated manifest blockers without repeating visual grouping or complete album enrichment. It repairs missing image alt text in small batches, repairs invalid SEO and cover metadata, retains only existing production tags for this import, preserves a report of rejected proposed tags, and reports whether the manifest is ready for validation.

The command does not approve the manifest, upload images, create albums, publish albums, mutate production tags, or call any production write endpoint.

## Command

```powershell
npx -p node@24 node scripts/import-ndt-albums.mjs repair `
  --manifest ".artifacts\album-import\manifest.json"
```

The command uses the existing `NDT_AI_BASE_URL`, `NDT_AI_API_KEY`, and `NDT_AI_MODEL` environment variables. It reads the public production category, tag, and album catalogs only. An optional `--checkpoint` overrides the default repair checkpoint path:

```text
.artifacts\album-import\manifest.json.repair-journal.json
```

## Repair selection

The command processes only current blockers:

- `missing_alt_text:<imageId>` or an image with empty `altText`;
- `invalid_cover_candidate`;
- `meta_title_length`;
- `meta_description_length`;
- `proposed_tag:<slug>` and entries in `tagBackfill`.

It does not alter titles, slugs, album membership, categories, existing tag slugs, shoot dates, capture dates, source hashes, filenames, grouping results, or successful cover/SEO/alt values.

Any other review reason remains untouched and continues to block validation.

## Alt-text repair

Missing alt text is generated in deterministic manifest order using batches of at most eight images. Each AI request contains:

- album title and current category/tag slugs;
- exactly the stable image IDs in that batch;
- only the reduced WebP thumbnails for those images;
- an instruction to return one natural Vietnamese alt text for every supplied ID, with a maximum length of 180 characters and no keyword stuffing.

The response is accepted only if every requested image ID appears exactly once with a non-empty alt text no longer than 180 characters. A partial or malformed result fails that batch; it never checkpoints partial alt values.

After a successful batch, the command atomically:

1. saves the complete batch result to the repair journal;
2. applies alt text to the matching images;
3. removes only their corresponding `missing_alt_text:<imageId>` reasons;
4. saves the manifest without thumbnail data URLs.

Completed batches print `alt batch current/total` and resume without another AI request.

## SEO and cover repair

Albums containing `invalid_cover_candidate`, `meta_title_length`, or `meta_description_length` receive a specialized metadata repair request. It sends the album title, current SEO values, stable image IDs, and reduced thumbnails. It returns only:

- `metaTitle`, between 20 and 70 characters;
- `metaDescription`, between 50 and 170 characters;
- ordered `coverCandidates` containing valid image IDs.

The response is accepted only when all three contracts pass. The command updates the SEO fields and cover path, removes exactly the repaired review reasons, checkpoints the result, and persists the manifest. It does not regenerate titles, tags, categories, or alt text.

## Proposed-tag handling

The user chose existing production tags for this import. Before clearing unapproved proposals, the command writes:

```text
.artifacts/album-import/proposed-tags-review.md
```

The report preserves every unique proposed tag name/slug, every current album that requested it, and matching published production albums found by normalized title/category/tag search when available. Empty match lists are explicit.

After the report is written successfully, the command:

- retains all current `album.tagSlugs` because they already reference existing catalog tags;
- removes `proposed_tag:<slug>` reasons from albums;
- clears manifest `tagBackfill` so execution cannot create the unapproved tags;
- never creates, changes, deletes, or backfills a production tag.

Regenerating the report from the pre-clear manifest is supported through a pure renderer test, but the repair command writes the report before mutation in its normal workflow.

## Checkpoint and retry behavior

The repair journal is separate from enrichment and production journals. Its source digest binds the source root, album/image membership, stable image IDs, and source hashes while excluding repairable metadata so atomic progress does not make the journal stale.

AI calls retain the existing transient retry policy for `429`, network errors, and `5xx`, including `Retry-After`. Repair uses at most two concurrent AI requests. A failed batch or album is recorded with sanitized error text; unrelated items continue. Re-running the same command retries failed items and resumes completed ones.

Starting repair deletes any existing manifest approval before mutation. No credentials, thumbnails, presigned URLs, or complete provider response bodies are stored in the journal or reports.

## Completion summary

The final JSON summary contains:

```json
{
    "altBatches": 54,
    "metadataAlbums": 1,
    "discardedProposedTags": 41,
    "failed": 0,
    "remainingReviewAlbums": 0,
    "valid": true,
    "checkpointPath": ".artifacts/album-import/manifest.json.repair-journal.json",
    "proposedTagsReportPath": ".artifacts/album-import/proposed-tags-review.md"
}
```

Counts are derived from the current manifest and may differ from the example. `valid` uses the existing manifest validator without creating approval. Exit code is `0` only when no repair item failed; the summary may still report `valid: false` when an unrelated review reason remains.

## Current expected scope

At design time, the manifest contains:

- 123 albums with all naming checkpoint entries complete;
- 29 albums and 427 images missing alt text;
- 32 albums containing 57 proposed-tag reasons;
- 41 unique tag-backfill entries;
- one album with invalid cover and invalid meta title/meta description;
- no missing dates and no duplicate slugs.

The repair command discovers these values at runtime rather than hard-coding them.

## Testing and verification

Automated tests use mocked AI and public catalog responses to prove:

- alt batches contain at most eight thumbnails and require every image ID exactly once;
- partial alt responses fail without partial manifest mutation;
- successful batches checkpoint atomically and resume;
- metadata repair changes only cover and SEO fields;
- proposed tags are reported before being cleared, while existing tag slugs remain;
- source dates, titles, slugs, membership, categories, and existing tag slugs remain byte-equivalent in meaning;
- at most two AI calls run concurrently;
- transient failures retry and per-item failures do not discard successful repair work;
- repair never calls a production mutation endpoint or writes credentials;
- final validation summary is accurate and approval remains absent.

Verification must not call real AI, approve the working manifest, upload files, create tags, or mutate production.
