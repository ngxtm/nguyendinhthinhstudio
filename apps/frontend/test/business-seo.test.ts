import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { businessProfile, createBusinessEntitySchema } from '../src/config/business'

const readSource = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

const layoutSource = readSource('../src/app/layout.tsx')
const contactSource = readSource('../src/app/(public)/lien-he/page.tsx')
const pricingSource = readSource('../src/app/(public)/bang-gia/PricingClient.tsx')
const socialSectionSource = readSource('../src/app/components/common/SocialSection.tsx')

test('business schema output uses the confirmed shared identity and contact facts', () => {
  const schema = createBusinessEntitySchema({
    type: 'LocalBusiness',
    sameAs: ['https://example.test/confirmed-account']
  })

  assert.equal(schema['@id'], 'https://ndtstudio.com.vn/#business')
  assert.equal(schema.name, 'Nguyễn Đình Thịnh Studio')
  assert.equal(schema.telephone, '+84983885473')
  assert.deepEqual(schema.address, {
    '@type': 'PostalAddress',
    streetAddress: '111/1 Thống Nhất',
    addressLocality: 'Nha Trang',
    addressRegion: 'Khánh Hòa',
    postalCode: '650000',
    addressCountry: 'VN'
  })
  assert.deepEqual(schema.openingHoursSpecification, [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: '07:00',
      closes: '17:00'
    }
  ])
  assert.deepEqual(schema.sameAs, ['https://example.test/confirmed-account'])
})

test('homepage, contact, and pricing schemas point to the same business entity', () => {
  assert.match(layoutSource, /import\s+{[^}]*businessProfile[^}]*}\s+from\s+'@\/config\/business'/)
  assert.match(contactSource, /import\s+{[^}]*businessProfile[^}]*}\s+from\s+'@\/config\/business'/)
  assert.match(pricingSource, /import\s+{[^}]*businessProfile[^}]*}\s+from\s+'@\/config\/business'/)
  assert.match(layoutSource, /'@id':\s*businessProfile\.id/)
  assert.match(contactSource, /'@id':\s*businessProfile\.id/)

  const providerReferences = pricingSource.match(/provider:\s*{\s*'@id':\s*businessProfile\.id\s*}/g) ?? []
  assert.equal(providerReferences.length, 4)
})

test('review invitation does not promise a rating or an incentive', () => {
  const reviewCopy = 'Nếu bạn đã sử dụng dịch vụ, hãy chia sẻ trải nghiệm thực tế của mình trên Google Maps.'

  assert.match(contactSource, new RegExp(reviewCopy))
  assert.doesNotMatch(contactSource, /Vote\s+5\s+sao|5%|ưu đãi.*đánh giá/i)
  assert.doesNotMatch(
    `${layoutSource}\n${contactSource}\n${pricingSource}`,
    /AggregateRating|ratingValue|reviewRating/i
  )
})

test('unconfirmed social accounts remain page-owned until the identity gate is resolved', () => {
  assert.deepEqual(businessProfile.social.approvedSameAs, [])

  for (const url of [
    'https://facebook.com/nguyendinhthinh.foto',
    'https://instagram.com/nguyendinhthinh.foto',
    'https://www.tiktok.com/@nguyendinhthinhstudio'
  ]) {
    assert.match(layoutSource, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }

  for (const url of [
    'https://www.facebook.com/nguyendinhthinh.foto',
    'https://www.instagram.com/nguyendinhthinh.foto',
    'https://www.tiktok.com/@nguyendinhthinhstudio'
  ]) {
    assert.match(socialSectionSource, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }

  for (const url of [
    'https://facebook.com/ndtstudio',
    'https://instagram.com/ndtstudio',
    'https://maps.app.goo.gl/aQKTojhw51Bo8LMW6'
  ]) {
    assert.match(contactSource, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})
