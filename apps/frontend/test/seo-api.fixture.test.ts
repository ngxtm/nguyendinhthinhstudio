import assert from 'node:assert/strict'
import { test } from 'node:test'
import { startSeoApi } from './fixtures/seo-api'

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

test('SEO fixture exposes public category, gallery, image, and SVG shapes', async () => {
  const server = await startSeoApi({ port: 0 })
  try {
    const navigation = await fetch(`${server.origin}/categories/navigation`)
    assert.equal(navigation.status, 200)
    const categories = (await navigation.json()) as Array<Record<string, unknown>>
    assert.equal(categories[0]?.slug, 'wedding')
    assert.equal(categories[0]?.showInNavigation, true)

    const albumsResponse = await fetch(`${server.origin}/albums?status=published&limit=8&sortBy=gallery&page=1`)
    assert.equal(albumsResponse.status, 200)
    const albums = (await albumsResponse.json()) as {
      data: Array<{ id: string; slug: string; status: string; coverImage?: { largeUrl: string } }>
      pagination: { hasMore: boolean; nextCursor: string | null; page?: number; total?: number; totalPages?: number }
    }
    assert.deepEqual(
      albums.data.map(album => album.id),
      page1Ids
    )
    assert.equal(albums.pagination.hasMore, true)
    assert.equal(albums.pagination.nextCursor, 'fixture-main-08')
    assert.equal(albums.pagination.page, 1)
    assert.equal(albums.pagination.total, 17)
    assert.equal(albums.pagination.totalPages, 3)
    assert.equal(albums.data[0]?.status, 'published')
    assert.match(albums.data[0]?.coverImage?.largeUrl ?? '', /127\.0\.0\.1/)

    const imageBatch = await fetch(`${server.origin}/images/album/fixture-main-01/batch?limit=4`)
    assert.equal(imageBatch.status, 200)
    const images = (await imageBatch.json()) as {
      data: Array<{ id: string; width: number; height: number; largeUrl: string }>
      pagination: { hasMore: boolean; nextCursor: string | null; limit: number }
    }
    assert.equal(images.data.length, 4)
    assert.deepEqual({ width: images.data[0]?.width, height: images.data[0]?.height }, { width: 640, height: 480 })
    assert.equal(images.pagination.limit, 4)

    const image = await fetch(images.data[0]!.largeUrl)
    assert.equal(image.status, 200)
    assert.match(image.headers.get('content-type') ?? '', /^image\/svg\+xml/)
    assert.match(await image.text(), /<svg[^>]+width="640"[^>]+height="480"/)
  } finally {
    await server.close()
  }
})

test('SEO fixture supports numbered and cursor gallery pagination with stable IDs', async () => {
  const server = await startSeoApi({ port: 0 })
  try {
    const numbered = await fetch(`${server.origin}/albums?status=published&limit=8&sortBy=gallery&page=2`)
    assert.equal(numbered.status, 200)
    const numberedBody = (await numbered.json()) as {
      data: Array<{ id: string }>
      pagination: { hasMore: boolean; nextCursor: string | null; page?: number }
    }
    assert.deepEqual(
      numberedBody.data.map(album => album.id),
      page2Ids
    )
    assert.equal(numberedBody.pagination.page, 2)
    assert.equal(numberedBody.pagination.nextCursor, 'fixture-wedding-07')

    const cursor = await fetch(
      `${server.origin}/albums?status=published&limit=8&sortBy=gallery&cursor=fixture-wedding-07`
    )
    assert.equal(cursor.status, 200)
    const cursorBody = (await cursor.json()) as {
      data: Array<{ id: string }>
      pagination: { hasMore: boolean; nextCursor: string | null; page?: number }
    }
    assert.deepEqual(
      cursorBody.data.map(album => album.id),
      ['fixture-wedding-08']
    )
    assert.equal(cursorBody.pagination.hasMore, false)
    assert.equal(cursorBody.pagination.nextCursor, null)
    assert.equal(cursorBody.pagination.page, undefined)

    const category = await fetch(
      `${server.origin}/albums?status=published&category=wedding&limit=8&sortBy=gallery&page=1`
    )
    assert.equal(category.status, 200)
    const categoryBody = (await category.json()) as { data: Array<{ id: string }> }
    assert.deepEqual(
      categoryBody.data.map(album => album.id),
      [
        'fixture-wedding-01',
        'fixture-wedding-02',
        'fixture-wedding-03',
        'fixture-wedding-04',
        'fixture-wedding-05',
        'fixture-wedding-06',
        'fixture-wedding-07',
        'fixture-wedding-08'
      ]
    )
  } finally {
    await server.close()
  }
})

test('SEO fixture control route toggles local failure modes and rejects unknown routes', async () => {
  const server = await startSeoApi({ port: 0 })
  try {
    const control = async (mode: string) => {
      const response = await fetch(`${server.origin}/_fixture/control?mode=${mode}`)
      assert.equal(response.status, 200)
      return response.json() as Promise<{ mode: string; enabled: boolean }>
    }

    assert.deepEqual(await control('primary404'), { mode: 'primary404', enabled: true })
    assert.equal((await fetch(`${server.origin}/albums/fixture-main-01`)).status, 404)
    await control('reset')

    await control('primary500')
    assert.equal((await fetch(`${server.origin}/albums/fixture-main-01`)).status, 500)
    await control('reset')

    await control('related500')
    assert.equal((await fetch(`${server.origin}/albums/fixture-main-01/related`)).status, 500)
    await control('reset')

    await control('image404')
    assert.equal((await fetch(`${server.origin}/images/album/fixture-main-01/batch?limit=4`)).status, 404)
    await control('reset')

    await control('image500')
    assert.equal((await fetch(`${server.origin}/images/album/fixture-main-01/batch?limit=4`)).status, 500)
    await control('reset')

    await control('sitemapSecondPageFailure')
    const sitemapPageOne = await fetch(`${server.origin}/albums?status=published&limit=50&sortBy=newest`)
    assert.equal(sitemapPageOne.status, 200)
    const sitemapBody = (await sitemapPageOne.json()) as { pagination: { hasMore: boolean; nextCursor: string | null } }
    assert.equal(sitemapBody.pagination.hasMore, true)
    assert.ok(sitemapBody.pagination.nextCursor)
    assert.equal(
      (
        await fetch(
          `${server.origin}/albums?status=published&limit=50&sortBy=newest&cursor=${encodeURIComponent(sitemapBody.pagination.nextCursor!)}`
        )
      ).status,
      500
    )
    await control('reset')

    assert.equal((await fetch(`${server.origin}/unknown-route`)).status, 404)
  } finally {
    await server.close()
  }
})
