import { createPublicMetadata } from '@/lib/seo'

export const metadata = createPublicMetadata({
  title: 'Bảng giá chụp ảnh, quay video và thuê studio tại Nha Trang | NDT Studio',
  description:
    'Tham khảo bảng giá các gói chụp ảnh cá nhân, cặp đôi, gia đình, team, cưới, quay video và thuê studio tại Nha Trang của NDT Studio.',
  path: '/bang-gia'
})

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
