import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { XMLParser } from 'fast-xml-parser'
import type { Album, Image } from '../src/lib/api/albums'
import {
  buildAlbumImageSitemap,
  buildImageSitemapIndex,
  type ImageSitemapDependencies
} from '../src/lib/server/image-sitemap'

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: false
})

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

type TestImage = Image & {
  status?: string
  uploadStatus?: string
  deleteStatus?: string
}

function image(overrides: Partial<TestImage> = {}): TestImage {
  return {
    id: 'image-1',
    filename: 'image.webp',
    thumbnailUrl: 'https://cdn.example.test/thumb.webp',
    smallUrl: 'https://cdn.example.test/small.webp',
    mediumUrl: 'https://cdn.example.test/medium.webp',
    largeUrl: 'https://cdn.example.test/large.webp',
    xlargeUrl: 'https://cdn.example.test/xlarge.webp',
    orderIndex: 1,
    ...overrides
  }
}

function dependencies(overrides: Partial<ImageSitemapDependencies> = {}): ImageSitemapDependencies {
  const publishedAlbum = album()
  return {
    loadPublishedAlbumCatalog: async () => [publishedAlbum],
    getAlbum: async () => publishedAlbum,
    getAlbumImages: async () => [image()],
    ...overrides
  }
}

test('serializes public unique images with XML escaping and excludes non-public records', async () => {
  const currentAlbum = album({ id: 'album-escape', slug: 'concept & couple' })
  const xml = await buildAlbumImageSitemap('album-escape', {
    loadPublishedAlbumCatalog: async () => [currentAlbum],
    getAlbum: async () => currentAlbum,
    getAlbumImages: async () => [
      image({ id: 'one', largeUrl: 'https://cdn.example.test/image.webp?sig=a&part=b' }),
      image({ id: 'duplicate', largeUrl: 'https://cdn.example.test/image.webp?sig=a&part=b' }),
      image({ id: 'draft', status: 'draft', largeUrl: 'https://internal.example.test/draft.webp' }),
      image({ id: 'deleted', deleteStatus: 'deleted', largeUrl: 'https://internal.example.test/deleted.webp' }),
      image({ id: 'processing', uploadStatus: 'processing', largeUrl: 'https://internal.example.test/processing.webp' })
    ]
  })

  const parsed = parser.parse(xml)
  const urls = Array.isArray(parsed.urlset.url) ? parsed.urlset.url : [parsed.urlset.url]
  assert.equal(urls.length, 1)
  assert.equal(urls[0].loc, 'https://ndtstudio.com.vn/thu-vien/concept%20%26%20couple')
  assert.equal(urls[0]['image:image']['image:loc'], 'https://cdn.example.test/image.webp?sig=a&part=b')
  assert.equal(xml.match(/image\.webp\?sig=a&amp;part=b/g)?.length, 1)
  assert.doesNotMatch(xml, /internal\.example\.test|r2ObjectKey|draft\.webp|deleted\.webp|processing\.webp/)
})

test('serializes an empty published album as an empty image urlset', async () => {
  const currentAlbum = album({ id: 'empty-album' })
  const xml = await buildAlbumImageSitemap('empty-album', {
    loadPublishedAlbumCatalog: async () => [currentAlbum],
    getAlbum: async () => currentAlbum,
    getAlbumImages: async () => []
  })

  const parsed = parser.parse(xml)
  assert.deepEqual(parsed.urlset, {
    '@_xmlns': 'http://www.sitemaps.org/schemas/sitemap/0.9',
    '@_xmlns:image': 'http://www.google.com/schemas/sitemap-image/1.1'
  })
})

test('propagates image API failures instead of returning an empty XML response', async () => {
  const imageError = new Error('image API unavailable')

  await assert.rejects(
    buildAlbumImageSitemap(
      'album-1',
      dependencies({
        getAlbumImages: async () => {
          throw imageError
        }
      })
    ),
    error => error === imageError
  )
})

test('rejects a missing album without calling the public album or image APIs', async () => {
  let getAlbumCalls = 0
  let getImageCalls = 0

  await assert.rejects(
    buildAlbumImageSitemap('missing-album', {
      loadPublishedAlbumCatalog: async () => [],
      getAlbum: async () => {
        getAlbumCalls += 1
        return album()
      },
      getAlbumImages: async () => {
        getImageCalls += 1
        return []
      }
    }),
    /IMAGE_SITEMAP_ALBUM_NOT_FOUND/
  )

  assert.equal(getAlbumCalls, 0)
  assert.equal(getImageCalls, 0)
})

test('rejects an invalid album identifier before loading the catalog', async () => {
  let catalogCalls = 0

  await assert.rejects(
    buildAlbumImageSitemap('../private', {
      loadPublishedAlbumCatalog: async () => {
        catalogCalls += 1
        return []
      }
    }),
    /IMAGE_SITEMAP_INVALID_ALBUM_ID/
  )

  assert.equal(catalogCalls, 0)
})

test('revalidates publication through the public slug API before reading images', async () => {
  const currentAlbum = album({ id: 'album-race' })
  let getImageCalls = 0

  await assert.rejects(
    buildAlbumImageSitemap('album-race', {
      loadPublishedAlbumCatalog: async () => [currentAlbum],
      getAlbum: async () => album({ id: 'album-race', status: 'draft' }),
      getAlbumImages: async () => {
        getImageCalls += 1
        return []
      }
    }),
    /IMAGE_SITEMAP_ALBUM_NOT_FOUND/
  )

  assert.equal(getImageCalls, 0)
})

test('builds an index from the complete catalog without requesting album images', async () => {
  let imageCalls = 0
  const xml = await buildImageSitemapIndex({
    loadPublishedAlbumCatalog: async () => [album({ id: 'one' }), album({ id: 'two' })],
    getAlbumImages: async () => {
      imageCalls += 1
      return []
    }
  })

  const parsed = parser.parse(xml)
  const locations = parsed.sitemapindex.sitemap.map((entry: { loc: string }) => entry.loc)
  assert.deepEqual(locations, [
    'https://ndtstudio.com.vn/image-sitemaps/one',
    'https://ndtstudio.com.vn/image-sitemaps/two'
  ])
  assert.equal(imageCalls, 0)
})

test('fails clearly instead of silently truncating an album over the image limit', async () => {
  const currentAlbum = album({ id: 'large-album' })

  await assert.rejects(
    buildAlbumImageSitemap('large-album', {
      limits: { maxImagesPerAlbum: 1 },
      loadPublishedAlbumCatalog: async () => [currentAlbum],
      getAlbum: async () => currentAlbum,
      getAlbumImages: async () => [
        image({ id: 'one' }),
        image({ id: 'two', orderIndex: 2, largeUrl: 'https://cdn.example.test/second.webp' })
      ]
    }),
    /IMAGE_SITEMAP_ALBUM_IMAGE_LIMIT/
  )
})

test('fails clearly when the image sitemap index exceeds its child limit', async () => {
  await assert.rejects(
    buildImageSitemapIndex({
      limits: { maxIndexEntries: 1 },
      loadPublishedAlbumCatalog: async () => [album({ id: 'one' }), album({ id: 'two' })]
    }),
    /IMAGE_SITEMAP_INDEX_LIMIT/
  )
})

test('fails clearly when XML exceeds the uncompressed byte limit', async () => {
  await assert.rejects(
    buildImageSitemapIndex({
      limits: { maxXmlBytes: 64 },
      loadPublishedAlbumCatalog: async () => [album({ id: 'one' })]
    }),
    /IMAGE_SITEMAP_XML_SIZE_LIMIT/
  )
})

test('advertises both page and image sitemaps with ISR route caching', () => {
  const robots = readFileSync(new URL('../src/app/robots.ts', import.meta.url), 'utf8')
  const indexRoute = readFileSync(new URL('../src/app/image-sitemap.xml/route.ts', import.meta.url), 'utf8')
  const childRoute = readFileSync(new URL('../src/app/image-sitemaps/[albumId]/route.ts', import.meta.url), 'utf8')

  assert.match(robots, /sitemap\.xml/)
  assert.match(robots, /image-sitemap\.xml/)
  assert.match(indexRoute, /export const revalidate = 60/)
  assert.match(childRoute, /export const revalidate = 60/)
})
