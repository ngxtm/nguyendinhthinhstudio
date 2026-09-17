import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

function readSource(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

test('redirect manifest normalizes www and every known legacy gallery route', async () => {
  const routeModule = new URL('../seo-routes.mjs', import.meta.url)
  assert.equal(existsSync(routeModule), true, 'seo-routes.mjs must exist')
  if (!existsSync(routeModule)) return

  const routes = await import(routeModule.href)
  const redirects = routes.createSeoRedirects()
  const expectedLegacy = new Map([
    ['/thu-vien/collection', '/thu-vien/danh-muc/collection'],
    ['/thu-vien/nu', '/thu-vien/danh-muc/nu'],
    ['/thu-vien/nu/beauty', '/thu-vien/danh-muc/beauty'],
    ['/thu-vien/wedding', '/thu-vien/danh-muc/wedding'],
    ['/thu-vien/me-bau', '/thu-vien/danh-muc/me-bau'],
    ['/showroom', '/lien-he'],
    ['/dieu-khoan-dich-vu', '/gioi-thieu/chinh-sach'],
    ['/chinh-sach-bao-hanh', '/gioi-thieu/chinh-sach'],
    ['/gioi-thieu/thu-vien', '/thu-vien']
  ])

  for (const [source, destination] of expectedLegacy) {
    assert.ok(
      redirects.some(
        (rule: any) =>
          rule.source === source && rule.destination === destination && rule.statusCode === 301 && !rule.has
      ),
      `${source} must redirect directly to ${destination}`
    )
    assert.ok(
      redirects.some(
        (rule: any) =>
          rule.source === source &&
          rule.destination === `https://ndtstudio.com.vn${destination}` &&
          rule.statusCode === 301 &&
          rule.has?.some((condition: any) => condition.type === 'host')
      ),
      `www ${source} must avoid an application redirect chain`
    )
  }

  assert.ok(
    redirects.some(
      (rule: any) =>
        rule.source === '/:path*' &&
        rule.destination === 'https://ndtstudio.com.vn/:path*' &&
        rule.has?.some((condition: any) => condition.type === 'host' && condition.value === 'www.ndtstudio.com.vn')
    )
  )
})

test('frontend runtime image packages the SEO redirect module required by Next config', () => {
  const nextConfig = readSource('../next.config.mjs')
  const dockerfile = readSource('../Dockerfile')

  assert.match(nextConfig, /from ['"]\.\/seo-routes\.mjs['"]/)
  assert.match(
    dockerfile,
    /COPY --from=builder --chown=nextjs:nodejs \/app\/apps\/frontend\/seo-routes\.mjs \.\/apps\/frontend\/seo-routes\.mjs/,
    'the runtime image must include seo-routes.mjs next to next.config.mjs'
  )
})

test('public source stops emitting verified legacy and missing internal links', () => {
  const sources = [
    '../src/app/components/layout/Header.tsx',
    '../src/app/components/common/Footer.tsx',
    '../src/app/(public)/page.tsx',
    '../src/app/(public)/gioi-thieu/page.tsx',
    '../src/app/(public)/bang-gia/data/bang-gia.ts'
  ]
    .map(readSource)
    .join('\n')

  for (const href of [
    '/thu-vien/collection',
    '/thu-vien/nu/beauty',
    '/thu-vien/me-bau',
    '/thu-vien/wedding',
    '/showroom',
    '/dieu-khoan-dich-vu',
    '/chinh-sach-bao-hanh',
    '/gioi-thieu/thu-vien',
    '/bang-gia/dich-vu-khac'
  ]) {
    assert.doesNotMatch(sources, new RegExp(`['"]${href.replaceAll('/', '\\/')}['"]`), href)
  }
})

test('main gallery is server rendered with initial album data', () => {
  const page = readSource('../src/app/(public)/thu-vien/page.tsx')

  assert.doesNotMatch(page, /['"]use client['"]/, 'gallery page must remain a server component')
  assert.match(page, /await\s+(?:listAlbums|getAlbums)\s*\(/)
  assert.match(page, /<GalleryClient\b[\s\S]*?initialAlbums=/)
  assert.doesNotMatch(page, /Đang tải\.\.\./)
})

test('main gallery starts with eight albums and uses the curated gallery sort', () => {
  const page = readSource('../src/app/(public)/thu-vien/page.tsx')

  assert.match(page, /limit:\s*8/)
  assert.match(page, /sortBy:\s*['"]gallery['"]/)
})

test('gallery client preloads eight albums and animates appended cards before the sentinel', () => {
  const gallery = readSource('../src/app/(public)/thu-vien/GalleryClient.tsx')
  const gallerySWR = readSource('../src/lib/public-gallery-swr.ts')

  assert.match(gallerySWR, /limit:\s*8/)
  assert.match(gallery, /rootMargin:\s*['"]0px 0px 800px 0px['"]/)
  assert.match(gallery, /fadeInUp/i)
  assert.match(gallery, /prefers-reduced-motion/)
})

test('category landing route defines canonical and empty-category noindex behavior', () => {
  const pagePath = new URL('../src/app/(public)/thu-vien/danh-muc/[slug]/page.tsx', import.meta.url)
  assert.equal(existsSync(pagePath), true, 'category landing page must exist')
  if (!existsSync(pagePath)) return

  const page = readFileSync(pagePath, 'utf8')
  assert.match(page, /alternates:\s*{\s*canonical(?:\s*:|\s*})/)
  assert.match(page, /albumCount\s*>\s*0/)
  assert.match(page, /index:\s*isIndexable/)
  assert.match(page, /notFound\(\)/)
  assert.match(page, /['"]@type['"]:\s*['"]ImageGallery['"]/)
  assert.match(page, /associatedMedia/)
})

test('sitemap uses indexable categories and real content timestamps only', () => {
  const sitemap = readSource('../src/app/sitemap.ts')

  assert.match(sitemap, /getIndexableCategories/)
  assert.doesNotMatch(sitemap, /lastModified:\s*new Date\(\)/)
  assert.match(sitemap, /\/thu-vien\/danh-muc\//)
  assert.match(sitemap, /export const revalidate\s*=\s*60/)
})

test('crawl controls keep render assets available and noindex infrastructure health', () => {
  const robots = readSource('../src/app/robots.ts')
  const health = readSource('../src/app/health/route.ts')

  assert.doesNotMatch(robots, /['"]\/_next\/['"]/)
  assert.match(health, /X-Robots-Tag/)
  assert.match(health, /noindex, nofollow/)
})

test('admin and category management expose intentional indexing controls', () => {
  const adminLayout = readSource('../src/app/admin/layout.tsx')
  const categoryAdmin = readSource('../src/app/admin/categories/page.tsx')

  assert.doesNotMatch(adminLayout, /['"]use client['"]/, 'server layout must own Admin metadata')
  assert.match(adminLayout, /robots:\s*{[\s\S]*?index:\s*false/)
  assert.equal(
    existsSync(new URL('../src/app/admin/AdminShell.tsx', import.meta.url)),
    true,
    'the interactive Admin shell must remain a client component'
  )
  assert.match(categoryAdmin, /showInNavigation/)
  assert.match(categoryAdmin, /navigationOrder/)
})

test('every pricing route and client-only public landing has self-canonical metadata', () => {
  const metadataLayouts = new Map([
    ['../src/app/(public)/bang-gia/layout.tsx', '/bang-gia'],
    ['../src/app/(public)/bang-gia/ca-nhan/layout.tsx', '/bang-gia/ca-nhan'],
    ['../src/app/(public)/bang-gia/couple/layout.tsx', '/bang-gia/couple'],
    ['../src/app/(public)/bang-gia/gia-dinh/layout.tsx', '/bang-gia/gia-dinh'],
    ['../src/app/(public)/bang-gia/team/layout.tsx', '/bang-gia/team'],
    ['../src/app/(public)/bang-gia/video/layout.tsx', '/bang-gia/video'],
    ['../src/app/(public)/bang-gia/wedding/layout.tsx', '/bang-gia/wedding'],
    ['../src/app/(public)/gioi-thieu/chinh-sach/layout.tsx', '/gioi-thieu/chinh-sach'],
    ['../src/app/(public)/video/layout.tsx', '/video']
  ])

  for (const [relativePath, canonicalPath] of metadataLayouts) {
    const url = new URL(relativePath, import.meta.url)
    assert.equal(existsSync(url), true, `${relativePath} must exist`)
    if (!existsSync(url)) continue
    const source = readFileSync(url, 'utf8')
    assert.match(source, /createPublicMetadata/)
    assert.match(source, new RegExp(`path:\\s*['"]${canonicalPath.replaceAll('/', '\\/')}['"]`))
  }
})

test('complete SEO titles bypass the root title template without duplicating the brand', () => {
  const seoHelper = readSource('../src/lib/seo.ts')
  const categoryPage = readSource('../src/app/(public)/thu-vien/danh-muc/[slug]/page.tsx')
  const tagPage = readSource('../src/app/(public)/thu-vien/tag/[slug]/page.tsx')
  const albumPage = readSource('../src/app/(public)/thu-vien/[slug]/page.tsx')

  assert.match(seoHelper, /title:\s*{\s*absolute:\s*title\s*}/)
  assert.match(categoryPage, /title:\s*{\s*absolute:\s*title\s*}/)
  assert.match(tagPage, /title:\s*{\s*absolute:\s*pageTitle\s*}/)
  assert.match(albumPage, /title:\s*{\s*absolute:\s*title\s*}/)
})

test('database-owned navigation and public gallery data revalidate every 60 seconds', () => {
  const publicLayout = readSource('../src/app/(public)/layout.tsx')
  const galleryPage = readSource('../src/app/(public)/thu-vien/page.tsx')
  const categoryPage = readSource('../src/app/(public)/thu-vien/danh-muc/[slug]/page.tsx')
  const tagPage = readSource('../src/app/(public)/thu-vien/tag/[slug]/page.tsx')
  const albumPage = readSource('../src/app/(public)/thu-vien/[slug]/page.tsx')

  assert.match(publicLayout, /export const revalidate\s*=\s*60/)
  for (const page of [galleryPage, categoryPage, tagPage, albumPage]) {
    assert.match(page, /export const revalidate\s*=\s*60/)
    assert.doesNotMatch(page, /export const dynamic\s*=\s*['"]force-dynamic['"]/)
  }
})

test('server public landing pages expose unique self-canonical metadata', () => {
  const metadataPages = new Map([
    ['../src/app/(public)/gioi-thieu/page.tsx', '/gioi-thieu'],
    ['../src/app/(public)/gioi-thieu/dich-vu/page.tsx', '/gioi-thieu/dich-vu'],
    ['../src/app/(public)/gioi-thieu/quy-trinh/page.tsx', '/gioi-thieu/quy-trinh'],
    ['../src/app/(public)/lien-he/page.tsx', '/lien-he']
  ])

  for (const [relativePath, canonicalPath] of metadataPages) {
    const source = readSource(relativePath)
    assert.match(source, /createPublicMetadata/)
    assert.match(source, new RegExp(`path:\\s*['"]${canonicalPath.replaceAll('/', '\\/')}['"]`))
  }
})

test('tag landing canonicalizes itself and only indexes tags with tagged albums', () => {
  const tagPage = readSource('../src/app/(public)/thu-vien/tag/[slug]/page.tsx')

  assert.match(tagPage, /absoluteUrl\(\s*`\/thu-vien\/tag\/\$\{[^}]+\}`\s*\)/)
  assert.match(tagPage, /totalPrimary\s*>\s*0/)
  assert.match(tagPage, /robots:\s*{[\s\S]*?index:\s*isIndexable[\s\S]*?follow:\s*true/)
  assert.match(tagPage, /notFound\(\)/)
})

test('pricing category calls to action resolve against public database slugs', () => {
  const pricingPage = readSource('../src/app/(public)/bang-gia/page.tsx')
  const pricingClientPath = new URL('../src/app/(public)/bang-gia/PricingClient.tsx', import.meta.url)
  const pricingData = readSource('../src/app/(public)/bang-gia/data/bang-gia.ts')

  assert.doesNotMatch(pricingPage, /['"]use client['"]/)
  assert.match(pricingPage, /getPublicCategorySlugs/)
  assert.match(pricingPage, /<PricingClient\b[\s\S]*?publicCategorySlugs=/)
  assert.equal(existsSync(pricingClientPath), true, 'interactive pricing content must remain client-side')
  assert.match(pricingData, /categoryHref/)
  assert.match(pricingData, /publicCategorySlugs/)
})
