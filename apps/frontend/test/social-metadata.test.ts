import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, readFileSync } from 'node:fs'

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

test('shared public metadata uses the current homepage image for OG and Twitter', () => {
  const metadata = createPublicMetadata({
    title: 'NDT Studio - Nhiếp ảnh chuyên nghiệp',
    description: 'Studio nhiếp ảnh tại Nha Trang.',
    path: '/'
  })

  assert.equal(getOpenGraphImage(metadata), absoluteUrl('/share_home_v3.jpg'))
  assert.deepEqual(metadata.twitter?.images, [absoluteUrl('/share_home_v3.jpg')])
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

test('the current fallback is a local image and superseded preview assets are removed', () => {
  const bytes = readFileSync(new URL('../public/share_home_v3.jpg', import.meta.url))
  assert.deepEqual(Array.from(bytes.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10])
  assert.equal(existsSync(new URL('../public/share_home_v2.jpg', import.meta.url)), false)
  assert.equal(existsSync(new URL('../src/app/og/route.tsx', import.meta.url)), false)
})

test('old preview URLs redirect directly to the current homepage image', async () => {
  const { createSeoRedirects } = await import('../seo-routes.mjs')
  const redirects = createSeoRedirects()
  for (const source of ['/og', '/share_home_v2.jpg']) {
    assert.ok(
      redirects.some(
        rule =>
          rule.source === source && rule.destination === '/share_home_v3.jpg' && rule.statusCode === 301 && !('has' in rule)
      )
    )
  }
})
