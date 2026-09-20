import { createPublicMetadata } from '@/lib/seo'

export const metadata = createPublicMetadata({
  title: 'Bảng giá quay video tại Nha Trang | NDT Studio',
  description: 'Tham khảo bảng giá các gói quay và sản xuất video nội dung tại Nha Trang của NDT Studio; liên hệ để tư vấn.',
  path: '/bang-gia/video'
})

export default function VideoPricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
