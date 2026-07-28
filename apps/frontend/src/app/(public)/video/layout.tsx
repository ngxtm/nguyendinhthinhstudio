import { createPublicMetadata } from '@/lib/seo'

export const metadata = createPublicMetadata({
  title: 'Bộ sưu tập video | NDT Studio',
  description: 'Khám phá các bộ sưu tập video và nội dung sáng tạo do NDT Studio thực hiện.',
  path: '/video'
})

export default function VideoLayout({ children }: { children: React.ReactNode }) {
  return children
}
