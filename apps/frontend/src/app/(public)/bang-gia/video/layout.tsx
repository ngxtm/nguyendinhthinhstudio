import { createPublicMetadata } from '@/lib/seo'

export const metadata = createPublicMetadata({
  title: 'Bảng giá quay video | NDT Studio',
  description: 'Bảng giá các gói quay và sản xuất video nội dung tại NDT Studio.',
  path: '/bang-gia/video'
})

export default function VideoPricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
