import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ApiError, getTagAlbums } from '@/lib/api'
import { absoluteUrl } from '@/lib/seo'
import TagGalleryClient from './TagGalleryClient'

type PageParams = {
  params: Promise<{
    slug: string
  }>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)

  try {
    const response = await getTagAlbums(slug, { limit: 1, offset: 0 })
    const tagName = response.tag.name
    const description =
      response.tag.description || `Khám phá các album thuộc tag ${tagName} tại Nguyen Dinh Thinh Studio.`
    const pageTitle = `${tagName} | Thư viện ảnh`
    const canonical = absoluteUrl(`/thu-vien/tag/${response.tag.slug}`)
    const isIndexable = response.pagination.totalPrimary > 0

    return {
      title: { absolute: pageTitle },
      description,
      alternates: { canonical },
      robots: { index: isIndexable, follow: true },
      openGraph: {
        type: 'website',
        locale: 'vi_VN',
        siteName: 'NDT Studio',
        title: pageTitle,
        description,
        url: canonical
      }
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return {
        title: 'Tag không tồn tại | Thư viện ảnh',
        robots: { index: false, follow: true }
      }
    }

    return {
      title: 'Thư viện ảnh',
      robots: { index: false, follow: true }
    }
  }
}

export default async function TagGalleryPage({ params }: PageParams) {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)

  try {
    const initial = await getTagAlbums(slug, { limit: 20, offset: 0 })

    return (
      <div className="px-4 md:px-8 lg:px-16">
        <TagGalleryClient
          slug={slug}
          initialTag={initial.tag}
          initialAlbums={initial.data}
          initialPagination={initial.pagination}
        />
      </div>
    )
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound()
    }

    throw error
  }
}
