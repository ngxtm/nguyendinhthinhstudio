import test from 'node:test'
import assert from 'node:assert/strict'
import type { Album, PaginatedResponse, QueryAlbumsParams } from '../src/lib/api/albums'
import type { PublicCategory } from '../src/lib/api/categories'
import {
  loadPublishedAlbumCatalog,
  loadPublicSitemap,
  type PublicSitemapDependencies
} from '../src/lib/server/public-sitemap'

function album(overrides: Partial<Album> = {}): Album {
  return {
    id: 'album-1',
    title: 'Album 1',
    slug: 'album-1',
    status: 'published',
    isFeatured: false,
    imageCount: 1,
    viewCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    ...overrides
  }
}

function category(overrides: Partial<PublicCategory> = {}): PublicCategory {
  return {
    id: 'category-1',
    name: 'Category 1',
    slug: 'category-1',
    albumCount: 1,
    showInNavigation: true,
    navigationOrder: 1,
    updatedAt: '2026-02-02T00:00:00.000Z',
    ...overrides
  }
}

function page(data: Album[], pagination: PaginatedResponse<Album>['pagination']): PaginatedResponse<Album> {
  return { data, pagination }
}

function dependencies(overrides: Partial<PublicSitemapDependencies> = {}): PublicSitemapDependencies {
  return {
    getAlbums: async () => page([], { hasMore: false, nextCursor: null, limit: 50 }),
    getIndexableCategories: async () => [],
    logger: { error: () => undefined },
    ...overrides
  }
}

test('rejects when the album API fails on the second cursor page', async () => {
  const pageError = new Error('album page unavailable')

  await assert.rejects(
    loadPublishedAlbumCatalog(
      dependencies({
        getAlbums: async (params: QueryAlbumsParams) => {
          if (params.cursor === undefined) {
            return page([album()], { hasMore: true, nextCursor: 'page-2', limit: 50 })
          }
          throw pageError
        }
      })
    ),
    error => error === pageError
  )
})

test('rejects when indexable categories fail instead of returning static pages', async () => {
  const categoryError = new Error('category API unavailable')

  await assert.rejects(
    loadPublicSitemap(
      dependencies({
        getIndexableCategories: async () => {
          throw categoryError
        }
      })
    ),
    error => error === categoryError
  )
})

test('rejects an incomplete cursor page with no next cursor', async () => {
  await assert.rejects(
    loadPublishedAlbumCatalog(
      dependencies({
        getAlbums: async () => page([album()], { hasMore: true, nextCursor: null, limit: 50 })
      })
    ),
    /SITEMAP_INCOMPLETE_PAGE/
  )
})

test('rejects a cursor loop instead of fetching the same page forever', async () => {
  let calls = 0

  await assert.rejects(
    loadPublishedAlbumCatalog(
      dependencies({
        getAlbums: async () => {
          calls += 1
          return page([album({ id: `album-${calls}` })], { hasMore: true, nextCursor: 'same-cursor', limit: 50 })
        }
      })
    ),
    /SITEMAP_CURSOR_LOOP/
  )

  assert.equal(calls, 2)
})

test('builds a complete deduplicated sitemap with published albums and content timestamps', async () => {
  const result = await loadPublicSitemap(
    dependencies({
      getAlbums: async (params: QueryAlbumsParams) =>
        params.cursor === undefined
          ? page(
              [
                album({ id: 'old', slug: 'old', updatedAt: '2026-03-01T00:00:00.000Z' }),
                album({ id: 'draft', slug: 'draft', status: 'draft' })
              ],
              { hasMore: true, nextCursor: 'page-2', limit: 50 }
            )
          : page(
              [
                album({ id: 'new', slug: 'new', updatedAt: '2026-04-01T00:00:00.000Z', imageCount: 12 }),
                album({ id: 'old-copy', slug: 'old', updatedAt: '2026-05-01T00:00:00.000Z' })
              ],
              { hasMore: false, nextCursor: null, limit: 50 }
            ),
      getIndexableCategories: async () => [
        category(),
        category({ id: 'category-1-copy', updatedAt: '2026-03-01T00:00:00.000Z' })
      ]
    })
  )

  const urls = result.map(entry => entry.url)
  const oldAlbumUrl = 'https://ndtstudio.com.vn/thu-vien/old'
  const newAlbumUrl = 'https://ndtstudio.com.vn/thu-vien/new'
  const categoryUrl = 'https://ndtstudio.com.vn/thu-vien/danh-muc/category-1'

  assert.equal(urls.filter(url => url === oldAlbumUrl).length, 1)
  assert.equal(urls.filter(url => url === categoryUrl).length, 1)
  assert.ok(urls.includes(newAlbumUrl), 'a newly published album from a later page must be included')
  assert.ok(!urls.includes('https://ndtstudio.com.vn/thu-vien/draft'))

  assert.equal(result.find(entry => entry.url === oldAlbumUrl)?.lastModified, '2026-03-01T00:00:00.000Z')
  assert.equal(result.find(entry => entry.url === newAlbumUrl)?.lastModified, '2026-04-01T00:00:00.000Z')
  assert.equal(result.find(entry => entry.url === categoryUrl)?.lastModified, '2026-02-02T00:00:00.000Z')
  assert.ok(result.every(entry => entry.lastModified !== new Date().toISOString()))
})

test('starts album and category requests together', async () => {
  let albumsStarted = false
  let categoriesStarted = false
  let releaseAlbums!: () => void
  let releaseCategories!: () => void

  const albumPromise = new Promise<PaginatedResponse<Album>>(resolve => {
    releaseAlbums = () => resolve(page([], { hasMore: false, nextCursor: null, limit: 50 }))
  })
  const categoryPromise = new Promise<PublicCategory[]>(resolve => {
    releaseCategories = () => resolve([])
  })

  const sitemapPromise = loadPublicSitemap(
    dependencies({
      getAlbums: async () => {
        albumsStarted = true
        return albumPromise
      },
      getIndexableCategories: async () => {
        categoriesStarted = true
        return categoryPromise
      }
    })
  )

  await Promise.resolve()
  assert.equal(albumsStarted, true)
  assert.equal(categoriesStarted, true)
  releaseAlbums()
  releaseCategories()
  await sitemapPromise
})

test('returns all unique albums from the exported catalog helper for downstream image sitemaps', async () => {
  const result = await loadPublishedAlbumCatalog(
    dependencies({
      getAlbums: async (params: QueryAlbumsParams) =>
        params.cursor === undefined
          ? page([album({ id: 'one', slug: 'one', imageCount: 4 })], { hasMore: true, nextCursor: 'next', limit: 50 })
          : page([album({ id: 'two', slug: 'two', imageCount: 7 })], { hasMore: false, nextCursor: null, limit: 50 })
    })
  )

  assert.deepEqual(
    result.map(({ id, slug, imageCount, updatedAt, publishedAt }) => ({
      id,
      slug,
      imageCount,
      updatedAt,
      publishedAt
    })),
    [
      {
        id: 'one',
        slug: 'one',
        imageCount: 4,
        updatedAt: '2026-02-01T00:00:00.000Z',
        publishedAt: undefined
      },
      {
        id: 'two',
        slug: 'two',
        imageCount: 7,
        updatedAt: '2026-02-01T00:00:00.000Z',
        publishedAt: undefined
      }
    ]
  )
})
