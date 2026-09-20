import { createPublicMetadata } from '@/lib/seo'

export const metadata = createPublicMetadata({
  title: 'Chụp ảnh cưới tại Nha Trang - Bảng giá | NDT Studio',
  description: 'Tham khảo bảng giá các gói chụp ảnh cưới tại Nha Trang của NDT Studio; liên hệ để được tư vấn theo nhu cầu.',
  path: '/bang-gia/wedding'
})

export default function WeddingPricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
