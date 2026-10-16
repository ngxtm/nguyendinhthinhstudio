import { getPublishedPricing } from '@/lib/api/pricing'
import PriceClient from './PriceClient'

export default async function CouplePricePage() {
  const { prices } = await getPublishedPricing('couple')
  return <PriceClient prices={prices} />
}
