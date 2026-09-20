# SEO verification and release runbook

This runbook is not deployment authorization. Work is uncommitted on main by explicit user request. Do not push, deploy, edit Cloudflare/DNS, submit Search Console changes, install analytics, or write production data without approval.

## Local gates

From `apps/frontend`:

```powershell
npm test
npx tsc --noEmit --incremental false
npm run build
```

From `apps/backend`, after public pagination changes:

```powershell
npm test -- --runInBand
npm run build
```

From repository root: `git diff --check`. Include untracked implementation files when reviewing; no commit is assumed.

Record exit codes, counts, revision and environment. The current local environment loads a loopback HTTP public API; production validation requires HTTPS. Use an approved HTTPS staging API or a secure local HTTPS fixture for production-mode tests. Never disable the HTTPS guard or silently edit `.env` to force a passing build. Build-time fonts/API failures are distinct from feature failures.

## HTTP and browser acceptance matrix

| Case | Required observation |
| --- | --- |
| Published album | 200, expected content, self-canonical, indexable metadata |
| Missing primary album | Actual not-found behavior and noindex; inspect HTTP status before streaming |
| Primary album upstream 500/429/network error | Not misreported as album missing |
| Related albums API failure | Main album and first image batch remain usable |
| Image batch failure, including 404 | Not swallowed or mapped to missing primary album |
| Gallery/category page 2 | Distinct batch, self-canonical page 2, real next/previous anchors |
| Gallery JS disabled | Current batch and navigation links are visible and operable |
| Infinite scroll and back/refresh | No mixed category/page cache, no duplicates in a stable fixture |
| Empty existing category | Existing intentional noindex preserved |
| Social image | Correct image MIME, dimensions and visible typography; not HTML 404 |
| Mobile/desktop | No clipping/layout regression; lightbox and image loading remain usable |

Use deterministic local fixtures for failures, not deliberate production outages. Browser results must name tested URLs, viewport and JS mode. Static regex tests do not prove runtime HTTP behavior.

## Sitemap failure and recovery

1. Fetch a successful page sitemap and record URL count, canonical host, sample published album/category and content timestamps.
2. Fail album page 2 or category response in a local fixture. A fresh sitemap must not return a partial list with HTTP 200.
3. Check missing nextCursor and repeated cursor reject rather than truncate or loop.
4. Warm ISR cache, expire its revalidation interval, introduce upstream failure, and fetch again. Record whether the last complete result survives; do not infer this from `revalidate = 60` alone.
5. Repeat with cold cache and build-time API failure. Report separately whether the route or whole build fails. A failed build is not a successful stale-cache test.
6. Restore upstream, revalidate successfully, and confirm new content appears and unpublished content disappears. Cache persistence through restart/redeploy is a separate test, not a promise.
7. For image sitemap, parse XML, check child entries and a public image outside the initial UI batch. Validate limits and fail-closed behavior; never silently omit overflow. Inspect only public image URLs, never log internal object fields or credentials.

The [Sitemaps protocol](https://www.sitemaps.org/protocol.html) defines its 50 MB limit as **52,428,800 bytes** (50 × 1024 × 1024). Child sitemap URLs should be served at website root so their scope includes `/thu-vien/...`, without relying on a future Search Console submission to expand scope.

Operational observation: capture sitemap URL count and sanitized generation errors after each release. A sharp unexplained count drop needs investigation, but intentional unpublishing can legitimately reduce count. Compare against published catalog data before declaring failure. No periodic monitor is created by this document.

## Production gate after an authorized release

Follow `domain-migration-com-vn.md`. Verify representative new-domain pages, sitemap/robots, old/new apex/www HTTP/HTTPS redirects, nested path and query preservation. Website canonical origin is `https://ndtstudio.com.vn`; do not redirect API/image hosts.

Check actual rendered metadata and image response on production; local tests do not prove a deployed revision. Only after these checks, inspect existing Search Console state, then submit sitemap or Change of Address if still needed and authorized. Do not repeat a migration action merely because it appears in an old checklist.

## Rollout / rollback

- Deploy public pagination backend before frontend consumers, preserving the old cursor contract.
- Metadata/review-copy changes can release independently; social identities and local service copy require confirmation.
- Roll back using the previously recorded artifact through the approved deployment workflow, never `git reset --hard` on this workspace.
- If image sitemap routes roll back, remove their advertisement from robots in the same release.
- No database restore should be needed: this SEO plan does not alter production records.

## Measurement

Save Search Console baseline by service/category/album and Image search: clicks, impressions, CTR, queries, indexing status and Google-selected canonical. Keep intentional redirect/noindex/404 exclusions distinct from errors. Review at 14 and 28 days after release with equal-length comparison windows; note domain migration and seasonality.

Field Core Web Vitals target p75: LCP <=2.5s, INP <200ms, CLS <0.1. Lab traces are not field evidence. Use the same fixture, viewport, cache/network settings and three samples for before/after lab comparison.

Inventory existing analytics before installing anything. If approved, `contact_click` may record `channel: phone | zalo | booking` and `page_path`, without form values or personal data. A click is not a completed booking. No automation, analytics property, or external configuration is created here.
