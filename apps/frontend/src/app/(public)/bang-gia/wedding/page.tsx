import { getPublishedPricing } from '@/lib/api/pricing'
import PriceClient from './PriceClient'

export default async function WeddingPricePage() {
  const { prices, hiddenPackageIds } = await getPublishedPricing('wedding')
  return <PriceClient prices={prices} hiddenPackageIds={hiddenPackageIds} />
}
