import { createPublicMetadata } from '@/lib/seo'

export const metadata = createPublicMetadata({
  title: 'Bảng giá thuê studio tại Nha Trang | NDT Studio',
  description:
    'Thuê studio tại Nha Trang với phông vô cực hoặc phông giấy. Xem giá 2 giờ đầu, giá mỗi giờ tiếp theo và các tiện ích đi kèm tại NDT Studio.',
  path: '/bang-gia/thue-studio'
})

export default function StudioRentalLayout({ children }: { children: React.ReactNode }) {
  return children
}
