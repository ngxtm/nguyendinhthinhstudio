import { createPublicMetadata } from '@/lib/seo'

export const metadata = createPublicMetadata({
  title: 'Chụp ảnh couple tại Nha Trang - Bảng giá | NDT Studio',
  description: 'Tham khảo bảng giá chụp ảnh couple tại Nha Trang cho các cặp đôi và nhu cầu kỷ niệm; liên hệ NDT Studio để tư vấn, đặt lịch.',
  path: '/bang-gia/couple'
})

export default function CouplePricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
