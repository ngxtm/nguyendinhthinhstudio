import { createPublicMetadata } from '@/lib/seo'

export const metadata = createPublicMetadata({
  title: 'Chụp ảnh cá nhân tại Nha Trang - Bảng giá | NDT Studio',
  description: 'Tham khảo bảng giá chụp ảnh cá nhân tại Nha Trang cho nữ, nam, mẹ bầu và trẻ em; liên hệ NDT Studio để tư vấn, đặt lịch.',
  path: '/bang-gia/ca-nhan'
})

export default function IndividualPricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
