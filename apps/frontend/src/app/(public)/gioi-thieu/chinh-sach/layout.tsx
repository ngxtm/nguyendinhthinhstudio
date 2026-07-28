import { createPublicMetadata } from '@/lib/seo'

export const metadata = createPublicMetadata({
  title: 'Chính sách bảo hành và dịch vụ | NDT Studio',
  description: 'Thông tin về chính sách bảo hành hình ảnh, dịch vụ và quyền lợi khách hàng tại NDT Studio.',
  path: '/gioi-thieu/chinh-sach'
})

export default function PolicyLayout({ children }: { children: React.ReactNode }) {
  return children
}
