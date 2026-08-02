import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const detailSource = readFileSync(new URL('../src/app/admin/albums/[id]/page.tsx', import.meta.url), 'utf8')
const albumsApiSource = readFileSync(new URL('../src/lib/api/albums.ts', import.meta.url), 'utf8')

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
const uploadZoneSource = readOptionalSource('../src/app/admin/components/ImageUploadZone.tsx')

test('publish keeps the gallery mounted, disables duplicate submits, and refreshes the authenticated album', () => {
  assert.match(detailSource, /const \[isPublishing, setIsPublishing\] = useState\(false\)/)
  assert.match(
    detailSource,
    /const updated = await publishAlbum\(album\.id\)[\s\S]*?setAlbum\(updated\)[\s\S]*?await loadAlbum\(\{ showLoading: false \}\)/
  )
  assert.match(detailSource, /disabled=\{isPublishing\}/)
  assert.match(detailSource, /isPublishing \? 'Đang xuất bản\.\.\.' : 'Xuất bản'/)
})

test('album bulk selection is explicit, snapshot-based, and touch-safe', () => {
  assert.match(detailSource, /selectionMode/)
  assert.match(detailSource, /disabled=\{uploading\}/)
  assert.match(imageGridSource, /selectedImageIds/)
  assert.match(imageGridSource, /bulkDeleteAlbumImages\(albumId, Array\.from\(selectedImageIds\)\)/)
  assert.match(imageGridSource, /Chọn tất cả/)
  assert.match(imageGridSource, /Bỏ chọn tất cả/)
  assert.match(imageGridSource, /Xóa \{selectedImageIds\.size\} ảnh/)
  assert.match(imageGridSource, /fixed inset-x-0 bottom-0/)
  assert.match(imageGridSource, /env\(safe-area-inset-bottom\)/)
  assert.match(imageTileSource, /selectionMode/)
  assert.match(imageTileSource, /role="checkbox"/)
  assert.match(imageTileSource, /aria-checked=\{selected\}/)
})

test('album selection exposes a searchable move-to-album action', () => {
  const moveDialogSource = readOptionalSource('../src/app/admin/components/MoveImagesDialog.tsx')

  assert.match(imageGridSource, /moveAlbumImages\(/)
  assert.match(imageGridSource, /<MoveImagesDialog/)
  assert.match(imageGridSource, /Chuyển bộ ảnh/)
  assert.match(moveDialogSource, /listAlbums\(/)
  assert.match(moveDialogSource, /type="search"/)
  assert.match(moveDialogSource, /Tìm bộ ảnh đích/)
  assert.match(albumsApiSource, /`\/albums\/\$\{sourceAlbumId\}\/images\/move`/)
})

test('upload and album selection modes lock each other', () => {
  assert.match(detailSource, /disabled=\{selectionMode\}/)
  assert.match(detailSource, /onUploadingChange=\{setUploading\}/)
  assert.match(detailSource, /selectionDisabled=\{uploading\}/)
  assert.match(uploadZoneSource, /disabled\?: boolean/)
  assert.match(uploadZoneSource, /onUploadingChange\?: \(uploading: boolean\) => void/)
  assert.match(uploadZoneSource, /<fieldset[\s\S]*?disabled=\{disabled\}/)
})

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

test('album edit normalizes the API date before binding it to the date input', () => {
  assert.match(editSource, /shootDate:\s*albumData\.shootDate\?\.slice\(0,\s*10\)\s*\?\?\s*''/)
})

test('album edit exposes a guarded destructive delete action', () => {
  assert.match(editSource, /deleteAlbum\(album\.id\)/)
  assert.match(editSource, /router\.replace\('\/admin\/albums'\)/)
  assert.match(editSource, /Xóa bộ ảnh/)
  assert.match(editSource, /disabled=\{loading \|\| deleting\}/)
})
