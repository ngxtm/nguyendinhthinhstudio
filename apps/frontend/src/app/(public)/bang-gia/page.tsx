import { getPublicCategorySlugs } from '@/lib/server/public-categories'
import PricingClient from './PricingClient'

export default async function Pricing() {
  const publicCategorySlugs = await getPublicCategorySlugs()

  return <PricingClient publicCategorySlugs={[...publicCategorySlugs]} />
}
