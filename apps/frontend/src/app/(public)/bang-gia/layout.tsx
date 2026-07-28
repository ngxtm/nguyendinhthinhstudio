import { createPublicMetadata } from '@/lib/seo'

export const metadata = createPublicMetadata({
  title: 'Bảng giá chụp ảnh và quay video | NDT Studio',
  description:
    'Tham khảo bảng giá các gói chụp ảnh cá nhân, cặp đôi, gia đình, team, cưới và quay video tại NDT Studio.',
  path: '/bang-gia'
})

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
