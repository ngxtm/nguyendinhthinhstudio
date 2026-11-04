import test from 'node:test'
import assert from 'node:assert/strict'
import {
  pricingCategories,
  parsePriceInput,
  pricingPackageId,
  applyPublishedPrices,
  publishedPrice
} from '../src/lib/pricing'
import { pricingPackages as individual } from '../src/app/(public)/bang-gia/ca-nhan/data/ca-nhan'
import { pricingPackages as couple } from '../src/app/(public)/bang-gia/couple/data/couple'
import { pricingPackages as family } from '../src/app/(public)/bang-gia/gia-dinh/data/gia-dinh'
import { pricingPackages as wedding } from '../src/app/(public)/bang-gia/wedding/data/wedding'
import { pricingPackages as team } from '../src/app/(public)/bang-gia/team/data/team'
import { videoSinglePackages, videoProData } from '../src/app/(public)/bang-gia/video/data/video'
import { studioRentalPackages } from '../src/app/(public)/bang-gia/thue-studio/data/studio'

test('shared initial catalog matches every existing public package and its VND amount', () => {
  const groupsByCategory: Record<string, { subCard: { title: string; price: number; isPerPerson?: boolean }[] }[]> = {
    'ca-nhan': individual,
    couple,
    'gia-dinh': family,
    wedding,
    team
  }
  for (const [id, groups] of Object.entries(groupsByCategory)) {
    const category = pricingCategories.find(item => item.id === id)!
    const cards = groups.flatMap(group => group.subCard)
    assert.equal(category.packages.length, cards.length)
    assert.equal(new Set(category.packages.map(item => item.id)).size, cards.length)
    for (const card of cards) {
      const entry = category.packages.find(item => item.id === pricingPackageId(card.title))!
      assert.ok(entry, `${id}/${card.title} must be manageable`)
      assert.equal(entry.priceVnd, card.price * 1000)
      assert.equal(entry.unit === 'người', 'isPerPerson' in card && card.isPerPerson === true)
    }
  }
  const category = pricingCategories.find(item => item.id === 'video')!
  const cards = [
    ...videoSinglePackages.map(item => ({ name: item.cardTitle, price: item.price })),
    ...videoProData.cards.map(item => ({ name: item.title, price: item.price }))
  ]
  assert.equal(category.packages.length, cards.length)
  for (const card of cards)
    assert.equal(category.packages.find(item => item.id === pricingPackageId(card.name))?.priceVnd, card.price * 1000)
})

test('input accepts full VND and formatted Vietnamese thousands, rejects ambiguous and invalid prices', () => {
  for (const input of ['3900000', '3.900.000', ' 3.900.000 ']) assert.equal(parsePriceInput(input), 3900000)
  assert.equal(parsePriceInput('1'), 1)
  assert.equal(parsePriceInput('999.999.999'), 999999999)
  for (const input of ['', '0', '-1', '1e6', '3,900,000', '3.9', '3.900,5', 'abc', '₫3900000', '1000000000'])
    assert.equal(parsePriceInput(input), null, input)
})

test('studio rental uses the published initial and hourly rates and hides entire packages', () => {
  const category = pricingCategories.find(item => item.id === 'thue-studio')!
  const prices = Object.fromEntries(
    category.packages.flatMap(item => [item, ...(item.additionalRates ?? [])]).map(item => [item.id, item.priceVnd])
  )
  assert.deepEqual(studioRentalPackages(prices), [
    { id: 'phong-vo-cuc', name: 'Phông vô cực', initialPrice: 750000, hourlyPrice: 350000 },
    { id: 'phong-giay', name: 'Phông giấy', initialPrice: 350000, hourlyPrice: 150000 }
  ])
  assert.equal(studioRentalPackages({ ...prices, 'phong-giay-hourly': 175000 })[1].hourlyPrice, 175000)
  assert.deepEqual(
    studioRentalPackages(prices, ['phong-vo-cuc']).map(item => item.id),
    ['phong-giay']
  )
  assert.deepEqual(studioRentalPackages(prices, ['phong-vo-cuc', 'phong-giay']), [])
  const incomplete = { ...prices }
  delete incomplete['phong-vo-cuc-hourly']
  assert.throws(() => studioRentalPackages(incomplete), /Không thể tải giá/)
})

test('applying published prices preserves services, per-person units and original data', () => {
  const updated = applyPublishedPrices(family, { 'family-i': 1_234_567, 'family-ii': 1_500_000 })
  assert.equal(updated[0].subCard[0].price, 1234.567)
  assert.equal(updated[0].subCard[0].isPerPerson, true)
  assert.deepEqual(updated[0].subCard[0].services, family[0].subCard[0].services)
  assert.equal(family[0].subCard[0].price, 1500)
  assert.equal(publishedPrice({ 'video-pro-i': 12345678 }, 'VIDEO PRO I'), 12345678)
  assert.throws(() => applyPublishedPrices(family, {}), /Không thể tải giá/)
})

test('stopped packages disappear, empty tiers disappear, and remaining cards keep their content and order', () => {
  const prices = Object.fromEntries(
    pricingCategories.find(item => item.id === 'wedding')!.packages.map(item => [item.id, item.priceVnd])
  )
  const filtered = applyPublishedPrices(wedding, prices, ['standard-mini', 'standard-basic'])
  assert.equal(filtered[0].subCard.length, 4)
  assert.deepEqual(
    filtered[1].subCard.map(card => card.title),
    ['STANDARD SIGNATURE']
  )
  assert.deepEqual(filtered[1].subCard[0].services, wedding[1].subCard[2].services)
  assert.equal(wedding[1].subCard.length, 3)
  const noStandard = applyPublishedPrices(wedding, prices, ['standard-mini', 'standard-basic', 'standard-signature'])
  assert.equal(noStandard.length, 1)
  assert.equal(noStandard[0].type, 'PREMIUM')
  assert.deepEqual(applyPublishedPrices(wedding, prices, Object.keys(prices)), [])
})
