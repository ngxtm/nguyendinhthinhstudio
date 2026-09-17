# Public domain migration to ndtstudio.com.vn

Canonical origin: `https://ndtstudio.com.vn`.
This checklist does not authorize deployment or external configuration writes.

## Code scope

- Public metadata, sitemap and robots use `src/lib/seo.ts`.
- Album, contact and pricing structured data use the same URL helper.
- `seo-routes.mjs` normalizes both www hosts to the new origin, retaining
  direct legacy-path redirects before the hostname catch-all.
- The old apex `ndtstudio.site` is NOT redirected by this patch. Activate that
  migration at Cloudflare after validating the new deployment.
- Do not remove API/image hosts, rewrite database content, or alter auth settings
  as part of this SEO patch.

## Deployment and verification

1. Build/deploy the reviewed frontend revision through the normal release flow.
2. Fetch the homepage, `/thu-vien/danh-muc/beauty`, `/thu-vien/chrome-butterfly`,
   `/lien-he`, and `/bang-gia`. Require 200, self-canonical `.com.vn` URLs and
   consistent Open Graph / JSON-LD website URLs. Check robots headers and metadata.
3. Check `/robots.txt` advertises the new sitemap; `/sitemap.xml` contains only
   new-domain public page URLs. Inspect Cloudflare's appended bot policy too.
4. Reconcile existing Cloudflare rules on BOTH zones so none sends the new host
   back to `.site`. Normalize new www to new apex. Redirect old apex and old www
   permanently to the corresponding new website URL, preserving path and query.
   Apply only to website hosts, never API/image hosts. Where practical map known
   legacy paths directly to final new paths to avoid redirect chains.
5. Test old/new, HTTP/HTTPS and www/apex variants, including a nested album URL
   with query parameters. Require a final 200 without loops; new apex must not
   redirect to itself. Keep old-domain DNS, HTTPS and renewal active.
6. Verify both properties in Search Console, inspect the Beauty category and
   Chrome Butterfly album URLs, submit the new sitemap and complete Change of
   Address after redirects are live. Keep redirects at least one year.

## Search diagnosis (pre-deployment observation)

Local verification for this patch: 103 frontend tests passed (including 18 focused
SEO tests), TypeScript `--noEmit --incremental false` passed, and `git diff --check`
passed. Local production build was blocked by Google Fonts fetch / Turbopack font
resolution errors. Scoped ESLint was blocked by circular config serialization.
No production deployment or browser QA of the modified code was performed.

The supplied Google screenshot for `Bộ Ảnh Beauty NDTStudio` shows Google serving
the corrected query `Bộ Ảnh Beauty Studio`, not the originally typed query.
An exact album-name query returning an album does not establish category ranking.

Live HTTP inspection before this patch was deployed found:

- Both old/new Beauty category pages returned 200 with `index, follow`.
- Beauty title: `Beauty | Thư viện ảnh NDT Studio`.
- Beauty description: `Các album beauty.`; gallery heading: `Beauty`.
- New-domain canonical, Open Graph URL, sitemap and robots still named `.site`.
- Chrome Butterfly returned 200 with its specific album SEO title.

These establish crawl eligibility and a domain migration inconsistency, not
Google's actual index state or ranking cause. Use Search Console URL Inspection
for Google-selected canonical / indexing status and Performance for the exact
queries, pages, impressions and positions. Improving category copy is a separate
content decision; no promise of ranking gains is made by this migration.

References:
- https://developers.google.com/search/docs/fundamentals/how-search-works
- https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes
