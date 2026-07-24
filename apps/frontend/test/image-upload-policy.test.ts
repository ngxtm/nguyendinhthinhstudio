import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { IMAGE_GRAMMAR_FIXTURES, INITIAL_IMAGE_UPLOAD_POLICY } from '@ndt/image-upload-policy'
import { computeTargetDimensions, optimizeImage } from '../src/lib/image-upload/optimizer'
import { BoundedImageResourceRegistry } from '../src/lib/image-upload/resource-registry'
import { getImageUploadErrorMessage, IMAGE_NORMALIZATION_MESSAGE } from '../src/app/admin/components/ImageUploadErrors'

test('fails closed for source bytes above 100 MiB', async () => {
  const file = new File([new Uint8Array(INITIAL_IMAGE_UPLOAD_POLICY.maxSourceBytes + 1)], 'large.jpg', {
    type: 'image/jpeg'
  })
  await assert.rejects(
    () =>
      optimizeImage(
        file,
        INITIAL_IMAGE_UPLOAD_POLICY,
        {
          outcome: 'supported',
          chromiumMajor: 136,
          orientationMode: 'display',
          targetSizeDecode: true,
          webpEncode: true,
          srgbOutput: true
        },
        new BoundedImageResourceRegistry()
      ),
    /image_source_bytes_exceeded/
  )
})

test('uses a validated pass-through for small already-compliant sources', async () => {
  const fixture = IMAGE_GRAMMAR_FIXTURES.find(item => item.id === 'png-srgb')!
  let png = new Uint8Array()
  for await (const chunk of fixture.input()) png = new Uint8Array(chunk)
  const file = new File([png], 'tiny.png', { type: 'image/png' })
  const result = await optimizeImage(
    file,
    INITIAL_IMAGE_UPLOAD_POLICY,
    {
      outcome: 'supported',
      chromiumMajor: 136,
      orientationMode: 'display',
      targetSizeDecode: true,
      webpEncode: true,
      srgbOutput: true
    },
    new BoundedImageResourceRegistry()
  )
  assert.equal(result.disposition, 'passed-through')
  assert.equal(result.contentType, 'image/png')
  assert.match(result.processedSha256, /^[a-f0-9]{64}$/)
})

test('normalizes a valid non-allowlisted ICC source exactly once', async () => {
  const source = new Uint8Array(await readFile(new URL('../public/favicon.jpg', import.meta.url)))
  const outputFixture = IMAGE_GRAMMAR_FIXTURES.find(item => item.id === 'webp-vp8l-intrinsic-alpha')!
  let output = new Uint8Array()
  for await (const chunk of outputFixture.input()) output = new Uint8Array(chunk)

  let normalizeCalls = 0
  const result = await optimizeImage(
    new File([source], 'favicon.jpg', { type: 'image/jpeg' }),
    INITIAL_IMAGE_UPLOAD_POLICY,
    {
      outcome: 'supported',
      chromiumMajor: 136,
      orientationMode: 'display',
      targetSizeDecode: true,
      webpEncode: true,
      srgbOutput: true
    },
    new BoundedImageResourceRegistry(),
    undefined,
    {
      normalize: async () => {
        normalizeCalls++
        return {
          blob: new Blob([output], { type: 'image/webp' }),
          width: 1,
          height: 1
        }
      }
    }
  )

  assert.equal(normalizeCalls, 1)
  assert.equal(result.disposition, 'normalized')
  assert.equal(result.contentType, 'image/webp')
  assert.equal(result.filename, 'favicon.webp')
})

test('uses friendly Vietnamese image errors without exposing raw codes', () => {
  const invalidIcc = getImageUploadErrorMessage('image_invalid_icc')
  const badLength = getImageUploadErrorMessage('image_bad_length')
  assert.equal(invalidIcc, 'Dữ liệu màu trong ảnh bị hỏng. Vui lòng xuất lại ảnh rồi thử lại.')
  assert.equal(badLength, 'Ảnh có cấu trúc không hợp lệ hoặc đã bị hỏng. Vui lòng xuất lại ảnh rồi thử lại.')
  assert.doesNotMatch(String(invalidIcc), /ICC|image_invalid_icc/)
  assert.equal(IMAGE_NORMALIZATION_MESSAGE, 'Hệ thống sẽ tự chuẩn hóa màu của ảnh khi cần.')
})

test('target dimensions preserve aspect ratio and decoded-pixel cap', () => {
  assert.deepEqual(computeTargetDimensions(4000, 2000, INITIAL_IMAGE_UPLOAD_POLICY), { width: 2560, height: 1280 })
  const square = computeTargetDimensions(8192, 8192, INITIAL_IMAGE_UPLOAD_POLICY)
  assert.equal(square.width, square.height)
  assert.ok(square.width * square.height <= INITIAL_IMAGE_UPLOAD_POLICY.maxDecodedPixels)
})
