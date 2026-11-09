import assert from 'node:assert/strict'
import test from 'node:test'
import { unstable_getResponseFromNextConfig, getRedirectUrl } from 'next/experimental/testing/server'
import nextConfig from '../next.config.mjs'

test('the old Cosplay URL redirects to the canonical domain with its query preserved', async () => {
  const response = await unstable_getResponseFromNextConfig({
    url: 'https://ndtstudio.site/thu-vien/danh-muc/cosplay?page=2',
    nextConfig
  })
  assert.equal(response.status, 301)
  assert.equal(getRedirectUrl(response), 'https://ndtstudio.com.vn/thu-vien/danh-muc/cosplay?page=2')
})

test('the reported incomplete album URLs redirect to their published albums', async () => {
  for (const [path, destination] of [
    ['/thu-vien/kimono-', '/thu-vien/kimono-kiem-khach'],
    ['/thu-vien/angels-', '/thu-vien/angels-wish']
  ]) {
    const response = await unstable_getResponseFromNextConfig({
      url: `https://ndtstudio.com.vn${path}`,
      nextConfig
    })
    assert.equal(response.status, 301)
    assert.equal(getRedirectUrl(response), `https://ndtstudio.com.vn${destination}`)
  }
})

test('the reported malformed homepage URL redirects directly with its query preserved', async () => {
  for (const host of ['ndtstudio.com.vn', 'www.ndtstudio.com.vn', 'www.ndtstudio.site']) {
    for (const path of ['/&', '/%26']) {
      const response = await unstable_getResponseFromNextConfig({
        url: `https://${host}${path}?utm_source=search-console`,
        nextConfig
      })
      assert.equal(response.status, 301, `${host}${path}`)
      assert.equal(getRedirectUrl(response), 'https://ndtstudio.com.vn/?utm_source=search-console')
    }
  }
})

test('unknown paths are not redirected to the homepage', async () => {
  const response = await unstable_getResponseFromNextConfig({
    url: 'https://ndtstudio.com.vn/this-page-does-not-exist',
    nextConfig
  })
  assert.equal(getRedirectUrl(response), null)
})
