import { createPublicMetadata } from '@/lib/seo'

export const metadata = createPublicMetadata({
  title: 'Bảng giá chụp ảnh cá nhân | NDT Studio',
  description: 'Bảng giá và các gói chụp ảnh cá nhân dành cho nữ, nam, mẹ bầu và trẻ em tại NDT Studio.',
  path: '/bang-gia/ca-nhan'
})

export default function IndividualPricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
