import { test, expect } from '@playwright/test'

const navigationOrigin = process.env.FRONTEND_BASE_URL?.trim()
const canonicalOrigin = 'https://ndtstudio.com.vn'
const fixtureReady = process.env.SEO_BROWSER_FIXTURE_READY === '1'
const parsedNavigationOrigin = navigationOrigin ? new URL(navigationOrigin) : null
const isLoopbackNavigation = Boolean(
  parsedNavigationOrigin &&
    ['http:', 'https:'].includes(parsedNavigationOrigin.protocol) &&
    ['127.0.0.1', 'localhost'].includes(parsedNavigationOrigin.hostname)
)
const browserPrerequisitesReady = Boolean(navigationOrigin && fixtureReady && isLoopbackNavigation)
const browserSkipReason = !fixtureReady
  ? 'Set SEO_BROWSER_FIXTURE_READY=1 after starting the local fixture-backed frontend'
  : !navigationOrigin
    ? 'Set FRONTEND_BASE_URL to the local fixture-backed frontend origin'
    : !isLoopbackNavigation
      ? 'FRONTEND_BASE_URL must use localhost or 127.0.0.1 for fixture-only browser QA'
      : ''

const page1Ids = [
  'fixture-main-01',
  'fixture-main-02',
  'fixture-main-03',
  'fixture-main-04',
  'fixture-main-05',
  'fixture-main-06',
  'fixture-main-07',
  'fixture-main-08'
]
const page2Ids = [
  'fixture-main-09',
  'fixture-wedding-01',
  'fixture-wedding-02',
  'fixture-wedding-03',
  'fixture-wedding-04',
  'fixture-wedding-05',
  'fixture-wedding-06',
  'fixture-wedding-07'
]
const page3Ids = ['fixture-wedding-08']
const categoryIds = [...page3Ids, ...page2Ids.slice(1)]

function navigationUrl(path: string) {
  if (!navigationOrigin) throw new Error('FRONTEND_BASE_URL is required')
  return new URL(path, navigationOrigin).toString()
}

function canonicalUrl(path: string) {
  return new URL(path, canonicalOrigin).toString()
}

async function albumIds(page: import('@playwright/test').Page): Promise<string[]> {
  return page
    .locator('main a[href^="/thu-vien/fixture-"]')
    .evaluateAll(links => links.map(link => link.getAttribute('href')?.split('/').pop() ?? '').filter(Boolean))
}

async function expectAlbumSet(page: import('@playwright/test').Page, expectedIds: string[]) {
  await expect.poll(async () => (await albumIds(page)).sort(), { timeout: 30_000 }).toEqual([...expectedIds].sort())
}

test('gallery page 2 is crawlable with JavaScript disabled', async ({ browser }) => {
  test.skip(!browserPrerequisitesReady, browserSkipReason)

  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1280, height: 600 }
  })
  const page = await context.newPage()
  const response = await page.goto(navigationUrl('/thu-vien?page=2&utm_source=browser-qa'), {
    waitUntil: 'domcontentloaded'
  })

  expect(response?.status()).toBe(200)
  await expectAlbumSet(page, page2Ids)
  expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe(canonicalUrl('/thu-vien?page=2'))
  expect(await page.getByRole('link', { name: 'Trang trước' }).getAttribute('href')).toBe('/thu-vien')
  expect(await page.getByRole('link', { name: 'Trang tiếp theo' }).getAttribute('href')).toBe('/thu-vien?page=3')
  expect(await albumIds(page)).not.toEqual(expect.arrayContaining(page1Ids))
  await context.close()
})

test('gallery pagination survives refresh/back, cursor append, and category reset with JavaScript enabled', async ({
  page
}) => {
  test.skip(!browserPrerequisitesReady, browserSkipReason)

  const albumRequests: URL[] = []
  page.on('request', request => {
    if (request.method() !== 'GET') return
    const requestUrl = new URL(request.url())
    if (requestUrl.pathname === '/albums') albumRequests.push(requestUrl)
  })

  await page.setViewportSize({ width: 1280, height: 600 })
  await page.goto(navigationUrl('/thu-vien'), { waitUntil: 'domcontentloaded' })
  await expectAlbumSet(page, page1Ids)

  await page.goto(navigationUrl('/thu-vien?page=2'), { waitUntil: 'domcontentloaded' })
  await expectAlbumSet(page, page2Ids)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonicalUrl('/thu-vien?page=2'))
  await expect(page.getByRole('link', { name: 'Trang trước' })).toHaveAttribute('href', '/thu-vien')
  await expect(page.getByRole('link', { name: 'Trang tiếp theo' })).toHaveAttribute('href', '/thu-vien?page=3')

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expectAlbumSet(page, page2Ids)

  await page.goBack({ waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(navigationUrl('/thu-vien'))
  await expectAlbumSet(page, page1Ids)

  await page.goto(navigationUrl('/thu-vien?page=2'), { waitUntil: 'domcontentloaded' })
  await expectAlbumSet(page, page2Ids)
  await page.locator('div[aria-hidden="true"]').last().scrollIntoViewIfNeeded()
  await expect
    .poll(async () => (await albumIds(page)).sort(), { timeout: 30_000 })
    .toEqual([...page2Ids, ...page3Ids].sort())
  expect(await albumIds(page)).not.toEqual(expect.arrayContaining(page1Ids))

  const cursorRequest = albumRequests.find(request => request.searchParams.get('cursor') === page2Ids.at(-1))
  expect(cursorRequest).toBeDefined()
  expect(cursorRequest?.searchParams.has('page')).toBe(false)

  await page.goto(navigationUrl('/thu-vien/danh-muc/wedding'), { waitUntil: 'domcontentloaded' })
  await expectAlbumSet(page, categoryIds)
  expect(await albumIds(page)).not.toEqual(expect.arrayContaining(page1Ids))
  expect(await albumIds(page)).not.toEqual(expect.arrayContaining(['fixture-main-09']))

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expectAlbumSet(page, categoryIds)

  await page.goBack({ waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(navigationUrl('/thu-vien?page=2'))
  await expect
    .poll(async () => {
      const ids = await albumIds(page)
      return page2Ids.every(id => ids.includes(id)) && ids.every(id => [...page2Ids, ...page3Ids].includes(id))
    })
    .toBe(true)

  expect(albumRequests.length).toBeGreaterThan(0)
  expect(albumRequests.length).toBeLessThanOrEqual(8)
  for (const request of albumRequests) {
    expect(request.searchParams.get('status')).toBe('published')
    expect(request.searchParams.get('limit')).toBe('8')
    expect(request.searchParams.get('sortBy')).toBe('gallery')
    for (const key of request.searchParams.keys()) {
      expect(['status', 'category', 'limit', 'page', 'cursor', 'sortBy']).toContain(key)
    }
    if (request.searchParams.has('cursor')) expect(request.searchParams.has('page')).toBe(false)
  }
})

test('gallery rejects malformed and out-of-range pages and permanently redirects explicit page one', async ({
  request
}) => {
  test.skip(!browserPrerequisitesReady, browserSkipReason)

  for (const path of [
    '/thu-vien?page=0',
    '/thu-vien?page=-1',
    '/thu-vien?page=1.5',
    '/thu-vien?page=NaN',
    '/thu-vien?page=Infinity',
    '/thu-vien?page=4'
  ]) {
    const response = await request.get(navigationUrl(path), { maxRedirects: 0 })
    expect(response.status(), path).toBe(404)
  }

  const repeatedQueryPath = '/thu-vien?page=2&page=3'
  expect(new URL(navigationUrl(repeatedQueryPath)).search).toBe('?page=2&page=3')
  const repeatedQueryResponse = await request.get(navigationUrl(repeatedQueryPath), { maxRedirects: 0 })
  expect(repeatedQueryResponse.status()).toBe(404)

  const redirect = await request.get(navigationUrl('/thu-vien?page=1'), { maxRedirects: 0 })
  expect(redirect.status()).toBe(308)
  expect(redirect.headers().location).toBe('/thu-vien')
})
