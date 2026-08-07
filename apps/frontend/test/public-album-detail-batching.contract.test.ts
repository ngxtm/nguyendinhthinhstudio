import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const imagesApi = readFileSync(new URL('../src/lib/api/images.ts', import.meta.url), 'utf8')
const detailClient = readFileSync(
  new URL('../src/app/(public)/thu-vien/[slug]/AlbumDetailClient.tsx', import.meta.url),
  'utf8'
)

test('public album image API requests three-image cursor batches', () => {
  assert.match(imagesApi, /\/images\/album\/\$\{encodeURIComponent\(albumId\)\}\/batch/)
  assert.match(imagesApi, /PUBLIC_ALBUM_IMAGE_BATCH_SIZE\s*=\s*3/)
  assert.match(imagesApi, /cursor/)
})

test('public album detail appends cursor pages from an intersection observer', () => {
  assert.match(detailClient, /getAlbumImagePageKey/)
  assert.match(detailClient, /fetchAlbumImagePage/)
  assert.match(detailClient, /mergeAlbumImagePages/)
  assert.match(detailClient, /loadMoreRef/)
  assert.match(detailClient, /Đang tải thêm ảnh/)
})
