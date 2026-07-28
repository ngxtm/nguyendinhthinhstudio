# Search Indexing Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every website-generated public URL resolve to an intentional canonical page, redirect, noindex response, or genuine 404 while adding database-owned gallery category landing pages.

**Architecture:** The backend exposes published-category navigation and category facts from the existing inherited `AlbumCategory` model. Next.js server components render initial gallery content and metadata, while a pure redirect manifest controls legacy/canonical URL normalization. Cloudflare remains the production authority for HTTP/host and email-obfuscation settings.

**Tech Stack:** Next.js 16 App Router, React 19, NestJS 11, Prisma/PostgreSQL, Node test runner, Jest, Cloudflare.

---

### Task 1: Lock domain and architecture documents

**Files:**

- Create: `CONTEXT-MAP.md`
- Create: `apps/frontend/CONTEXT.md`
- Create: `docs/adr/0003-database-owned-public-gallery-navigation.md`
- Create: `docs/superpowers/specs/2026-07-28-search-indexing-remediation-design.md`

- [x] Read each document back and confirm the glossary contains no implementation detail.
- [x] Confirm the ADR records the database-vs-hard-code trade-off and the separate album/category URL spaces.

### Task 2: Add RED backend indexing tests

**Files:**

- Create: `apps/backend/src/categories/categories.service.spec.ts`
- Create: `apps/backend/src/seo/api-indexing.middleware.spec.ts`
- Modify: `apps/backend/src/app.controller.spec.ts`
- Create: `apps/backend/src/categories/category-navigation-schema.contract.spec.ts`

- [ ] Test that public navigation contains only navigation-enabled categories with published active album assignments and preserves parent/child order.
- [ ] Test that public category facts return published count and a missing slug throws `NotFoundException`.
- [ ] Test that the API indexing middleware sets `X-Robots-Tag: noindex, nofollow`.
- [ ] Replace the “Hello World” assertion with health and API robots assertions.
- [ ] Assert the Prisma schema and migration define navigation visibility/order and the imported legacy taxonomy.
- [ ] Run `npm test --workspace=backend -- --runInBand --runTestsByPath src/categories/categories.service.spec.ts src/categories/category-navigation-schema.contract.spec.ts src/seo/api-indexing.middleware.spec.ts src/app.controller.spec.ts` and observe failures caused by missing behavior.

### Task 3: Implement backend category navigation and API noindex

**Files:**

- Modify: `apps/backend/prisma/schema.prisma`
- Create: `apps/backend/prisma/migrations/20260728000100_add_gallery_category_navigation/migration.sql`
- Modify: `apps/backend/src/categories/dto/create-category.dto.ts`
- Modify: `apps/backend/src/categories/categories.controller.ts`
- Modify: `apps/backend/src/categories/categories.service.ts`
- Modify: `apps/backend/src/categories/categories.module.ts`
- Modify: `apps/backend/src/app.controller.ts`
- Create: `apps/backend/src/seo/api-indexing.middleware.ts`
- Modify: `apps/backend/src/main.ts`

- [ ] Add `showInNavigation Boolean @default(false)` and `navigationOrder Int @default(0)`.
- [ ] Import the former hard-coded taxonomy idempotently and preserve the `Nữ` child hierarchy.
- [ ] Add Admin DTO validation for the two navigation fields.
- [ ] Add public `GET /categories/navigation`, `GET /categories/indexable`, and `GET /categories/slug/:slug` routes before `GET /categories/:id`.
- [ ] Count only `published` and `active` albums; build ordered navigation trees without N+1 queries.
- [ ] Remove the API root handler, add text `/robots.txt`, retain `/health`, and install the global indexing header middleware.
- [ ] Re-run Task 2 tests and the full backend suite.

### Task 4: Add RED frontend SEO contracts

**Files:**

- Create: `apps/frontend/test/seo-indexing.contract.test.ts`
- Create: `apps/frontend/test/gallery-navigation.test.ts`

- [ ] Test the redirect manifest for apex/www one-hop mappings and every known legacy category URL.
- [ ] Test the navigation builder emits `/thu-vien/danh-muc/{slug}` and preserves hierarchy.
- [ ] Assert public source files no longer emit the verified missing routes or old category links.
- [ ] Assert `/thu-vien` is a server page with initial album props and the category route has canonical/noindex behavior.
- [ ] Assert sitemap code has no per-request `new Date()` timestamps and consumes indexable categories.
- [ ] Run `npm run test:focused --workspace=frontend -- test/seo-indexing.contract.test.ts test/gallery-navigation.test.ts` and observe failures caused by missing behavior.

### Task 5: Implement canonical redirects and metadata foundation

**Files:**

- Create: `apps/frontend/seo-routes.mjs`
- Modify: `apps/frontend/next.config.mjs`
- Create: `apps/frontend/src/lib/seo.ts`
- Modify: `apps/frontend/src/app/layout.tsx`
- Modify: `apps/frontend/src/app/robots.ts`

- [ ] Define the canonical origin once as `https://ndtstudio.site`.
- [ ] Generate explicit 301 redirects for legacy category paths and equivalent missing pages.
- [ ] Add combined `www`+legacy rules before the generic HTTPS `www` fallback so those requests do not chain inside Next.js.
- [ ] Remove the placeholder Google verification token.
- [ ] Keep Next build assets crawlable and disallow Admin paths.

### Task 6: Implement database-owned public navigation

**Files:**

- Modify: `apps/frontend/src/lib/api/categories.ts`
- Create: `apps/frontend/src/lib/public-navigation.ts`
- Create: `apps/frontend/src/lib/server/public-categories.ts`
- Modify: `apps/frontend/src/app/(public)/layout.tsx`
- Modify: `apps/frontend/src/app/components/layout/Header.tsx`
- Modify: `apps/frontend/src/app/admin/categories/page.tsx`

- [ ] Add typed clients for navigation, indexable categories, and category-by-slug facts.
- [ ] Build Header navigation from the ordered database tree and use a gallery-only fallback when the API is unavailable.
- [ ] Cache the navigation read per server render so layout and page callers deduplicate it.
- [ ] Add Admin controls for menu visibility/order and show the values in the table.

### Task 7: Server-render gallery and category landing pages

**Files:**

- Create: `apps/frontend/src/app/(public)/thu-vien/GalleryClient.tsx`
- Modify: `apps/frontend/src/app/(public)/thu-vien/page.tsx`
- Create: `apps/frontend/src/app/(public)/thu-vien/danh-muc/[slug]/page.tsx`
- Create: `apps/frontend/src/app/(public)/thu-vien/danh-muc/[slug]/category-data.ts`

- [ ] Move infinite-scroll state into `GalleryClient` with initial albums/pagination props.
- [ ] Fetch the first gallery page on the server and render album links in initial HTML.
- [ ] Fetch category facts and initial albums in parallel, deduplicating metadata/page reads with React cache.
- [ ] Return 404 for unknown categories and `noindex, follow` for existing empty categories.
- [ ] Emit self-canonical metadata and breadcrumb/ImageGallery structured data for public categories.

### Task 8: Complete public metadata, sitemap, and link cleanup

**Files:**

- Modify: `apps/frontend/src/app/(public)/page.tsx`
- Modify: `apps/frontend/src/app/(public)/gioi-thieu/page.tsx`
- Modify: `apps/frontend/src/app/(public)/lien-he/page.tsx`
- Modify: `apps/frontend/src/app/(public)/thu-vien/tag/[slug]/page.tsx`
- Create/modify: route `layout.tsx` metadata files under `bang-gia`, `gioi-thieu/chinh-sach`, and `video`
- Modify: `apps/frontend/src/app/sitemap.ts`
- Modify: `apps/frontend/src/app/components/common/Footer.tsx`
- Modify: `apps/frontend/src/app/(public)/bang-gia/data/bang-gia.ts`
- Modify: `apps/frontend/src/app/components/layout/Header.tsx`
- Modify: `apps/frontend/src/app/(public)/gioi-thieu/page.tsx`

- [ ] Give each indexable landing page unique metadata and a self-canonical URL.
- [ ] Use available category slugs for category CTAs, otherwise link to `/thu-vien`.
- [ ] Replace the verified missing links and remove “Dịch vụ khác”.
- [ ] Add indexable categories and all existing pricing pages to the sitemap; omit false static modification timestamps.
- [ ] Re-run focused frontend tests, full frontend tests, and type/build checks.

### Task 9: Add deployment runbook and verify

**Files:**

- Create: `docs/runbooks/search-indexing-remediation.md`

- [ ] Record Cloudflare Email Address Obfuscation disablement and one-hop canonical redirect configuration.
- [ ] Record migration, Admin category assignment, smoke curl, sitemap audit, and Search Console validation steps without credentials.
- [ ] Run Prettier on changed files, backend/frontend full tests, repository type checks, and production builds with the required environment loaded without logging secrets.
- [ ] Read `git diff --check`, `git status --short`, and the complete diff; reconcile every acceptance criterion against evidence.
- [ ] Do not create commits, push, deploy, change Cloudflare, migrate production, or start Search Console validation without a separate operator action.

## Self-review

- Spec coverage: Tasks 2–8 cover canonical host, redirects, category semantics, SSR, metadata, sitemap, API noindex, and broken-link cleanup; Task 9 covers external operations.
- Placeholder scan: the plan contains no TBD implementation steps; production data assignment is explicitly an operator deployment action.
- Type consistency: backend uses `showInNavigation`, `navigationOrder`, and published `albumCount`; frontend API and Admin use the same names.
