import assert from 'node:assert/strict'
import test from 'node:test'

import { GET as getOgImage } from '../src/app/og/route'
import { absoluteUrl, createPublicMetadata } from '../src/lib/seo'

function getOpenGraphImage(metadata: ReturnType<typeof createPublicMetadata>) {
  const images = metadata.openGraph?.images
  assert.ok(Array.isArray(images))
  assert.ok(images[0])
  const image = images[0]
  if (typeof image === 'string') return image
  if (image instanceof URL) return image.toString()
  return image.url
}

function getPngDimensions(bytes: Uint8Array) {
  assert.deepEqual(Array.from(bytes.slice(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10])
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

test('shared public metadata includes the branded fallback for OG and Twitter', () => {
  const metadata = createPublicMetadata({
    title: 'NDT Studio - Nhiếp ảnh chuyên nghiệp',
    description: 'Studio nhiếp ảnh tại Nha Trang.',
    path: '/'
  })

  assert.equal(getOpenGraphImage(metadata), absoluteUrl('/og'))
  assert.deepEqual(metadata.twitter?.images, [absoluteUrl('/og')])
  assert.equal(metadata.openGraph?.title, 'NDT Studio - Nhiếp ảnh chuyên nghiệp')
  assert.equal(metadata.twitter?.title, 'NDT Studio - Nhiếp ảnh chuyên nghiệp')
})

test('shared public metadata preserves an explicitly supplied image', () => {
  const cover = 'https://cdn.example.test/albums/cover.webp'
  const metadata = createPublicMetadata({
    title: 'Album cover',
    description: 'Album description',
    path: '/thu-vien/album-cover',
    image: cover
  })

  assert.equal(getOpenGraphImage(metadata), cover)
  assert.deepEqual(metadata.twitter?.images, [cover])
})

test('GET /og returns a real 1200 by 630 PNG', async () => {
  const response = await getOgImage()
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /^image\/png\b/)
  assert.equal(response.headers.get('x-robots-tag'), 'noindex')

  const bytes = new Uint8Array(await response.arrayBuffer())
  assert.deepEqual(getPngDimensions(bytes), { width: 1200, height: 630 })
})
