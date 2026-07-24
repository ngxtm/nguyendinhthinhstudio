import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const detailSource = readFileSync(new URL('../src/app/admin/albums/[id]/page.tsx', import.meta.url), 'utf8')

test('post-upload album refresh keeps the existing grid mounted', () => {
  assert.match(detailSource, /async function loadAlbum\([\s\S]*?showLoading = true[\s\S]*?\): Promise<void>/)
  assert.match(
    detailSource,
    /async function handleUploadComplete\(\)[\s\S]*await loadAlbum\(\{ showLoading: false \}\)/
  )
})

function readOptionalSource(relativePath: string): string {
  try {
    return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw error
  }
}

const imageGridSource = readOptionalSource('../src/app/admin/components/ImageGrid.tsx')
const imageTileSource = readOptionalSource('../src/app/admin/components/AlbumImageTile.tsx')
const imageActionsSource = readOptionalSource('../src/app/admin/components/ImageActionMenu.tsx')
const responsiveMenuSource = readOptionalSource('../src/app/admin/components/ResponsiveActionMenu.tsx')
const confirmDialogSource = readOptionalSource('../src/app/admin/components/ConfirmDialog.tsx')

test('album images keep PhotoSwipe clicks while actions stay isolated', () => {
  assert.match(imageGridSource, /<AlbumImageTile/)
  assert.match(imageGridSource, /<ConfirmDialog/)
  assert.match(imageTileSource, /data-pswp-src=\{lightboxUrl\}/)
  assert.match(imageTileSource, /<ImageActionMenu/)
  assert.doesNotMatch(imageTileSource, /deleteImage\(/)
  assert.doesNotMatch(imageActionsSource, /@\/lib\/api/)
})

test('image actions adapt to a touch-safe mobile sheet and desktop popover', () => {
  assert.match(responsiveMenuSource, /matchMedia\('\(min-width: 768px\)'\)/)
  assert.match(responsiveMenuSource, /<Dialog/)
  assert.match(responsiveMenuSource, /env\(safe-area-inset-bottom\)/)
  assert.match(responsiveMenuSource, /h-11 w-11/)
  assert.match(responsiveMenuSource, /role="menu"/)
  assert.match(imageActionsSource, /Đặt làm ảnh bìa/)
  assert.match(imageActionsSource, /Đang là ảnh bìa/)
  assert.match(imageActionsSource, /Xóa ảnh/)
  assert.match(imageActionsSource, /text-red-600/)
  assert.match(imageActionsSource, /min-h-12/)
  assert.doesNotMatch(imageActionsSource, /md:min-h-10/)
})

test('image deletion is guarded by one reusable confirmation dialog', () => {
  assert.match(imageGridSource, /deleteCandidate/)
  assert.match(imageGridSource, /await deleteImage\(image\.id\)/)
  assert.match(confirmDialogSource, /<Dialog/)
  assert.match(confirmDialogSource, /isPending/)
  assert.match(confirmDialogSource, /Xác nhận xóa/)
  assert.doesNotMatch(imageGridSource, /\bconfirm\(/)
})

const editSource = readFileSync(new URL('../src/app/admin/albums/[id]/edit/page.tsx', import.meta.url), 'utf8')

test('album edit exposes a guarded destructive delete action', () => {
  assert.match(editSource, /deleteAlbum\(album\.id\)/)
  assert.match(editSource, /router\.replace\('\/admin\/albums'\)/)
  assert.match(editSource, /Xóa album/)
  assert.match(editSource, /disabled=\{loading \|\| deleting\}/)
})
