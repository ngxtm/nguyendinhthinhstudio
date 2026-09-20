import { createPublicMetadata } from '@/lib/seo'

export const metadata = createPublicMetadata({
  title: 'Chụp ảnh gia đình tại Nha Trang - Bảng giá | NDT Studio',
  description: 'Tham khảo bảng giá chụp ảnh gia đình tại Nha Trang và các gói hiện có của NDT Studio; liên hệ để được tư vấn.',
  path: '/bang-gia/gia-dinh'
})

export default function FamilyPricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
