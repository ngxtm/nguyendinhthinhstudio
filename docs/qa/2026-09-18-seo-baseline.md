# SEO baseline — 2026-09-18

Source base: `f927643723356a610320b17c70f067c5f6a8ea80`. No implementation was present at baseline. Work approved on main, uncommitted.

## Automated local baseline

`node --import tsx --test test/seo-indexing.contract.test.ts test/seo-domain-migration.test.ts` from `apps/frontend`: 18 tests passed, 0 failed, exit 0. This does not establish browser or production correctness.

## Read-only live HTTP baseline

Observed by Luna baseline worker: 2026-09-17 16:21:44Z–16:23:14Z (2026-09-18 local UTC+8). No external configuration was changed.

| URL | Evidence |
| --- | --- |
| `/` | 200 HTML, index/follow, canonical and OG URL use `https://ndtstudio.com.vn` |
| `/thu-vien` | 200, index/follow, self-canonical |
| `/lien-he` | 200, index/follow, self-canonical |
| `/bang-gia` | 200, index/follow, self-canonical |
| `/thu-vien/danh-muc/beauty` | 200, self-canonical, title `Beauty \| Thư viện ảnh NDT Studio` |
| `/thu-vien/chrome-butterfly` | 200, self-canonical, cover OG image on `img.ndtstudio.com.vn` |
| `/robots.txt` | 200 text/plain, advertises new-domain sitemap; Cloudflare managed section present |
| `/sitemap.xml` | 200 XML; website URLs only use `.com.vn`; includes sampled category/album |
| Nonexistent route | 404 with noindex; inherited homepage canonical observed |
| `/og-image.jpg` | 404 text/html, missing default preview asset |

Sample redirect path: `/thu-vien/chrome-butterfly?from=seo-baseline2&x=2`.

- New apex HTTPS: 200 directly.
- New apex HTTP and new www HTTPS: one 301, path/query preserved, final 200.
- New www HTTP: two 301 hops, path/query preserved, final 200.
- Old apex/www, HTTP/HTTPS: 301 to matching new website URL, path/query preserved, final 200.

No browser QA, Search Console access, or Cloudflare configuration inspection was performed. Old notes about undeployed domain changes must not be treated as current: sampled live canonical/redirect checks now pass. One-hop new-www HTTP normalization can be an operator improvement, not an authorized configuration write here. A 404/noindex response is excluded intentionally even if inherited canonical cleanup is desirable.

No rank, index coverage, conversion, or Core Web Vitals conclusions are supported by this baseline.
