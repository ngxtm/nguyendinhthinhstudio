import { listAlbums } from '@/lib/api'
import { createPublicMetadata } from '@/lib/seo'
import { notFound, permanentRedirect } from 'next/navigation'
import {
  addGalleryPageToTitle,
  parseGalleryPageSearchParams,
  shouldNotFoundGalleryPage,
  type GallerySearchParams
} from '@/lib/gallery-pagination'
import GalleryClient from './GalleryClient'

export const revalidate = 60

const GALLERY_TITLE = 'Thư viện ảnh NDT Studio'
const GALLERY_DESCRIPTION = 'Khám phá các album và concept nhiếp ảnh đã xuất bản của NDT Studio tại Nha Trang.'

type Props = { searchParams: Promise<GallerySearchParams> }

function getPageFromSearchParams(searchParams: GallerySearchParams) {
  try {
    return parseGalleryPageSearchParams(searchParams)
  } catch {
    notFound()
  }
}

export async function generateMetadata({ searchParams }: Props) {
  let page = 1
  try {
    page = parseGalleryPageSearchParams(await searchParams).page
  } catch {
    // The page itself returns a 404 for malformed values; keep metadata generation safe.
  }

  return createPublicMetadata({
    title: addGalleryPageToTitle(GALLERY_TITLE, page),
    description: GALLERY_DESCRIPTION,
    path: page === 1 ? '/thu-vien' : `/thu-vien?page=${page}`
  })
}

export default async function GalleryPage({ searchParams }: Props) {
  const { page, explicit } = getPageFromSearchParams(await searchParams)
  if (explicit && page === 1) permanentRedirect('/thu-vien')

  const initial = await listAlbums({
    status: 'published',
    limit: 8,
    sortBy: 'gallery',
    page
  })

  if (shouldNotFoundGalleryPage(page, initial.pagination, true)) notFound()

  return (
    <GalleryClient
      initialAlbums={initial.data}
      initialPagination={initial.pagination}
      initialPage={page}
      basePath="/thu-vien"
    />
  )
}
