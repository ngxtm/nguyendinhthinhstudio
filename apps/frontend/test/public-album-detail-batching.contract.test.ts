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
