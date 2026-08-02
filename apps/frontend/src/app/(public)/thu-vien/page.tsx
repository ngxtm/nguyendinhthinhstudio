import { listAlbums } from '@/lib/api'
import { createPublicMetadata } from '@/lib/seo'
import GalleryClient from './GalleryClient'

export const dynamic = 'force-dynamic'

export const metadata = createPublicMetadata({
  title: 'Thư viện ảnh NDT Studio',
  description: 'Khám phá các album và concept nhiếp ảnh đã xuất bản của NDT Studio tại Nha Trang.',
  path: '/thu-vien'
})

export default async function GalleryPage() {
  const initial = await listAlbums({
    status: 'published',
    limit: 8,
    sortBy: 'gallery'
  })

  return <GalleryClient initialAlbums={initial.data} initialPagination={initial.pagination} />
}
