# Search indexing remediation design

## Goal

Remove website-generated indexing failures while preserving correct exclusions such as permanent redirects, retired build assets, intentional `noindex`, and genuine 404 responses.

## Canonical origin

`https://ndtstudio.site` is the only canonical public origin. HTTPS `www` requests permanently redirect to the equivalent non-`www` URL while preserving path and query. Cloudflare performs the authoritative HTTP/host normalization in one hop; Next.js retains an HTTPS `www` fallback. Every indexable page declares a self-referencing canonical on the non-`www` origin.

## Public gallery model

- `/thu-vien/{albumSlug}` identifies one published album.
- `/thu-vien/danh-muc/{categorySlug}` identifies a gallery category.
- Admin/database is the source of truth for category hierarchy, navigation visibility, and order.
- Direct child assignments continue to materialize parent category assignments.
- A missing category returns a real 404.
- An existing category with zero published albums returns 200 with `noindex, follow`, but is absent from navigation and sitemap.
- A category with at least one published active album is indexable and may appear in navigation according to its Admin flag.

The schema migration imports the former hard-coded taxonomy as initially navigation-enabled database rows. It does not guess album assignments; Admin assigns published albums to the most specific categories after deployment.

## Legacy routes and broken links

Known category-shaped routes are explicit permanent redirects to `/thu-vien/danh-muc/{slug}`. The application never redirects arbitrary `/thu-vien/{slug}` values because that namespace belongs to albums and a missing album must remain a 404. Current source links are changed to canonical category URLs or to `/thu-vien` while a category is not public.

Other verified mappings are:

- `/showroom` → `/lien-he`
- `/dieu-khoan-dich-vu` → `/gioi-thieu/chinh-sach`
- `/chinh-sach-bao-hanh` → `/gioi-thieu/chinh-sach`
- `/gioi-thieu/thu-vien` → `/thu-vien`
- `/bang-gia/dich-vu-khac` remains 404 and is removed from navigation until real content exists.

Retired `/_next/static/media/*` hashes remain 404. Current build assets remain crawlable so Google can render pages.

## Server-rendered landing pages

`/thu-vien` and category pages fetch their first album page on the server and pass it to a client gallery that only handles subsequent infinite-scroll requests. Independent server requests start together. Important public routes, including every existing pricing route, publish unique title, description, canonical, and Open Graph data.

## Sitemap

The sitemap contains only canonical non-`www` URLs that are intended to be indexed: existing static landing pages, published active albums, and categories with at least one published active album. Redirects, Admin, API, empty categories, missing routes, and build assets are excluded. `lastModified` is emitted only when backed by content timestamps; static pages do not claim a new modification time on every sitemap request.

## API indexing policy

`api.ndtstudio.site` is not search content. Every API response includes `X-Robots-Tag: noindex, nofollow`; `/robots.txt` returns `Disallow: /`; `/` has no handler and therefore returns JSON 404; `/health` remains an unthrottled 200 health endpoint.

## Cloudflare operations

Email Address Obfuscation is disabled for the public zone so Cloudflare stops rewriting `mailto:` anchors to crawlable `/cdn-cgi/l/email-protection` URLs. A redirect rule normalizes HTTP and `www` requests directly to the canonical HTTPS apex origin. These are deployment actions, not repository code, and are recorded in the runbook with post-change curl checks.

## Acceptance criteria

- Canonical public URLs return 200 with self-canonical metadata and meaningful server HTML.
- HTTPS `www`, HTTP, and known legacy URLs redirect permanently without loops; Cloudflare production normalization is one hop.
- Rendered public HTML contains no internal links to known redirects or 404 routes.
- Missing albums/categories return 404; empty existing categories return 200 with `noindex, follow`.
- API root returns 404 while health stays 200, and API responses carry `X-Robots-Tag`.
- Sitemap entries are canonical and indexable.
- Search Console validation is requested after deployment, without treating correct redirect/404/noindex exclusions as failures.

## Out of scope

- Creating placeholder content for “Dịch vụ khác”.
- Restoring retired Next.js asset hashes.
- Guaranteeing that Google chooses to index a technically eligible page.
- Applying production database migrations or Cloudflare changes without operator deployment authorization.
