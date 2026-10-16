import { getPublishedPricing } from '@/lib/api/pricing'
import PriceClient from './PriceClient'

export default async function WeddingPricePage() {
  const { prices } = await getPublishedPricing('wedding')
  return <PriceClient prices={prices} />
}
