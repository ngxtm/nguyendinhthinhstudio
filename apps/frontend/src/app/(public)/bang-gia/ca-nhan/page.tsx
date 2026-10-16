import { getPublishedPricing } from '@/lib/api/pricing'
import PriceClient from './PriceClient'

export default async function IndividualPricePage() {
  const { prices } = await getPublishedPricing('ca-nhan')
  return <PriceClient prices={prices} />
}
