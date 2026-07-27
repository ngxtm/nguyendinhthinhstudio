import test from 'node:test'
import assert from 'node:assert/strict'
import { probeUploadCapability } from '../src/lib/image-upload/capability-probe'

const webpProbe = async () => new Blob(['webp'], { type: 'image/webp' })

test('supports browsers with native image decode, a canvas, and WebP encoding', async () => {
  const result = await probeUploadCapability(undefined, {
    hasCreateImageBitmap: true,
    hasOffscreenCanvas: true,
    encodeWebp: webpProbe
  })

  assert.deepEqual(result, { outcome: 'supported' })
})

test('allows a regular DOM canvas when OffscreenCanvas is unavailable', async () => {
  const result = await probeUploadCapability(undefined, {
    hasCreateImageBitmap: true,
    hasOffscreenCanvas: false,
    hasDocumentCanvas: true,
    encodeWebp: webpProbe
  })

  assert.deepEqual(result, { outcome: 'supported' })
})

for (const [name, environment, code] of [
  [
    'missing native image decoding',
    { hasCreateImageBitmap: false, hasOffscreenCanvas: true, encodeWebp: webpProbe },
    'image_decoder_unavailable'
  ],
  [
    'missing every canvas surface',
    { hasCreateImageBitmap: true, hasOffscreenCanvas: false, hasDocumentCanvas: false, encodeWebp: webpProbe },
    'canvas_unavailable'
  ],
  [
    'a failed WebP encode probe',
    {
      hasCreateImageBitmap: true,
      hasOffscreenCanvas: true,
      encodeWebp: async () => new Blob(['png'], { type: 'image/png' })
    },
    'webp_encode_unavailable'
  ]
] as const) {
  test(`rejects ${name}`, async () => {
    const result = await probeUploadCapability(undefined, environment)
    assert.deepEqual(result, { outcome: 'unsupported', code })
  })
}
