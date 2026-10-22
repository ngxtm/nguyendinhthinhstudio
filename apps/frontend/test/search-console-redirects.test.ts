import assert from 'node:assert/strict'
import test from 'node:test'
import { unstable_getResponseFromNextConfig, getRedirectUrl } from 'next/experimental/testing/server'
import nextConfig from '../next.config.mjs'

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
