# Artistic Album Naming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh AI album metadata with artistic English or Vietnamese/Hán–Việt collection names, reject production/import slug collisions automatically, and generate a detailed report for the 25 missing-EXIF albums.

**Architecture:** Keep visual grouping and its checkpoint intact, but version album-analysis prompts so existing v1 album results are refreshed once. A small naming-policy module owns prompt version and slug reservations; AI messages receive explicit artistic language rules and collision exclusions. A separate pure review-report module renders missing-date albums to Markdown, while the CLI coordinates checkpointed refresh, bounded collision retries, and report output.

**Tech Stack:** Node.js 24 ESM, built-in `fetch`/`crypto`/`node:test`, OpenAI-compatible chat completions, existing atomic JSON journal, production public album API.

**Execution constraint:** Do not create a branch, commit, push, call real AI, approve the working manifest, upload images, or mutate production. Preserve the user's untracked `note.md`.

---

## File map

- Create `scripts/album-import/naming.mjs`: naming prompt version, Hán–Việt/English policy text, and normalized title/slug reservation registry.
- Create `scripts/album-import/naming.test.mjs`: prompt-version and reservation contracts.
- Modify `scripts/album-import/ai.mjs`: include artistic policy, production exclusions, and rejected-title context in album vision messages.
- Modify `scripts/album-import/ai.test.mjs`: assert the exact naming constraints and exclusions sent to AI.
- Modify `scripts/import-ndt-albums.mjs`: fetch public production titles, refresh stale album checkpoint entries, reserve final part-aware slugs, and retry collisions.
- Modify `scripts/album-import/enrichment.test.mjs`: prove v1 refresh, v2 resume, production/import collision retries, and bounded failure.
- Create `scripts/album-import/review-report.mjs`: find missing-date albums and render deterministic Markdown.
- Create `scripts/album-import/review-report.test.mjs`: report inclusion, paths, date field, and escaping.
- Modify `scripts/album-import/cli.test.mjs`: cover `report-missing-exif` argument parsing, output, and no-network behavior.
- Modify `docs/runbooks/production-album-import.md`: document artistic refresh, automatic collision handling, report generation, and manual date review.
- Generate `.artifacts/album-import/missing-exif-albums.md`: current 25-album/166-image operator report; ignored by git.

### Task 1: Naming policy and prompt version

**Files:**

- Create: `scripts/album-import/naming.mjs`
- Create: `scripts/album-import/naming.test.mjs`
- Modify: `scripts/album-import/ai.mjs:1-55,296-310`
- Modify: `scripts/album-import/ai.test.mjs`

- [ ] **Step 1: Write failing naming-policy tests**

Create `scripts/album-import/naming.test.mjs` with tests expressing the public contract:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ALBUM_NAMING_PROMPT_VERSION,
    AlbumTitleRegistry,
    ARTISTIC_NAMING_POLICY,
} from './naming.mjs';

test('publishes a stable v2 artistic naming prompt version and policy', () => {
    assert.equal(ALBUM_NAMING_PROMPT_VERSION, 'artistic-collection-v2');
    assert.match(ARTISTIC_NAMING_POLICY, /English editorial/i);
    assert.match(ARTISTIC_NAMING_POLICY, /Hán–Việt/);
    assert.match(ARTISTIC_NAMING_POLICY, /Chinese characters/i);
    assert.match(ARTISTIC_NAMING_POLICY, /Nàng Thơ/);
    assert.match(ARTISTIC_NAMING_POLICY, /Portrait/);
});

test('reserves normalized titles and slugs without hiding accent collisions', () => {
    const registry = new AlbumTitleRegistry([{ title: 'Xích Điệp', slug: 'xich-diep' }]);

    assert.deepEqual(registry.tryReserve('Xích Điệp', 'xich-diep'), {
        accepted: false,
        conflictTitle: 'Xích Điệp',
    });
    assert.equal(registry.tryReserve('Scarlet Reverie', 'scarlet-reverie').accepted, true);
    assert.equal(registry.hasSlug('scarlet-reverie'), true);
});
```

Extend `scripts/album-import/ai.test.mjs` so `buildVisionMessages` receives:

```js
namingContext: {
    reservedTitles: ['Midnight Frequency', 'Xích Điệp'],
    rejectedTitle: 'Beauty Portrait',
}
```

Assert the serialized request contains `artistic-collection-v2`, the English/editorial and Vietnamese/Hán–Việt selection rules, the instruction to use Vietnamese Latin spelling rather than Chinese characters, banned templates, both reserved titles, and the rejected title.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
npx -p node@24 node --test scripts/album-import/naming.test.mjs scripts/album-import/ai.test.mjs
```

Expected: FAIL because `naming.mjs`, `ALBUM_NAMING_PROMPT_VERSION`, `AlbumTitleRegistry`, and the new AI naming context do not exist.

- [ ] **Step 3: Implement the naming module**

Create `scripts/album-import/naming.mjs` with these exports:

```js
export const ALBUM_NAMING_PROMPT_VERSION = 'artistic-collection-v2';

export const ARTISTIC_NAMING_POLICY = `Create a distinctive 2–4 word photography collection name rather than a literal inventory of visible details. Beauty, Fashion, Editorial, Glamour, Cyber, and modern studio concepts may use polished English editorial names. Áo dài, Vietnamese wedding, family, heritage, and traditional concepts should prefer poetic Vietnamese or Hán–Việt names. Hán–Việt must use Vietnamese Latin spelling, never Chinese characters. Use one coherent language and never mix English and Vietnamese awkwardly. Avoid repetitive templates including Nàng Thơ, Bộ Ảnh, Chàng Trai, Portrait, and Beauty Portrait. Do not reuse a reserved or rejected title. Keep clothing, props, colors, and poses in SEO metadata and alt text instead of the collection name.`;

function normalizeSlug(value) {
    return String(value ?? '')
        .normalize('NFC')
        .trim()
        .toLowerCase();
}

export class AlbumTitleRegistry {
    constructor(entries = []) {
        this.bySlug = new Map();
        for (const entry of entries) {
            const slug = normalizeSlug(entry?.slug);
            const title = typeof entry?.title === 'string' ? entry.title.trim() : '';
            if (slug && title && !this.bySlug.has(slug)) this.bySlug.set(slug, title);
        }
    }

    hasSlug(slug) {
        return this.bySlug.has(normalizeSlug(slug));
    }

    tryReserve(title, slug) {
        const normalizedSlug = normalizeSlug(slug);
        const normalizedTitle = String(title ?? '')
            .normalize('NFC')
            .trim();
        const conflictTitle = this.bySlug.get(normalizedSlug);
        if (conflictTitle) return { accepted: false, conflictTitle };
        this.bySlug.set(normalizedSlug, normalizedTitle);
        return { accepted: true, conflictTitle: null };
    }

    titles() {
        return [...this.bySlug.values()];
    }
}
```

The full policy string must state:

- title is a 2–4 word collection name, not a literal inventory of image details;
- Beauty/Fashion/Editorial/Glamour/Cyber may use polished English;
- áo dài/wedding/family/heritage should prefer poetic Vietnamese or Hán–Việt;
- Hán–Việt uses Vietnamese Latin spelling and never Chinese characters;
- do not awkwardly mix languages;
- avoid `Nàng Thơ`, `Bộ Ảnh`, `Chàng Trai`, `Portrait`, `Beauty Portrait`, and visible-object lists;
- do not reuse any supplied reserved or rejected title;
- literal visual details remain in meta description and alt text.

- [ ] **Step 4: Add naming context to AI messages**

Change the album APIs to:

```js
export function buildVisionMessages({ album, catalog, namingContext = {} })

export async function analyzeAlbumWithAi({
    album,
    catalog,
    namingContext = {},
    fetchImpl = fetch,
    baseUrl = process.env.NDT_AI_BASE_URL,
    apiKey = process.env.NDT_AI_API_KEY,
    model = process.env.NDT_AI_MODEL,
})
```

Include this bounded data in the first text message:

```js
naming: {
    promptVersion: ALBUM_NAMING_PROMPT_VERSION,
    policy: ARTISTIC_NAMING_POLICY,
    reservedTitles: uniqueStrings(namingContext.reservedTitles).slice(0, 250),
    rejectedTitle: namingContext.rejectedTitle ?? null,
}
```

Do not include credentials, source paths, production album objects, or more than 250 reserved titles.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the Task 1 test command again. Expected: all naming and AI tests PASS.

### Task 2: Versioned album refresh and collision repair

**Files:**

- Modify: `scripts/import-ndt-albums.mjs:64-75,224-345`
- Modify: `scripts/album-import/enrichment.test.mjs`

- [ ] **Step 1: Write a failing old-version refresh test**

Extend `scripts/album-import/enrichment.test.mjs` with a fixture checkpoint containing:

```js
albums: {
    [albumKey]: {
        outcome: 'complete',
        promptVersion: 'legacy-v1',
        analysis: analysisFor(album),
    },
},
```

Run `enrich` with mocked catalog/network and assert:

```js
assert.equal(aiCalls, 1);
assert.equal(updatedCheckpoint.albums[albumKey].promptVersion, 'artistic-collection-v2');
assert.equal(groupingCalls, 0);
```

The test must also run a second time and assert `aiCalls` remains unchanged because the v2 result resumes.

- [ ] **Step 2: Write failing collision tests**

Add one test where production catalog returns `{ title: 'Midnight Frequency', slug: 'midnight-frequency' }`. Mock album AI to return that title first and `Scarlet Reverie` second. Assert:

```js
assert.equal(aiCalls, 2);
assert.equal(manifest.albums[0].title, 'Scarlet Reverie');
assert.equal(manifest.albums[0].slug, 'scarlet-reverie');
assert.equal(seenContexts[1].rejectedTitle, 'Midnight Frequency');
assert.ok(seenContexts[1].reservedTitles.includes('Midnight Frequency'));
```

Add a two-album test where both first results slugify to `xich-diep`; assert one album is retried and final manifest slugs are unique.

Add a failure test where all three naming attempts collide; assert exit code `1`, the album checkpoint outcome is `failed`, and `lastError` contains `duplicate_album_slug` without a credential or image data URL.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```powershell
npx -p node@24 node --test scripts/album-import/enrichment.test.mjs
```

Expected: FAIL because album checkpoints currently ignore prompt versions, production album names are not fetched, and duplicate AI titles are committed directly.

- [ ] **Step 4: Fetch the public production title catalog**

Extend `fetchCatalog(fetchImpl)` to request these three pinned endpoints in parallel:

```text
https://api.ndtstudio.site/categories
https://api.ndtstudio.site/tags
https://api.ndtstudio.site/albums?limit=50&sortBy=newest
```

Require all responses to be successful. Parse the album response as `{ data: [albumEntry] }` and retain only bounded `{ title, slug }` strings under `catalog.albums`. Update every mocked `fetchImpl` in CLI/enrichment tests to return `{ data: [] }` when the URL pathname is `/albums`.

- [ ] **Step 5: Refresh only stale prompt-version entries**

Import `ALBUM_NAMING_PROMPT_VERSION` and `AlbumTitleRegistry`. Reuse an album checkpoint only when all conditions hold:

```js
entry?.outcome === 'complete' &&
    entry.promptVersion === ALBUM_NAMING_PROMPT_VERSION &&
    entry.analysis;
```

Store `promptVersion: ALBUM_NAMING_PROMPT_VERSION` with every newly completed album analysis. Do not version or clear `checkpoint.grouping`; the seven existing grouping results remain valid.

- [ ] **Step 6: Implement bounded collision repair**

Initialize the registry from `catalog.albums`. For each album, use at most three naming attempts. Each attempt:

1. Calls `aiAnalyze({ album, catalog, namingContext, fetchImpl })` through existing transient retry handling, unless a current-version checkpoint analysis is available for the first attempt.
2. Computes the final part-aware title and slug using `formatPartTitle` and `slugify`.
3. Enters the existing serialized commit queue and calls `registry.tryReserve(finalTitle, finalSlug)`.
4. On acceptance, stores the current prompt version, applies all metadata, persists checkpoint then manifest, and prints progress.
5. On collision, leaves the commit queue, sets `namingContext.rejectedTitle` and a snapshot of `registry.titles()`, then requests a new analysis.

After three conflicts, save:

```js
{
    outcome: 'failed',
    promptVersion: ALBUM_NAMING_PROMPT_VERSION,
    attempts: 3,
    lastError: 'duplicate_album_slug:<slug>',
}
```

Do not append arbitrary numeric slug suffixes. Legitimate split-part `#1`/`#2` names remain unique through `formatPartTitle`.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run the Task 2 test command. Expected: all enrichment tests PASS, including existing checkpoint/concurrency/retry tests.

### Task 3: Missing-EXIF Markdown report

**Files:**

- Create: `scripts/album-import/review-report.mjs`
- Create: `scripts/album-import/review-report.test.mjs`
- Modify: `scripts/import-ndt-albums.mjs:25-45,437-470`
- Modify: `scripts/album-import/cli.test.mjs`

- [ ] **Step 1: Write failing pure report tests**

Create a manifest fixture containing one normal album and one album with `shootDate: null`, `needsReview: ['missing_exif_date']`, a cover, and two image paths. Assert:

```js
const missing = findMissingExifAlbums(manifest);
assert.equal(missing.length, 1);

const markdown = renderMissingExifReport(manifest);
assert.match(markdown, /Missing-EXIF album review/);
assert.match(markdown, /Albums: 1/);
assert.match(markdown, /Images: 2/);
assert.match(markdown, /Chosen shoot date: `YYYY-MM-DD`/);
assert.match(markdown, /folder\/cover\.jpg/);
assert.match(markdown, /folder\/second\.jpg/);
assert.doesNotMatch(markdown, /normal-album/);
```

Include a title/path containing Markdown punctuation and assert it is rendered safely without breaking headings or code spans.

- [ ] **Step 2: Run report tests and verify RED**

Run:

```powershell
npx -p node@24 node --test scripts/album-import/review-report.test.mjs
```

Expected: FAIL because `review-report.mjs` does not exist.

- [ ] **Step 3: Implement pure report generation**

Export:

```js
export function findMissingExifAlbums(manifest)
export function renderMissingExifReport(manifest)
```

An album is included when `shootDate` is empty, `needsReview` contains `missing_exif_date`, or any image has no `capturedAt`. Preserve manifest order. Markdown must include generated source manifest path only when supplied separately by the CLI; the pure renderer must contain no absolute source root, token, thumbnail data URL, or checkpoint analysis.

- [ ] **Step 4: Write failing CLI report test**

Extend parsing to expect `report-missing-exif` as a valid command. In a temporary directory run:

```js
await runCli(['report-missing-exif', '--manifest', manifestPath, '--output', outputPath], {
    fetchImpl: async () => assert.fail('report must not call network'),
});
```

Assert exit code `0`, the output file contents equal `renderMissingExifReport(manifest)`, stdout reports the album/image counts and resolved output path, and the manifest bytes before/after are identical.

- [ ] **Step 5: Run CLI tests and verify RED**

Run:

```powershell
npx -p node@24 node --test scripts/album-import/cli.test.mjs
```

Expected: FAIL because the command is not recognized.

- [ ] **Step 6: Implement the report command**

Add `report-missing-exif` to `parseCliArgs`. Require `--manifest`; default `--output` to `join(dirname(manifestPath), 'missing-exif-albums.md')`. Read and render the manifest, create the output directory, write UTF-8 Markdown, and print:

```json
{
    "albums": 25,
    "images": 166,
    "outputPath": "E:\\Project\\NguyenDinhThinhStudio\\nguyendinhthinhstudio\\.artifacts\\album-import\\missing-exif-albums.md"
}
```

Do not call `fetch`, load AI credentials, modify approval, or write the manifest/checkpoint.

- [ ] **Step 7: Run report and CLI tests and verify GREEN**

Run both Task 3 test commands. Expected: all PASS.

### Task 4: Runbook, current report, and integrated verification

**Files:**

- Modify: `docs/runbooks/production-album-import.md`
- Generate: `.artifacts/album-import/missing-exif-albums.md`

- [ ] **Step 1: Update the runbook**

Document:

- `artistic-collection-v2` causes one album-metadata refresh while preserving grouping checkpoints;
- Beauty/Fashion English and Vietnamese/Hán–Việt traditional naming behavior;
- automatic production/import collision retry and hard failure after three conflicts;
- exact `report-missing-exif` command and report fields;
- operator must provide dates or remove those albums before approval;
- rerunning the same `enrich` command resumes current-version results;
- no production execution occurs during report or enrichment.

- [ ] **Step 2: Format changed source and documentation**

Run:

```powershell
npx -p node@24 node node_modules/prettier/bin/prettier.cjs --write `
  scripts/import-ndt-albums.mjs `
  scripts/album-import/ai.mjs `
  scripts/album-import/ai.test.mjs `
  scripts/album-import/naming.mjs `
  scripts/album-import/naming.test.mjs `
  scripts/album-import/enrichment.test.mjs `
  scripts/album-import/review-report.mjs `
  scripts/album-import/review-report.test.mjs `
  scripts/album-import/cli.test.mjs `
  docs/runbooks/production-album-import.md `
  docs/superpowers/specs/2026-08-01-artistic-album-naming-design.md `
  docs/superpowers/plans/2026-08-01-artistic-album-naming.md
```

- [ ] **Step 3: Run all importer tests**

Run:

```powershell
npx -p node@24 node --test scripts/album-import/*.test.mjs
```

Expected: every importer test PASS with no real network, AI, or production call.

- [ ] **Step 4: Run repository checks**

Run:

```powershell
npx -p node@24 npm run check-types
git diff --check
```

Expected: exit code `0` for both. Inspect `git status --short`; only scoped importer/spec/plan/runbook files, prior `.gitignore`/`package.json` work, and the user's untouched `note.md` may appear.

- [ ] **Step 5: Generate and inspect the current missing-EXIF report**

Run:

```powershell
npx -p node@24 node scripts/import-ndt-albums.mjs report-missing-exif `
  --manifest ".artifacts\album-import\manifest.json" `
  --output ".artifacts\album-import\missing-exif-albums.md"
```

Expected JSON summary: `albums: 25`, `images: 166`. Read the report and verify it contains all 25 current titles, cover paths, image paths, and empty chosen-date fields. This generated `.artifacts` file remains ignored.

- [ ] **Step 6: Perform safety self-review**

Confirm from source and tests:

- grouping checkpoint entries do not carry or compare the album naming prompt version;
- v1 album analyses refresh once and v2 analyses resume;
- collision checks include final `#1`/`#2` titles and production slugs;
- no arbitrary numeric collision suffix is generated;
- report generation cannot mutate manifest/approval or call network;
- `execute` still requires a valid approval digest, an admin token, and `--execute-production`;
- no real AI/production call, branch, commit, push, or deployment occurred.
