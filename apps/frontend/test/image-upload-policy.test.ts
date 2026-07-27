import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_OUTPUT_BYTES,
  MAX_OUTPUT_EDGE,
  MAX_SOURCE_BYTES,
  WEBP_QUALITY
} from '../src/lib/image-upload/upload-constants'
import { computeTargetDimensions, optimizeImage } from '../src/lib/image-upload/optimizer'

const fakeBitmap = {} as CanvasImageSource

type OptimizerOverrides = Partial<{
  decode: () => Promise<{
    image: CanvasImageSource
    width: number
    height: number
    close: () => void
  }>
  encode: () => Promise<Blob>
}>

function browserEnvironment(overrides: OptimizerOverrides = {}) {
  const surface = {
    drawImage: () => undefined
  }
  return {
    decode:
      overrides.decode ??
      (async () => ({
        image: fakeBitmap,
        width: 4000,
        height: 2000,
        close: () => undefined
      })),
    createSurface: () => surface,
    encode: overrides.encode ?? (async () => new Blob(['webp'], { type: 'image/webp' }))
  }
}

test('rejects source bytes above 100 MiB before decoding', async () => {
  const oversized = {
    type: 'image/jpeg',
    size: MAX_SOURCE_BYTES + 1
  } as File

  await assert.rejects(() => optimizeImage(oversized, browserEnvironment()), /image_source_bytes_exceeded/)
})

test('accepts each supported source type and always encodes it once to WebP', async () => {
  for (const sourceType of ['image/jpeg', 'image/png', 'image/webp'] as const) {
    let encodeCalls = 0
    const result = await optimizeImage(
      new File(['source'], `portrait.${sourceType.split('/')[1]}`, {
        type: sourceType
      }),
      browserEnvironment({
        encode: async () => {
          encodeCalls += 1
          return new Blob(['webp'], { type: 'image/webp' })
        }
      })
    )

    assert.equal(encodeCalls, 1)
    assert.equal(result.filename, 'portrait.webp')
    assert.equal(result.contentType, 'image/webp')
    assert.equal(result.fileSize, 4)
    assert.deepEqual([result.width, result.height], [MAX_OUTPUT_EDGE, 1280])
  }
})

test('normalizes the output filename to Unicode NFC', async () => {
  const result = await optimizeImage(
    new File(['source'], 'Chu\u0323p Ma\u0302\u0303u4328.JPG', {
      type: 'image/jpeg'
    }),
    browserEnvironment()
  )

  assert.equal(result.filename, 'Ch\u1ee5p M\u1eabu4328.webp')
  assert.equal(result.filename, result.filename.normalize('NFC'))
})

test('rejects an unsupported source MIME before decoding', async () => {
  let decodeCalls = 0
  await assert.rejects(
    () =>
      optimizeImage(
        new File(['gif'], 'animated.gif', { type: 'image/gif' }),
        browserEnvironment({
          decode: async () => {
            decodeCalls += 1
            throw new Error('must not decode')
          }
        })
      ),
    /image_source_unsupported/
  )
  assert.equal(decodeCalls, 0)
})

test('preserves aspect ratio while limiting only the longest edge', () => {
  assert.deepEqual(computeTargetDimensions(4000, 2000), {
    width: 2560,
    height: 1280
  })
  assert.deepEqual(computeTargetDimensions(800, 1200), {
    width: 800,
    height: 1200
  })
})

test('rejects an oversized WebP result without returning the original', async () => {
  await assert.rejects(
    () =>
      optimizeImage(
        new File(['source'], 'portrait.jpg', { type: 'image/jpeg' }),
        browserEnvironment({
          encode: async () =>
            new Blob([new Uint8Array(MAX_OUTPUT_BYTES + 1)], {
              type: 'image/webp'
            })
        })
      ),
    /image_output_bytes_exceeded/
  )
})

test('does not fall back to the original when native decode fails', async () => {
  let encodeCalls = 0
  await assert.rejects(
    () =>
      optimizeImage(
        new File(['source'], 'portrait.png', { type: 'image/png' }),
        browserEnvironment({
          decode: async () => {
            throw new Error('decoder failed')
          },
          encode: async () => {
            encodeCalls += 1
            return new Blob(['webp'], { type: 'image/webp' })
          }
        })
      ),
    /image_decode_failed/
  )
  assert.equal(encodeCalls, 0)
})

test('exports the fixed WebP recipe constants', () => {
  assert.equal(WEBP_QUALITY, 0.84)
  assert.equal(MAX_OUTPUT_EDGE, 2560)
  assert.equal(MAX_OUTPUT_BYTES, 5 * 1024 * 1024)
})
