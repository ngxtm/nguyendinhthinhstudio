import { createPublicMetadata } from '@/lib/seo'

export const metadata = createPublicMetadata({
  title: 'Bảng giá chụp ảnh cặp đôi | NDT Studio',
  description: 'Bảng giá chụp ảnh couple, kỷ niệm và anniversary dành cho các cặp đôi tại NDT Studio.',
  path: '/bang-gia/couple'
})

export default function CouplePricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
