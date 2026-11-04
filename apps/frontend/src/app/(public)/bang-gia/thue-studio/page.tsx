import { getPublishedPricing } from '@/lib/api/pricing'
import PriceClient from './PriceClient'

export default async function StudioRentalPage() {
  const { prices, hiddenPackageIds } = await getPublishedPricing('thue-studio')
  return <PriceClient prices={prices} hiddenPackageIds={hiddenPackageIds} />
}
