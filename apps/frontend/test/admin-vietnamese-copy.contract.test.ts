import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const adminSourcePaths = [
  '../src/app/admin/AdminShell.tsx',
  '../src/app/admin/access-denied.tsx',
  '../src/app/admin/page.tsx',
  '../src/app/admin/login/page.tsx',
  '../src/app/admin/albums/page.tsx',
  '../src/app/admin/albums/new/page.tsx',
  '../src/app/admin/albums/[id]/page.tsx',
  '../src/app/admin/albums/[id]/edit/page.tsx',
  '../src/app/admin/categories/page.tsx',
  '../src/app/admin/tags/page.tsx',
  '../src/app/admin/tags/TagTreeView.tsx',
  '../src/app/admin/library/page.tsx',
  '../src/app/admin/staff/page.tsx',
  '../src/app/admin/components/AlbumImageTile.tsx',
  '../src/app/admin/components/CategoryCombobox.tsx',
  '../src/app/admin/components/ConfirmDialog.tsx',
  '../src/app/admin/components/DeleteConfirmModal.tsx',
  '../src/app/admin/components/ImageActionMenu.tsx',
  '../src/app/admin/components/ImageGrid.tsx',
  '../src/app/admin/components/ImageUploadErrors.tsx',
  '../src/app/admin/components/ImageUploadProgress.tsx',
  '../src/app/admin/components/ImageUploadZone.tsx',
  '../src/app/admin/components/MoveImagesDialog.tsx',
  '../src/app/admin/components/SearchableCombobox.tsx'
]

const source = adminSourcePaths
  .map(relativePath => readFileSync(new URL(relativePath, import.meta.url), 'utf8'))
  .join('\n')

test('admin UI exposes Vietnamese navigation, statuses, and actions', () => {
  for (const pattern of [
    /label: 'Dashboard'/,
    /label: 'Albums'/,
    /label: 'Categories'/,
    /label: 'Tags'/,
    />Albums Published</,
    />Published</,
    />Draft</,
    />Status</,
    />Category</,
    />Images</,
    />Views</,
    />Actions</,
    />Edit</,
    />Retry</,
    />Bulk Remove</,
    /<strong>Tip:<\/strong>/
  ]) {
    assert.doesNotMatch(source, pattern)
  }

  for (const text of [
    'Bảng điều khiển',
    'Bộ ảnh',
    'Danh mục',
    'Thẻ',
    'Đã xuất bản',
    'Nháp',
    'Trạng thái',
    'Thao tác'
  ]) {
    assert.match(source, new RegExp(text))
  }
})

test('admin UI does not expose mixed-language operational copy', () => {
  for (const pattern of [
    />\s*featured status\s*</i,
    />\s*before publish\s*</i,
    /Không thể publish/,
    /Đã publish/,
    />\s*Click\s*</i,
    /upload trước/,
    />\s*Cover\s*</i,
    />\s*Order:\s*</i,
    />\s*Parent\s*</i,
    />\s*Children\s*</i,
    />\s*Optional\s*</i,
    />\s*SEO Settings\s*</i
  ]) {
    assert.doesNotMatch(source, pattern)
  }
})
