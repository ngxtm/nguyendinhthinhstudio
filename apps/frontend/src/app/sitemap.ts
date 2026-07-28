import type { MetadataRoute } from 'next'
import { getAlbums, getIndexableCategories, type Album } from '@/lib/api'
import { SITE_URL } from '@/lib/seo'

export const revalidate = 60

const staticPaths = [
  '',
  '/gioi-thieu',
  '/gioi-thieu/chinh-sach',
  '/gioi-thieu/dich-vu',
  '/gioi-thieu/quy-trinh',
  '/thu-vien',
  '/video',
  '/bang-gia',
  '/bang-gia/ca-nhan',
  '/bang-gia/couple',
  '/bang-gia/gia-dinh',
  '/bang-gia/team',
  '/bang-gia/video',
  '/bang-gia/wedding',
  '/lien-he'
]

const staticPages: MetadataRoute.Sitemap = staticPaths.map(path => ({
  url: `${SITE_URL}${path}`,
  changeFrequency: path === '' || path === '/thu-vien' ? 'weekly' : 'monthly',
  priority: path === '' ? 1 : path === '/thu-vien' ? 0.9 : 0.7
}))

async function getAllPublishedAlbums(): Promise<Album[]> {
  const albums: Album[] = []
  let cursor: string | undefined

  do {
    const response = await getAlbums({
      status: 'published',
      limit: 50,
      cursor,
      sortBy: 'newest'
    })
    albums.push(...response.data)
    cursor = response.pagination.nextCursor ?? undefined
    if (!response.pagination.hasMore) break
  } while (cursor)

  return albums
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const [albums, categories] = await Promise.all([getAllPublishedAlbums(), getIndexableCategories()])
    const albumUrls: MetadataRoute.Sitemap = albums.map(album => ({
      url: `${SITE_URL}/thu-vien/${album.slug}`,
      ...(album.updatedAt || album.publishedAt
        ? { lastModified: album.updatedAt || album.publishedAt || undefined }
        : {}),
      changeFrequency: 'weekly',
      priority: 0.8
    }))
    const categoryUrls: MetadataRoute.Sitemap = categories.map(category => ({
      url: `${SITE_URL}/thu-vien/danh-muc/${category.slug}`,
      lastModified: category.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.75
    }))

    return [...staticPages, ...categoryUrls, ...albumUrls]
  } catch (error) {
    console.error('Error generating sitemap:', error)
    return staticPages
  }
}
