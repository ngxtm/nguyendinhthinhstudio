import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_OUTPUT_BYTES, WEBP_QUALITY } from '../src/lib/image-upload/upload-constants'
import { canvasToBlobOnce, encodeWebpOnce } from '../src/lib/image-upload/optimizer.worker'

test('encodes exactly once as WebP at the fixed quality', async () => {
  let calls = 0
  let options: unknown
  const surface = {
    convertToBlob: async (value: unknown) => {
      calls += 1
      options = value
      return new Blob(['webp'], { type: 'image/webp' })
    }
  }

  await assert.doesNotReject(() => encodeWebpOnce(surface))
  assert.equal(calls, 1)
  assert.deepEqual(options, { type: 'image/webp', quality: WEBP_QUALITY })
})

test('uses one DOM-canvas toBlob encode at the fixed quality', async () => {
  let calls = 0
  let receivedType: string | undefined
  let receivedQuality: number | undefined
  const result = await canvasToBlobOnce({
    toBlob(callback, type, quality) {
      calls += 1
      receivedType = type
      receivedQuality = quality
      callback(new Blob(['webp'], { type: 'image/webp' }))
    }
  })

  assert.equal(calls, 1)
  assert.equal(receivedType, 'image/webp')
  assert.equal(receivedQuality, WEBP_QUALITY)
  assert.equal(result.type, 'image/webp')
})

test('rejects empty, non-WebP, and oversized encoder output', async () => {
  for (const blob of [
    new Blob([], { type: 'image/webp' }),
    new Blob(['png'], { type: 'image/png' }),
    new Blob([new Uint8Array(MAX_OUTPUT_BYTES + 1)], { type: 'image/webp' })
  ]) {
    await assert.rejects(
      () => encodeWebpOnce({ convertToBlob: async () => blob }),
      /image_(encode_failed|output_bytes_exceeded)/
    )
  }
})

test('does not start encoding after cancellation', async () => {
  let calls = 0
  const controller = new AbortController()
  controller.abort()

  await assert.rejects(
    () =>
      encodeWebpOnce(
        {
          convertToBlob: async () => {
            calls += 1
            return new Blob(['webp'], { type: 'image/webp' })
          }
        },
        controller.signal
      ),
    { name: 'AbortError' }
  )
  assert.equal(calls, 0)
})
