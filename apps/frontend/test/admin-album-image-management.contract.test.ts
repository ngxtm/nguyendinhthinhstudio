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
