import { getPublishedPricing } from '@/lib/api/pricing'
import PriceClient from './PriceClient'

export default async function TeamPricePage() {
  const { prices } = await getPublishedPricing('team')
  return <PriceClient prices={prices} />
}
