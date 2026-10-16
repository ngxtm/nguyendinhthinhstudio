import catalog from '@ndt/types/pricing-catalog.json'
import type { PricingCategoryId, PricingPrices } from '@ndt/types'

export const pricingCategories = catalog as (Omit<(typeof catalog)[number], 'id'> & { id: PricingCategoryId })[]
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
  prices: PricingPrices
): T[] {
  return packages.map(group => ({
    ...group,
    subCard: group.subCard.map(card => ({ ...card, price: publishedPrice(prices, card.title) / 1000 }))
  }))
}
