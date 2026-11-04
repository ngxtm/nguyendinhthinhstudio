import { getPublishedPricing } from '@/lib/api/pricing'
import PriceClient from './PriceClient'

export default async function VideoPricePage() {
  const { prices, hiddenPackageIds } = await getPublishedPricing('video')
  return <PriceClient prices={prices} hiddenPackageIds={hiddenPackageIds} />
}
