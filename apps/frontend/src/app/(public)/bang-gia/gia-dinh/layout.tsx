import { createPublicMetadata } from '@/lib/seo'

export const metadata = createPublicMetadata({
  title: 'Bảng giá chụp ảnh gia đình | NDT Studio',
  description: 'Bảng giá chụp ảnh gia đình, bố mẹ và bé, gia đình nhiều thế hệ tại NDT Studio.',
  path: '/bang-gia/gia-dinh'
})

export default function FamilyPricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
