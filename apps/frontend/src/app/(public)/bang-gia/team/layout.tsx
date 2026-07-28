import { createPublicMetadata } from '@/lib/seo'

export const metadata = createPublicMetadata({
  title: 'Bảng giá chụp ảnh team và doanh nghiệp | NDT Studio',
  description:
    'Bảng giá chụp ảnh team, profile, ảnh nhóm và hình ảnh thương hiệu dành cho doanh nghiệp tại NDT Studio.',
  path: '/bang-gia/team'
})

export default function TeamPricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
