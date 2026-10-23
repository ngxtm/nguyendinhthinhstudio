import assert from 'node:assert/strict'
import test from 'node:test'
import { generateMetadata } from '../src/app/(public)/thu-vien/danh-muc/[slug]/page'

test('category previews select a published album cover and fall back to the current homepage image', async t => {
  const previousOrigin = process.env.NEXT_PUBLIC_API_URL
  process.env.NEXT_PUBLIC_API_URL = 'https://api.example.test'
  const requests: URL[] = []
  let albums: Array<{ title: string; coverImage?: { largeUrl: string } }> = []
  t.mock.method(globalThis, 'fetch', async (input: URL | string) => {
    const url = new URL(input)
    requests.push(url)
    if (url.pathname === '/categories/slug/wedding') {
      return Response.json({ name: 'Wedding', slug: 'wedding', albumCount: albums.length })
    }
    if (url.pathname === '/albums') {
      assert.equal(url.searchParams.get('category'), 'wedding')
      assert.equal(url.searchParams.get('status'), 'published')
      return Response.json({ data: albums, pagination: { page: Number(url.searchParams.get('page')), hasMore: false } })
    }
    throw new Error(`Unexpected API call: ${url.pathname}`)
  })

  try {
    const cover = 'https://img.example.test/wedding-cover.webp'
    albums = [
      { title: 'No cover' },
      { title: 'Wedding album', coverImage: { largeUrl: cover } },
      { title: 'Later album', coverImage: { largeUrl: 'https://img.example.test/later.webp' } }
    ]
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'wedding' }),
      searchParams: Promise.resolve({ page: '2' })
    })
    assert.deepEqual(metadata.openGraph?.images, [{ url: cover, alt: 'Wedding album' }])
    assert.deepEqual(metadata.twitter?.images, [cover])
    assert.equal(metadata.alternates?.canonical, 'https://ndtstudio.com.vn/thu-vien/danh-muc/wedding?page=2')
    assert.equal(requests.find(url => url.pathname === '/albums')?.searchParams.get('page'), '2')
    assert.equal(requests.length, 2, 'reuse the category and album requests without fetching extra image data')

    for (const withoutCover of [
      [],
      [{ title: 'No cover' }],
      [{ title: 'Empty cover URL', coverImage: { largeUrl: '' } }]
    ]) {
      albums = withoutCover
      const fallback = await generateMetadata({
        params: Promise.resolve({ slug: 'wedding' }),
        searchParams: Promise.resolve({})
      })
      assert.deepEqual(fallback.openGraph?.images, [
        { url: 'https://ndtstudio.com.vn/share_home_v3.jpg', alt: 'NDT Studio' }
      ])
      assert.deepEqual(fallback.twitter?.images, ['https://ndtstudio.com.vn/share_home_v3.jpg'])
    }
  } finally {
    if (previousOrigin === undefined) delete process.env.NEXT_PUBLIC_API_URL
    else process.env.NEXT_PUBLIC_API_URL = previousOrigin
  }
})
