import catalog from '@ndt/types/pricing-catalog.json'
import type { PricingCatalogCategory, PricingCatalogPackage, PricingPrices, PricingRate } from '@ndt/types'

export const pricingCategories = catalog as PricingCatalogCategory[]

export function packagePriceFields(item: PricingCatalogPackage): PricingRate[] {
  return [
    {
      id: item.id,
      label: item.unit === '2 giờ đầu' ? '2 giờ đầu' : 'Giá gói',
      priceVnd: item.priceVnd,
      unit: item.unit
    },
    ...(item.additionalRates ?? [])
  ]
}
const numberFormatter = new Intl.NumberFormat('vi-VN')
const moneyFormatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })

export function pricingPackageId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function formatPriceInput(value: number): string {
  return numberFormatter.format(value)
}

export function formatPriceVnd(value: number): string {
  return moneyFormatter.format(value)
}

export function parsePriceInput(input: string): number | null {
  const trimmed = input.trim()
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(trimmed)) return null
  const value = Number(trimmed.replaceAll('.', ''))
  return Number.isSafeInteger(value) && value >= 1 && value <= 999_999_999 ? value : null
}

export function publishedPrice(prices: PricingPrices, name: string): number {
  const value = prices[pricingPackageId(name)]
  if (!Number.isSafeInteger(value) || value < 1 || value > 999_999_999) {
    throw new Error(`Không thể tải giá của gói ${name}.`)
  }
  return value
}

export function applyPublishedPrices<T extends { subCard: { title: string; price: number }[] }>(
  packages: T[],
  prices: PricingPrices,
  hiddenPackageIds: string[] = []
): T[] {
  const hidden = new Set(hiddenPackageIds)
  return packages
    .map(group => ({
      ...group,
      subCard: group.subCard
        .filter(card => !hidden.has(pricingPackageId(card.title)))
        .map(card => ({ ...card, price: publishedPrice(prices, card.title) / 1000 }))
    }))
    .filter(group => group.subCard.length > 0)
}

export function pricingCardGridClass(count: number): string {
  if (count === 1) return 'mx-auto grid w-full max-w-xl grid-cols-1 gap-4'
  if (count === 2) return 'mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 md:grid-cols-2'
  if (count === 3) return 'grid grid-cols-1 gap-4 md:grid-cols-3'
  return 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4'
}
