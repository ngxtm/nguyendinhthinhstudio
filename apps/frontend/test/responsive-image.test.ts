import test from 'node:test'
import assert from 'node:assert/strict'
import type { Image } from '../src/lib/api/albums'
import { getResponsiveImageProps } from '../src/lib/responsive-image'

function image(overrides: Partial<Image> = {}): Image {
  return {
    id: 'image-1',
    filename: 'image.webp',
    thumbnailUrl: 'https://img.example.test/thumbnail',
    smallUrl: 'https://img.example.test/small',
    mediumUrl: 'https://img.example.test/medium',
    largeUrl: 'https://img.example.test/large',
    xlargeUrl: 'https://img.example.test/xlarge',
    orderIndex: 0,
    width: 2400,
    height: 1600,
    ...overrides
  }
}

test('uses source dimensions for truthful landscape srcSet descriptors', () => {
  const result = getResponsiveImageProps(image(), '100vw')

  assert.equal(result.src, 'https://img.example.test/small')
  assert.equal(
    result.srcSet,
    'https://img.example.test/small 800w, https://img.example.test/medium 1200w, https://img.example.test/large 1920w'
  )
  assert.equal(result.sizes, '100vw')
  assert.equal(result.width, 2400)
  assert.equal(result.height, 1600)
  assert.ok(!result.srcSet?.includes('xlarge'))
})

test('does not use the fit box as the width descriptor for portrait images', () => {
  const result = getResponsiveImageProps(image({ width: 1600, height: 2400 }), '50vw')

  assert.equal(
    result.srcSet,
    'https://img.example.test/small 533w, https://img.example.test/medium 800w, https://img.example.test/large 1280w'
  )
  assert.equal(result.width, 1600)
  assert.equal(result.height, 2400)
})

test('does not repeat variants that cannot upscale a small source image', () => {
  const result = getResponsiveImageProps(image({ width: 640, height: 480 }), '100vw')

  assert.equal(result.srcSet, 'https://img.example.test/small 640w')
  assert.equal(result.width, 640)
  assert.equal(result.height, 480)
})

test('omits dimensions and srcSet when source dimensions are unavailable', () => {
  const source = image({ width: undefined, height: undefined })
  const snapshot = { ...source }

  assert.deepEqual(getResponsiveImageProps(source, '100vw'), {
    src: source.smallUrl,
    sizes: '100vw'
  })
  assert.deepEqual(source, snapshot)
})
