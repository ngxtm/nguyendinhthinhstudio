import { createPublicMetadata } from '@/lib/seo'

export const metadata = createPublicMetadata({
  title: 'Bảng giá chụp ảnh cưới | NDT Studio',
  description: 'Bảng giá chụp ảnh pre-wedding, ngày cưới và album cưới tại NDT Studio.',
  path: '/bang-gia/wedding'
})

export default function WeddingPricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
