import { getPublishedPricing } from '@/lib/api/pricing'
import PriceClient from './PriceClient'

export default async function CouplePricePage() {
  const { prices, hiddenPackageIds } = await getPublishedPricing('couple')
  return <PriceClient prices={prices} hiddenPackageIds={hiddenPackageIds} />
}
