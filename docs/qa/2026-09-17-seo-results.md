# SEO implementation results — 2026-09-20

Scope: implementation on `main`, uncommitted, with no commit, push, deploy, DNS/Cloudflare, Search Console, analytics, or production-data changes.

## Implemented in source

- Album-page error classification: only primary-album 404 maps to `notFound`; related-album failures fall back safely and image-batch errors remain observable.
- Fail-closed public sitemap loading with cursor-loop/incomplete-page checks, deduplication, and content timestamps.
- Shared business identity and review invitation without rating or incentive claims. Social links remain page-owned pending account confirmation.
- `/og` branded 1200×630 PNG fallback, plus explicit OG/Twitter metadata for public, category, and album pages. Album cover metadata no longer invents dimensions.
- Crawlable public gallery/category pagination while preserving cursor-based infinite scroll and existing batch sizes.
- Image sitemap index and per-album XML routes with public-state filtering, XML escaping, duplicate removal, and explicit protocol limits.
- Responsive image `srcSet` descriptors derived from known source dimensions; existing progressive loading, lightbox, mobile layout, and SSR image batches are preserved.
- Task 7 local SEO copy: source-backed homepage/service/pricing titles, descriptions, H1s, crawlable booking/portfolio links, and observed studio-image alt text. No database taxonomy or unsupported performance/review claims were added.

## Focused verification

- Frontend SEO/regression set: **72/72 passed**.
- Frontend metadata/responsive patch set: **7/7 passed**.
- Frontend TypeScript no-emit: **passed** with `npx tsc --noEmit --incremental false`.
- Backend album/DTO pagination set: **28/28 passed**.
- Task 7 local-content contract plus SEO indexing regression subset: **21/21 passed**.
- `git diff --check`: passed; Git emitted only LF/CRLF normalization warnings.

The focused frontend command was run from `apps/frontend`:

```powershell
node --import tsx --test test/seo-indexing.contract.test.ts test/seo-domain-migration.test.ts test/public-album-page-errors.test.ts test/public-sitemap.test.ts test/image-sitemap.test.ts test/business-seo.test.ts test/social-metadata.test.ts test/gallery-pagination.test.ts test/responsive-image.test.ts test/public-gallery-swr.test.ts test/public-album-detail-batching.contract.test.ts
```

Task 7 follow-up from `apps/frontend`:

```powershell
node --import tsx --test test/local-seo-content.test.ts test/seo-indexing.contract.test.ts
```

## Chưa nghiệm thu trong lượt này

- Full frontend/backend test suites, production build, browser QA, production HTTP, warm/cold ISR recovery, and field Core Web Vitals were skipped to reduce redundant work per user direction.
- Task 7 source changes are applied locally and recorded in `docs/seo/local-content-matrix.md`; database taxonomy was not changed. Production still requires a frontend redeploy before the new metadata and visible copy can be verified live.
- Official social-account confirmation is still required before consolidating `sameAs` identities.
- Deployment and Search Console gates remain separate; local tests do not prove live canonical, redirect, sitemap, image-CDN, or indexing behavior.
