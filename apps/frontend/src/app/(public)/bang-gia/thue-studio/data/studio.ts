import { pricingCategories, publishedPrice } from '@/lib/pricing'
import type { PricingPrices } from '@ndt/types'

export function studioRentalPackages(prices: PricingPrices, hiddenPackageIds: string[] = []) {
  const category = pricingCategories.find(item => item.id === 'thue-studio')!
  return category.packages
    .filter(item => !hiddenPackageIds.includes(item.id))
    .map(item => ({
      id: item.id,
      name: item.name,
      initialPrice: publishedPrice(prices, item.id),
      hourlyPrice: publishedPrice(prices, item.additionalRates![0].id)
    }))
}

export const studioAmenities = [
  { title: '03 đèn flash', description: 'Đi kèm khi thuê studio.' },
  { title: '01 bàn makeup', description: 'Không gian chuẩn bị trước buổi chụp.' },
  { title: '01 nhà vệ sinh', description: 'Tiện lợi ngay tại studio.' },
  { title: '02 chai nước lọc', description: 'Đi kèm mỗi lượt thuê.' },
  { title: '02 máy lạnh 5 HP', description: 'Làm mát mạnh, thoải mái suốt buổi chụp.' },
  { title: '01 quạt công nghiệp', description: 'Công suất cao.' }
]
