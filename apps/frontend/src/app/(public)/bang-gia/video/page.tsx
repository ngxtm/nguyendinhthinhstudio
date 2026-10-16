import { getPublishedPricing } from '@/lib/api/pricing'
import PriceClient from './PriceClient'

export default async function VideoPricePage() {
  const { prices } = await getPublishedPricing('video')
  return <PriceClient prices={prices} />
}
