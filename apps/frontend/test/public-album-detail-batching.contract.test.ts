import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const imagesApi = readFileSync(new URL('../src/lib/api/images.ts', import.meta.url), 'utf8')
const detailClient = readFileSync(
  new URL('../src/app/(public)/thu-vien/[slug]/AlbumDetailClient.tsx', import.meta.url),
  'utf8'
)

test('public album image API requests four-image cursor batches', () => {
  assert.match(imagesApi, /\/images\/album\/\$\{encodeURIComponent\(albumId\)\}\/batch/)
  assert.match(imagesApi, /PUBLIC_ALBUM_IMAGE_BATCH_SIZE\s*=\s*4/)
  assert.match(imagesApi, /cursor/)
})

test('public album detail reveals ready images independently and prefetches without a footer status', () => {
  assert.match(detailClient, /getAlbumImagePageKey/)
  assert.match(detailClient, /fetchAlbumImagePage/)
  assert.match(detailClient, /mergeAlbumImagePages/)
  assert.match(detailClient, /loadMoreRef/)
  assert.match(detailClient, /imageLoadStates/)
  assert.match(detailClient, /readyImages/)
  assert.match(detailClient, /album-image-reveal/)
  assert.match(detailClient, /fetchPriority/)
  assert.doesNotMatch(detailClient, /imagesLoaded/)
  assert.doesNotMatch(detailClient, /display:\s*imagesLoaded/)
  assert.doesNotMatch(detailClient, /animate-pulse/)
  assert.doesNotMatch(detailClient, /Đang tải thêm/)
  assert.doesNotMatch(detailClient, /Đã hiển thị tất cả/)
})

test('public album detail keeps prefetching every remaining page on normal connections', () => {
  assert.match(detailClient, /if \(!prefetchPolicy\.immediate \|\| error \|\| !hasMore\) return[\s\S]*?loadMore\(\)/)
  assert.doesNotMatch(detailClient, /initialPrefetchStartedRef/)
})

test('related album cards use the same sharp cover variant as the main gallery', () => {
  assert.match(detailClient, /src=\{related\.coverImage\.largeUrl\}/)
  assert.doesNotMatch(detailClient, /src=\{related\.coverImage\.thumbnailUrl\}/)
})

test('album detail lets the gallery and related content use the available width', () => {
  assert.match(detailClient, /min-h-screen bg-neutral-50 px-4 py-12 md:px-8 lg:px-16/)
  assert.match(detailClient, /<div className="w-full">/)
  assert.doesNotMatch(detailClient, /<div className="mx-auto max-w-7xl">/)
  assert.match(detailClient, /<div className="mx-auto mb-12 max-w-5xl md:mb-16">/)
})
