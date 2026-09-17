import test from 'node:test'
import assert from 'node:assert/strict'
import { absoluteUrl, createPublicMetadata } from '../src/lib/seo'

test('public canonical and social URLs identify the new domain without changing page paths', () => {
  const metadata = createPublicMetadata({
    title: 'Beauty | NDT Studio',
    description: 'Beauty',
    path: '/thu-vien/danh-muc/beauty'
  })
  assert.equal(metadata.alternates?.canonical, 'https://ndtstudio.com.vn/thu-vien/danh-muc/beauty')
  assert.equal(metadata.openGraph?.url, 'https://ndtstudio.com.vn/thu-vien/danh-muc/beauty')
  assert.equal(absoluteUrl('/bang-gia#premium'), 'https://ndtstudio.com.vn/bang-gia#premium')
})

test('both www hosts normalize to the new domain, including legacy paths in one hop', async () => {
  const { createSeoRedirects } = await import('../seo-routes.mjs')
  const rules = createSeoRedirects()
  for (const host of ['www.ndtstudio.com.vn', 'www.ndtstudio.site']) {
    const hostRules = rules.filter((rule: any) =>
      rule.has?.some((condition: any) => condition.type === 'host' && condition.value === host)
    )
    assert.ok(
      hostRules.some(
        (rule: any) =>
          rule.source === '/:path*' && rule.destination === 'https://ndtstudio.com.vn/:path*' && rule.statusCode === 301
      )
    )
    const legacyIndex = hostRules.findIndex((rule: any) => rule.source === '/thu-vien/nu/beauty')
    const catchAllIndex = hostRules.findIndex((rule: any) => rule.source === '/:path*')
    assert.ok(legacyIndex >= 0 && legacyIndex < catchAllIndex)
    assert.equal(hostRules[legacyIndex].destination, 'https://ndtstudio.com.vn/thu-vien/danh-muc/beauty')
  }
  assert.ok(
    !rules.some((rule: any) => rule.source === '/:path*' && !rule.has),
    'canonical host must not redirect to itself'
  )
})
