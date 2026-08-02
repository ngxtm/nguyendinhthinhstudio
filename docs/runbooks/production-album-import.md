# Production album import runbook

This importer is deliberately two-phase. The scan, enrich, and validate commands do not mutate production. Only execute with --execute-production can create, upload, tag, cover, or publish albums.

## 1. Scan the source archive

Use Node 24 or newer. The repository currently exposes Node 14 on this machine, so use the repository's supported runtime (for example npx -p node@24 node) when invoking the script directly.

```powershell
npx -p node@24 node scripts/import-ndt-albums.mjs scan `
  --source "C:\Users\Minh\Downloads\Compressed\ndtstudio-concept\CONCEPT NguyenDinhThinh STUDIO - Nhatrang" `
  --manifest ".artifacts\album-import\manifest.json"
```

The scan reads JPEG EXIF, groups 90-minute capture sessions, creates review thumbnails, splits albums at 50 images, and records the PSD as skipped. Titles such as "Session 2025-..." are provisional and are replaced during enrichment. Images without EXIF are stored in the top-level unassignedImages pool instead of becoming one-image albums. It never calls the production API.

## 2. Enrich metadata

The AI step sends only reduced WebP thumbnails. It does not send source JPEGs. Configure the endpoint only in the process environment:

```powershell
$env:NDT_AI_BASE_URL = "https://your-openai-compatible-endpoint"
$env:NDT_AI_API_KEY = "<not printed or committed>"
$env:NDT_AI_MODEL = "gpt-5.6-terra"
npx -p node@24 node scripts/import-ndt-albums.mjs enrich `
  --manifest ".artifacts\album-import\manifest.json"
```

Set these variables in the same PowerShell window that runs enrich. Do not save the API key in an .env file or the manifest.

Enrichment first groups unassigned images with overlapping thumbnail windows, then generates the final concept title, slug, category, tags, SEO, cover candidates, and per-image alt text for every album. Unknown categories, proposed tags, missing EXIF dates, invalid SEO, and missing alt text remain review issues. Proposed tags create a separate tagBackfill section; do not approve until its old-album list is correct.

Album naming uses prompt version `artistic-collection-v2`. Beauty, Fashion, Editorial, Glamour, Cyber, and modern studio concepts may receive a polished English collection name. Áo dài, Vietnamese wedding, family, heritage, and traditional concepts prefer poetic Vietnamese or Hán–Việt written with the Vietnamese Latin alphabet. The prompt rejects literal descriptions and repetitive templates such as `Nàng Thơ`, `Bộ Ảnh`, `Chàng Trai`, and `Portrait`.

When this naming version is first used, the seven completed visual-grouping windows remain resumable, but older album-analysis checkpoint entries are refreshed once. The importer reads public production album titles and also reserves titles accepted during the current run. A duplicate final title/slug is sent back to AI for another name, up to three naming attempts; an unresolved collision is recorded as a failure instead of receiving an arbitrary numeric suffix. Subsequent runs reuse successful `artistic-collection-v2` album results.

The command prints progress such as `grouping 3/7` and `album 42/115`. Album analysis uses at most two concurrent AI requests. Transient `429` and `5xx` responses are retried up to three times, honoring `Retry-After` when present. A provider error includes only a bounded, sanitized error code/message; credentials and image data are never written to output.

Progress is saved atomically after every successful grouping window and album in:

```text
.artifacts\album-import\manifest.json.enrich-journal.json
```

If PowerShell closes, the network drops, or an AI item fails, run the same command again. Completed grouping windows and albums print `resumed` and are not sent to AI again. Failed items are retried while previously successful manifest changes remain intact. You may override the checkpoint location with `--checkpoint <path>`, but must keep using the same checkpoint for that manifest.

Starting enrichment removes any existing approval digest immediately. After enrichment is fully successful and the manifest has been reviewed, approval must be created again in step 4.

## 3. Repair incomplete AI metadata

If enrichment finishes but validation reports missing alt text, invalid cover/SEO, or unapproved proposed tags, run:

```powershell
npx -p node@24 node scripts/import-ndt-albums.mjs repair `
  --manifest ".artifacts\album-import\manifest.json"
```

Repair generates missing alt text in batches of at most eight images, repairs only invalid SEO/cover fields, and checkpoints progress at `.artifacts\album-import\manifest.json.repair-journal.json`. Re-run the same command after an interruption; completed batches print `resumed` and are not sent to AI again.

Unapproved proposed tags are preserved in `.artifacts\album-import\proposed-tags-review.md` and removed from this import. Existing production tag assignments remain unchanged. Repair never approves the manifest or calls a production write endpoint. Continue only when its final summary has `failed: 0`, `remainingReviewAlbums: 0`, and `valid: true`.

## 4. Review albums without EXIF dates

Generate the review report without calling AI or production and without modifying the manifest:

```powershell
npx -p node@24 node scripts/import-ndt-albums.mjs report-missing-exif `
  --manifest ".artifacts\album-import\manifest.json" `
  --output ".artifacts\album-import\missing-exif-albums.md"
```

The Markdown report lists the current title, slug, image count, cover path, every source image path, and an empty `Chosen shoot date` field. Supply a real `YYYY-MM-DD` date and clear the corresponding `missing_exif_date` review state in the manifest, or explicitly remove that album from this import. Approval remains blocked while an album or any image lacks its required capture date.

## 5. Change a cover in the manifest

Open the manifest and find the album's coverFile:

```json
{
    "title": "Dạ Tiệc Đỏ",
    "slug": "da-tiec-do",
    "coverFile": "folder/photo-0123.jpg",
    "images": [
        { "relativePath": "folder/photo-0123.jpg", "id": "image-..." },
        { "relativePath": "folder/photo-0150.jpg", "id": "image-..." }
    ]
}
```

Replace coverFile with the exact relativePath of any image in that same album. The value is Unicode NFC normalized and must not be an absolute path. Run validation again; a cover not present in the album is rejected.

## 6. Validate and approve

```powershell
npx -p node@24 node scripts/import-ndt-albums.mjs validate `
  --manifest ".artifacts\album-import\manifest.json" `
  --approve
```

Approval writes a digest over album metadata, source hashes, covers, and tag backfill. Any subsequent edit invalidates the digest; validate with --approve again.

## 7. Execute production

Use a short-lived admin Supabase access token. Never put it in the manifest, journal, command history, logs, or git:

```powershell
$env:NDT_ADMIN_ACCESS_TOKEN = "<short-lived-admin-access-token>"
npx -p node@24 node scripts/import-ndt-albums.mjs execute `
  --manifest ".artifacts\album-import\manifest.json" `
  --execute-production
```

The runner processes oldest shoot date first, respects 60 presign and 60 confirm admissions per 10-minute rolling window, waits for server retryAfter, resumes from its journal, and publishes an album only after all images are completed, alt text is patched, membership is verified, and a cover is set.

The journal is written beside the source root as <sourceRoot>.album-import-journal.json. It contains IDs, hashes, and outcomes only; it never contains tokens or presigned URLs. Re-run the same command to resume. A slug that exists without a matching journal is a hard review error.

## 8. Failure handling

An image or album failure is recorded and does not stop unrelated albums. Failed albums remain draft. Fix the manifest/source or wait for the rate window, then re-run. Do not manually publish an album that has not passed the membership and cover checks.
