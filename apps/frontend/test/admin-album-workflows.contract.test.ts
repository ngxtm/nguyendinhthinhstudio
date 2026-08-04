import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as imagesApi from '../src/lib/api/images'
import { getImageUploadErrorMessage } from '../src/app/admin/components/ImageUploadErrors'
import {
  getAdminAlbumDetailHref,
  getAdminAlbumListHref,
  parseAdminAlbumListContext
} from '../src/app/admin/albums/list-context'

test('admin album list always requests the authenticated admin collection', () => {
  const source = readFileSync(new URL('../src/app/admin/albums/page.tsx', import.meta.url), 'utf8')
  const listCall = source.match(/await listAlbums\([\s\S]*?\n\s*\);?/)?.[0]

  assert.ok(listCall, 'admin album list call must remain present')
  assert.match(listCall, /\{\s*signal,\s*admin:\s*true\s*\}/)
})

test('admin album list requests 24-item pages and renders pagination totals', () => {
  const source = readFileSync(new URL('../src/app/admin/albums/page.tsx', import.meta.url), 'utf8')

  assert.match(source, /limit:\s*24/)
  assert.match(source, /page:\s*page/)
  assert.match(source, /totalPages/)
  assert.match(source, /Đang xem/)
})

test('admin album navigation preserves page, filter, and search context', () => {
  const context = parseAdminAlbumListContext(new URLSearchParams('page=3&status=published&search=Pearlescent+Halo'))

  assert.deepEqual(context, {
    page: 3,
    filter: 'published',
    search: 'Pearlescent Halo'
  })
  assert.equal(
    getAdminAlbumDetailHref('pearlescent-halo', context),
    '/admin/albums/pearlescent-halo?page=3&status=published&search=Pearlescent+Halo'
  )
  assert.equal(getAdminAlbumListHref(context), '/admin/albums?page=3&status=published&search=Pearlescent+Halo')
})

test('admin album actions share an aligned inline-flex icon button frame', () => {
  const source = readFileSync(new URL('../src/app/admin/albums/page.tsx', import.meta.url), 'utf8')

  assert.match(source, /className="inline-flex items-center justify-center rounded p-2[^"]*"/)
})

test('admin album table keeps every column accessible through horizontal scrolling on mobile', () => {
  const source = readFileSync(new URL('../src/app/admin/albums/page.tsx', import.meta.url), 'utf8')

  assert.match(source, /<div className="overflow-x-auto">\s*<AlbumsTable/)
  assert.match(source, /<table className="w-full min-w-\[840px\]">/)
})

test('admin album forms load taxonomy through the authenticated client', () => {
  for (const relativePath of ['../src/app/admin/albums/new/page.tsx', '../src/app/admin/albums/[id]/edit/page.tsx']) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /\bgetTags\(\s*\)/, relativePath)
    assert.doesNotMatch(source, /\bgetCategories\(\s*\)/, relativePath)
  }
})

test('browser upload sends a WebP-only presign request without policyVersion', async () => {
  const runAdminImageUpload = (
    imagesApi as typeof imagesApi & {
      runAdminImageUpload?: (...args: any[]) => Promise<void>
    }
  ).runAdminImageUpload

  assert.equal(typeof runAdminImageUpload, 'function')
  if (!runAdminImageUpload) return

  const file = new File(['image'], 'testing.jpg', { type: 'image/jpeg' })
  const processedSha256 = 'a'.repeat(64)
  const clientRequestId = '00000000-0000-4000-8000-000000000001'
  const uploadId = '00000000-0000-4000-8000-000000000002'
  const progress: number[] = []
  let presignInput: Record<string, unknown> | undefined
  let statusCalls = 0

  await runAdminImageUpload('00000000-0000-4000-8000-000000000003', file, (value: number) => progress.push(value), {
    probeCapability: async () => ({ outcome: 'supported' }),
    optimize: async () => ({
      blob: new Blob(['webp'], { type: 'image/webp' }),
      filename: 'testing.webp',
      contentType: 'image/webp',
      fileSize: 4,
      processedSha256,
      width: 1,
      height: 1
    }),
    createClientRequestId: () => clientRequestId,
    presign: async (input: Record<string, unknown>) => {
      presignInput = input
      return {
        outcome: 'ready',
        statusCode: 200,
        uploadId,
        uploadUrl: 'https://upload.example.test/object',
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      }
    },
    put: async (_url: string, _blob: Blob, onProgress: (value: number) => void) => {
      onProgress(100)
    },
    confirm: async () => ({
      outcome: 'finalizing',
      statusCode: 409,
      uploadId,
      code: 'upload_finalizing',
      message: 'Finalizing upload',
      retryAfter: new Date(Date.now() - 1).toISOString()
    }),
    status: async () => {
      statusCalls += 1
      return {
        outcome: 'consumed',
        statusCode: 200,
        uploadId,
        image: {},
        resultImageId: '00000000-0000-4000-8000-000000000004',
        resultDeletedAt: null,
        retentionExpiresAt: new Date(Date.now() + 60_000).toISOString()
      }
    },
    abandon: async () => undefined
  })

  assert.deepEqual(presignInput, {
    clientRequestId,
    albumId: '00000000-0000-4000-8000-000000000003',
    filename: 'testing.webp',
    contentType: 'image/webp',
    fileSize: 4,
    processedSha256
  })
  assert.equal(statusCalls, 1)
  assert.equal(progress.at(-1), 100)
})

test('upload UI shows retryAfter for 429 and has no ICC/parser copy', () => {
  const retryAfter = '2099-01-01T00:00:00.000Z'
  const message = getImageUploadErrorMessage('upload_rate_limited', retryAfter)
  assert.match(message, /Thử lại sau/)

  const source = readFileSync(new URL('../src/app/admin/components/ImageUploadErrors.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /image_invalid_icc|image_bad_crc|image_metadata_budget_exceeded/)
  assert.match(source, /retryAfter/)
})
