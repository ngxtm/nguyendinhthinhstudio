import type { AdminPricing, PricingCategoryId, PublicPricing, UpdatePricing } from '@ndt/types'
import { adminApiClient, publicApiClient } from './client'

export function getPublishedPricing(category: PricingCategoryId): Promise<PublicPricing> {
  return publicApiClient(`/pricing/${category}`, { cache: 'no-store' })
}

export function getAdminPricing(category: PricingCategoryId, signal?: AbortSignal): Promise<AdminPricing> {
  return adminApiClient(`/pricing/admin/${category}`, { signal, cache: 'no-store' })
}

export function savePricingDraft(category: PricingCategoryId, input: UpdatePricing): Promise<AdminPricing> {
  return adminApiClient(`/pricing/admin/${category}/draft`, { method: 'PUT', body: JSON.stringify(input) })
}

export function publishPricing(category: PricingCategoryId, input: UpdatePricing): Promise<AdminPricing> {
  return adminApiClient(`/pricing/admin/${category}/publish`, { method: 'POST', body: JSON.stringify(input) })
}
