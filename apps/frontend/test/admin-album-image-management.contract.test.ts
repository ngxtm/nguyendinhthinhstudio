import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const detailSource = readFileSync(
  new URL('../src/app/admin/albums/[id]/page.tsx', import.meta.url),
  'utf8',
)

test('post-upload album refresh keeps the existing grid mounted', () => {
  assert.match(
    detailSource,
    /async function loadAlbum\([\s\S]*?showLoading = true[\s\S]*?\): Promise<void>/,
  )
  assert.match(
    detailSource,
    /async function handleUploadComplete\(\)[\s\S]*await loadAlbum\(\{ showLoading: false \}\)/,
  )
})

const imageGridSource = readFileSync(
  new URL('../src/app/admin/components/ImageGrid.tsx', import.meta.url),
  'utf8',
)

test('album images keep PhotoSwipe clicks and expose actions through a footer menu', () => {
  assert.match(imageGridSource, /data-pswp-src=\{lightboxUrl\}/)
  assert.match(imageGridSource, /aria-haspopup="menu"/)
  assert.match(imageGridSource, /<MoreVertical/)
  assert.match(imageGridSource, /Đặt làm ảnh bìa/)
  assert.match(imageGridSource, /Xóa ảnh/)
  assert.doesNotMatch(imageGridSource, /absolute inset-0 z-20/)
})

const editSource = readFileSync(
  new URL('../src/app/admin/albums/[id]/edit/page.tsx', import.meta.url),
  'utf8',
)

test('album edit exposes a guarded destructive delete action', () => {
  assert.match(editSource, /deleteAlbum\(album\.id\)/)
  assert.match(editSource, /router\.replace\('\/admin\/albums'\)/)
  assert.match(editSource, /Xóa album/)
  assert.match(editSource, /disabled=\{loading \|\| deleting\}/)
})
