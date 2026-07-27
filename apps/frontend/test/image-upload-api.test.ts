import test from 'node:test'
import assert from 'node:assert/strict'
import { ApiError } from '../src/lib/api/client'
import { UploadApiError, asUploadApiError, createClientRequestId, runAdminImageUpload } from '../src/lib/api/images'

test('client request IDs are unique UUID-like values', () => {
  const a = createClientRequestId()
  const b = createClientRequestId()
  assert.notEqual(a, b)
  assert.match(a, /^[0-9a-f-]+$/i)
})

test('maps a structured presign 429 to UploadApiError without losing retryAfter', () => {
  const retryAfter = '2099-01-01T00:00:00.000Z'

  assert.throws(
    () =>
      asUploadApiError(
        new ApiError(429, 'Too Many Requests', {
          code: 'upload_rate_limited',
          retryAfter
        })
      ),
    error => {
      assert.ok(error instanceof UploadApiError)
      assert.equal(error.code, 'upload_rate_limited')
      assert.equal(error.retryAfter, retryAfter)
      return true
    }
  )
})

test('does not turn a non-rate-limited API error into an upload-rate error', () => {
  const original = new ApiError(500, 'Internal Server Error', {
    code: 'unexpected'
  })
  assert.throws(
    () => asUploadApiError(original),
    error => error === original
  )
})

test('does not retry a rate-limited presign request', async () => {
  let presignCalls = 0
  const retryAfter = '2099-01-01T00:00:00.000Z'

  await assert.rejects(
    () =>
      runAdminImageUpload(
        '00000000-0000-4000-8000-000000000003',
        new File(['image'], 'testing.jpg', { type: 'image/jpeg' }),
        undefined,
        {
          probeCapability: async () => ({ outcome: 'supported' }),
          optimize: async () => ({
            blob: new Blob(['webp'], { type: 'image/webp' }),
            filename: 'testing.webp',
            contentType: 'image/webp',
            fileSize: 4,
            processedSha256: 'a'.repeat(64),
            width: 1,
            height: 1
          }),
          createClientRequestId: () => '00000000-0000-4000-8000-000000000001',
          presign: async () => {
            presignCalls += 1
            throw new UploadApiError('upload_rate_limited', retryAfter)
          },
          put: async () => undefined,
          confirm: async () => {
            throw new Error('must not confirm')
          },
          status: async () => {
            throw new Error('must not read status')
          },
          abandon: async () => ({
            outcome: 'abandoned',
            statusCode: 200,
            uploadId: '00000000-0000-4000-8000-000000000002',
            code: 'upload_abandoned',
            message: 'Abandoned'
          })
        }
      ),
    error => {
      assert.ok(error instanceof UploadApiError)
      assert.equal(error.code, 'upload_rate_limited')
      assert.equal(error.retryAfter, retryAfter)
      return true
    }
  )

  assert.equal(presignCalls, 1)
})
