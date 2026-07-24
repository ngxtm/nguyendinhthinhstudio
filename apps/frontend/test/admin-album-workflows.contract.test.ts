import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { INITIAL_IMAGE_UPLOAD_POLICY } from '@ndt/image-upload-policy'
import * as imagesApi from '../src/lib/api/images'

test('admin album list always requests the authenticated admin collection', () => {
  const source = readFileSync(new URL('../src/app/admin/albums/page.tsx', import.meta.url), 'utf8')
  const listCall = source.match(/await listAlbums\([\s\S]*?\n\s*\);/)?.[0]

  assert.ok(listCall, 'admin album list call must remain present')
  assert.match(listCall, /\{\s*signal,\s*admin:\s*true\s*\}/)
})

test('admin album forms load taxonomy through the authenticated client', () => {
  for (const relativePath of [
    '../src/app/admin/albums/new/page.tsx',
    '../src/app/admin/albums/[id]/edit/page.tsx'
  ]) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /\bgetTags\(\s*\)/, relativePath)
    assert.doesNotMatch(source, /\bgetCategories\(\s*\)/, relativePath)
  }
})

test('browser upload uses the current policy request and waits for consumption', async () => {
  const runCurrentPolicyUpload = (
    imagesApi as typeof imagesApi & {
      runCurrentPolicyUpload?: (...args: any[]) => Promise<void>
    }
  ).runCurrentPolicyUpload

  assert.equal(typeof runCurrentPolicyUpload, 'function')
  if (!runCurrentPolicyUpload) return

  const file = new File(['image'], 'testing.jpg', { type: 'image/jpeg' })
  const processedSha256 = 'a'.repeat(64)
  const clientRequestId = '00000000-0000-4000-8000-000000000001'
  const uploadId = '00000000-0000-4000-8000-000000000002'
  const progress: number[] = []
  let presignInput: Record<string, unknown> | undefined
  let statusCalls = 0

  await runCurrentPolicyUpload('00000000-0000-4000-8000-000000000003', file, (value: number) => progress.push(value), {
    loadPolicy: async () => ({
      policyVersion: 'web-v1-test',
      policy: INITIAL_IMAGE_UPLOAD_POLICY
    }),
    probeCapability: async () => ({
      outcome: 'supported',
      chromiumMajor: 136,
      orientationMode: 'display',
      targetSizeDecode: true,
      webpEncode: true,
      srgbOutput: true
    }),
    createRegistry: () => ({
      reserve: () => ({
        itemId: 'testing.jpg',
        kind: 'output-blob',
        token: Symbol('testing.jpg'),
        owner: 'testing.jpg'
      }),
      transfer: (lease: any) => lease,
      release: () => undefined,
      snapshot: () => ({
        decodedOrVisibleSurfaces: 0,
        residentOutputBlobs: 0,
        total: 0,
        leases: []
      })
    }),
    optimize: async () => ({
      blob: file,
      filename: file.name,
      contentType: 'image/jpeg',
      fileSize: file.size,
      processedSha256,
      width: 1,
      height: 1,
      policyVersion: 'web-v1-test',
      disposition: 'passed-through'
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
      statusCalls++
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
    filename: 'testing.jpg',
    contentType: 'image/jpeg',
    fileSize: file.size,
    processedSha256,
    policyVersion: 'web-v1-test'
  })
  assert.equal(statusCalls, 1)
  assert.equal(progress.at(-1), 100)
})
