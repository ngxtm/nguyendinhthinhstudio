import test from 'node:test'
import assert from 'node:assert/strict'
import { ApiError } from '../src/lib/api/client'
import type { Album } from '../src/lib/api/albums'
import type { AlbumImagePage } from '../src/lib/api/images'
import {
  getPublicAlbumPage,
  type PublicAlbumPageDependencies,
  type PublicAlbumPageLogger
} from '../src/lib/server/public-album-page'

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
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

function imagePage(): AlbumImagePage {
  return {
    data: [],
    pagination: { hasMore: false, nextCursor: null, limit: 4 }
  }
}

function dependencies(overrides: Partial<PublicAlbumPageDependencies> = {}): PublicAlbumPageDependencies {
  return {
    getAlbum: async () => album(),
    getRelatedAlbums: async () => [],
    getAlbumImageBatch: async () => imagePage(),
    ...overrides
  }
}

test('preserves the primary album 404 instead of returning an empty page', async () => {
  const error = new ApiError(404, 'Not Found')

  await assert.rejects(
    getPublicAlbumPage('missing',
      dependencies({
        getAlbum: async () => {
          throw error
        }
      })
    ),
    (actual) => actual === error
  )
})

test('propagates primary album 500, 429, and network errors unchanged', async () => {
  const errors: Error[] = [
    new ApiError(500, 'Internal Server Error'),
    new ApiError(429, 'Too Many Requests'),
    new Error('network unavailable')
  ]

  for (const error of errors) {
    await assert.rejects(
      getPublicAlbumPage('album-1',
        dependencies({
          getAlbum: async () => {
            throw error
          }
        })
      ),
      (actual) => actual === error
    )
  }
})

test('keeps the album when related albums fail and logs only safe context', async () => {
  const relatedError = new ApiError(500, 'Internal Server Error', { secret: 'do-not-log' })
  const logs: unknown[][] = []
  const logger: PublicAlbumPageLogger = {
    warn: (...args) => logs.push(args)
  }

  const result = await getPublicAlbumPage(
    'album-1',
    dependencies({
      getRelatedAlbums: async () => {
        throw relatedError
      },
      logger
    })
  )

  assert.equal(result.album.id, 'album-1')
  assert.deepEqual(result.relatedAlbums, [])
  assert.equal(logs.length, 1)
  assert.doesNotMatch(JSON.stringify(logs), /do-not-log/)
})

test('propagates image batch errors, including 404, instead of fabricating an empty batch', async () => {
  const error = new ApiError(404, 'Not Found', { secret: 'do-not-log' })

  await assert.rejects(
    getPublicAlbumPage('album-1',
      dependencies({
        getAlbumImageBatch: async () => {
          throw error
        }
      })
    ),
    (actual) => actual === error
  )
})

test('starts independent related-album fetching before the primary album resolves', async () => {
  let releaseAlbum!: (value: Album) => void
  let relatedStarted = false
  const albumPromise = new Promise<Album>((resolve) => {
    releaseAlbum = resolve
  })

  const pagePromise = getPublicAlbumPage(
    'album-1',
    dependencies({
      getAlbum: () => albumPromise,
      getRelatedAlbums: async () => {
        relatedStarted = true
        return []
      }
    })
  )

  await Promise.resolve()
  assert.equal(relatedStarted, true)
  releaseAlbum(album())
  await pagePromise
})
