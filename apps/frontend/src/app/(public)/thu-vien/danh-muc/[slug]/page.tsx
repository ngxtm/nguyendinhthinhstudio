import type { Metadata } from 'next'
import Script from 'next/script'
import { notFound } from 'next/navigation'
import { ApiError } from '@/lib/api'
import { absoluteUrl } from '@/lib/seo'
import GalleryClient from '../../GalleryClient'
import { getCategoryLandingData } from './category-data'

type Props = { params: Promise<{ slug: string }> }

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)

  try {
    const { category } = await getCategoryLandingData(slug)
    const isIndexable = category.albumCount > 0
    const title = `${category.name} | Thư viện ảnh NDT Studio`
    const description = category.description || `Khám phá các album ${category.name} đã xuất bản của NDT Studio.`
    const canonical = absoluteUrl(`/thu-vien/danh-muc/${category.slug}`)

    return {
      title: { absolute: title },
      description,
      alternates: { canonical },
      robots: { index: isIndexable, follow: true },
      openGraph: {
        type: 'website',
        locale: 'vi_VN',
        siteName: 'NDT Studio',
        title,
        description,
        url: canonical
      }
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return { title: 'Danh mục không tồn tại', robots: { index: false, follow: true } }
    }
    throw error
  }
}

export default async function CategoryGalleryPage({ params }: Props) {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  let data: Awaited<ReturnType<typeof getCategoryLandingData>>

  try {
    data = await getCategoryLandingData(slug)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound()
    throw error
  }

  const { category, albums } = data
  const galleryDescription = category.description || `Các album thuộc danh mục ${category.name}.`
  const canonical = absoluteUrl(`/thu-vien/danh-muc/${category.slug}`)
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: absoluteUrl('/') },
      { '@type': 'ListItem', position: 2, name: 'Thư viện', item: absoluteUrl('/thu-vien') },
      {
        '@type': 'ListItem',
        position: 3,
        name: category.name,
        item: absoluteUrl(`/thu-vien/danh-muc/${category.slug}`)
      }
    ]
  }
  const imageGallery = {
    '@context': 'https://schema.org',
    '@type': 'ImageGallery',
    name: category.name,
    description: galleryDescription,
    url: canonical,
    creator: {
      '@type': 'Organization',
      name: 'NDT Studio',
      url: absoluteUrl('/')
    },
    associatedMedia: albums.data.flatMap(album =>
      album.coverImage
        ? [
            {
              '@type': 'ImageObject',
              name: album.title,
              contentUrl: album.coverImage.largeUrl,
              thumbnail: album.coverImage.thumbnailUrl,
              caption: album.title,
              url: absoluteUrl(`/thu-vien/${album.slug}`)
            }
          ]
        : []
    )
  }

  return (
    <>
      <GalleryClient
        initialAlbums={albums.data}
        initialPagination={albums.pagination}
        categorySlug={category.slug}
        title={category.name}
        description={galleryDescription}
      />
      <Script
        id="category-breadcrumb-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <Script
        id="category-image-gallery-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(imageGallery) }}
      />
    </>
  )
}
