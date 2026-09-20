import { createPublicMetadata } from '@/lib/seo'

export const metadata = createPublicMetadata({
  title: 'Chụp ảnh team tại Nha Trang - Bảng giá | NDT Studio',
  description:
    'Tham khảo bảng giá chụp ảnh team tại Nha Trang, profile cá nhân, ảnh nhóm và hình ảnh branding; liên hệ NDT Studio để tư vấn.',
  path: '/bang-gia/team'
})

export default function TeamPricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
