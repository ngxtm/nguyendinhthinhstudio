import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const modulePath = new URL('../src/lib/public-gallery-swr.ts', import.meta.url)

function readSource(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

type Album = {
  id: string
  title: string
  slug: string
}

function album(id: string): Album {
  return { id, title: id, slug: id }
}

test('gallery page keys stop after the API reports no more cursor pages', async () => {
  assert.equal(existsSync(modulePath), true, 'public-gallery-swr.ts must exist')
  if (!existsSync(modulePath)) return

  const { getGalleryPageKey } = await import(modulePath.href)
  const getKey = getGalleryPageKey('nu')
  const first = getKey(0, null)
  const second = getKey(1, {
    data: [album('beauty-1')],
    pagination: { hasMore: true, nextCursor: 'cursor-2', limit: 8 }
  })
  const end = getKey(2, {
    data: [album('beauty-2')],
    pagination: { hasMore: false, nextCursor: null, limit: 8 }
  })

  assert.deepEqual(first, ['gallery-albums', 'nu', 1, null])
  assert.deepEqual(second, ['gallery-albums', 'nu', 1, 'cursor-2'])
  assert.equal(end, null)

  const pageTwoKey = getGalleryPageKey('nu', 2)
  assert.deepEqual(pageTwoKey(0, null), ['gallery-albums', 'nu', 2, null])
  assert.deepEqual(
    pageTwoKey(1, {
      data: [album('page-2-album')],
      pagination: { hasMore: true, nextCursor: 'cursor-3', limit: 8 }
    }),
    ['gallery-albums', 'nu', 2, 'cursor-3']
  )
})

test('tag page keys advance by the API next offset', async () => {
  assert.equal(existsSync(modulePath), true, 'public-gallery-swr.ts must exist')
  if (!existsSync(modulePath)) return

  const { getTagPageKey } = await import(modulePath.href)
  const getKey = getTagPageKey('nang-tho', 20)

  assert.deepEqual(getKey(0, null), ['tag-albums', 'nang-tho', 20, 0])
  assert.deepEqual(
    getKey(1, {
      tag: { id: 'tag-1', name: 'Nàng thơ', slug: 'nang-tho' },
      data: [album('album-1')],
      pagination: {
        limit: 20,
        offset: 0,
        nextOffset: 20,
        hasMore: true,
        totalPrimary: 1,
        totalFallback: 0
      }
    }),
    ['tag-albums', 'nang-tho', 20, 20]
  )
})

test('public gallery pages merge SWR results without duplicate albums', async () => {
  assert.equal(existsSync(modulePath), true, 'public-gallery-swr.ts must exist')
  if (!existsSync(modulePath)) return

  const { mergeAlbumPages, mergeTagPages } = await import(modulePath.href)
  const pageOne = {
    data: [album('one'), album('two')],
    pagination: { hasMore: true, nextCursor: 'next', limit: 8 }
  }
  const pageTwo = {
    data: [album('two'), album('three')],
    pagination: { hasMore: false, nextCursor: null, limit: 8 }
  }

  const mergedAlbums = mergeAlbumPages([pageOne, pageTwo]) as Album[]
  assert.deepEqual(mergedAlbums.map(item => item.id), ['one', 'two', 'three'])

  const mergedTagAlbums = mergeTagPages([
    {
      tag: { id: 'tag-1', name: 'Nàng thơ', slug: 'nang-tho' },
      data: [album('one'), album('two')],
      pagination: pageOne.pagination
    },
    {
      tag: { id: 'tag-1', name: 'Nàng thơ', slug: 'nang-tho' },
      data: [album('two'), album('three')],
      pagination: { limit: 20, offset: 20, nextOffset: null, hasMore: false, totalPrimary: 3, totalFallback: 0 }
    }
  ]) as Album[]
  assert.deepEqual(mergedTagAlbums.map(item => item.id), ['one', 'two', 'three'])
})

test('public gallery SWR revalidates on focus and reconnect without polling', async () => {
  assert.equal(existsSync(modulePath), true, 'public-gallery-swr.ts must exist')
  if (!existsSync(modulePath)) return

  const { publicGallerySWRConfig } = await import(modulePath.href)

  assert.equal(publicGallerySWRConfig.dedupingInterval, 60_000)
  assert.equal(publicGallerySWRConfig.revalidateOnFocus, true)
  assert.equal(publicGallerySWRConfig.revalidateOnReconnect, true)
  assert.equal(publicGallerySWRConfig.refreshInterval, 0)
})

test('album detail image page keys advance by cursor and stop after the final batch', async () => {
  const detailModule = new URL('../src/lib/public-album-detail-swr.ts', import.meta.url)
  assert.equal(existsSync(detailModule), true, 'public-album-detail-swr.ts must exist')
  if (!existsSync(detailModule)) return

  const { getAlbumImagePageKey, mergeAlbumImagePages } = await import(detailModule.href)
  const getKey = getAlbumImagePageKey('album-1')
  const firstPage = {
    data: [album('image-1'), album('image-2')],
    pagination: { hasMore: true, nextCursor: 'cursor-3', limit: 8 }
  }
  const secondPage = {
    data: [album('image-2'), album('image-3')],
    pagination: { hasMore: false, nextCursor: null, limit: 8 }
  }

  assert.deepEqual(getKey(0, null), ['album-images', 'album-1', null])
  assert.deepEqual(getKey(1, firstPage), ['album-images', 'album-1', 'cursor-3'])
  assert.equal(getKey(2, secondPage), null)
  assert.deepEqual(
    mergeAlbumImagePages([firstPage, secondPage]).map((image: Album) => image.id),
    ['image-1', 'image-2', 'image-3']
  )
})

test('gallery and album detail clients use cursor batches while the first album batch stays server-provided', () => {
  const galleryClient = readSource('../src/app/(public)/thu-vien/GalleryClient.tsx')
  const tagClient = readSource('../src/app/(public)/thu-vien/tag/[slug]/TagGalleryClient.tsx')
  const albumDetailClient = readSource('../src/app/(public)/thu-vien/[slug]/AlbumDetailClient.tsx')
  const albumDetailPage = readSource('../src/app/(public)/thu-vien/[slug]/page.tsx')

  assert.match(galleryClient, /useSWRInfinite/)
  assert.match(tagClient, /useSWRInfinite/)
  assert.match(albumDetailClient, /useSWRInfinite/)
  assert.match(albumDetailClient, /IntersectionObserver/)
  assert.match(albumDetailClient, /nextCursor/)
  assert.match(albumDetailClient, /hasMore/)
  assert.match(albumDetailPage, /getAlbumImageBatch/)
  assert.match(albumDetailPage, /initialImagePage/)
})

test('public cursor galleries keep their sentinel but do not render progress or completion footer labels', () => {
  const galleryClient = readSource('../src/app/(public)/thu-vien/GalleryClient.tsx')
  const tagClient = readSource('../src/app/(public)/thu-vien/tag/[slug]/TagGalleryClient.tsx')
  const albumDetailClient = readSource('../src/app/(public)/thu-vien/[slug]/AlbumDetailClient.tsx')

  for (const source of [galleryClient, tagClient, albumDetailClient]) {
    assert.match(source, /loadMoreRef/)
    assert.doesNotMatch(source, /Đang tải thêm/)
    assert.doesNotMatch(source, /Đã hiển thị tất cả/)
  }
})
