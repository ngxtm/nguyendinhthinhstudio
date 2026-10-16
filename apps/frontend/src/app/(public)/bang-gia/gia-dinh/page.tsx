import { getPublishedPricing } from '@/lib/api/pricing'
import PriceClient from './PriceClient'

export default async function FamilyPricePage() {
  const { prices } = await getPublishedPricing('gia-dinh')
  return <PriceClient prices={prices} />
}
