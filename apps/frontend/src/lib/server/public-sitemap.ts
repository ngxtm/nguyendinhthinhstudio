import type { MetadataRoute } from 'next'
import { getAlbums, type Album, type QueryAlbumsParams, type PaginatedResponse } from '@/lib/api/albums'
import { getIndexableCategories, type PublicCategory } from '@/lib/api/categories'
import { SITE_URL } from '@/lib/seo'

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

export type PublicSitemapLogger = {
  error(message: string, context: { errorType: string }): void
}

export type PublicSitemapDependencies = {
  getAlbums?: (params: QueryAlbumsParams) => Promise<PaginatedResponse<Album>>
  getIndexableCategories?: () => Promise<PublicCategory[]>
  logger?: PublicSitemapLogger
}

const defaultLogger: PublicSitemapLogger = {
  error: (message, context) => console.error(message, context)
}

function errorType(error: unknown): string {
  if (error instanceof Error) return error.name || 'Error'
  return typeof error
}

function resolveDependencies(dependencies: PublicSitemapDependencies) {
  return {
    getAlbums: dependencies.getAlbums ?? getAlbums,
    getIndexableCategories: dependencies.getIndexableCategories ?? getIndexableCategories,
    logger: dependencies.logger ?? defaultLogger
  }
}

/**
 * Loads every published album page. A missing continuation cursor or a cursor
 * loop means the catalog is incomplete and must fail the sitemap request.
 */
export async function loadPublishedAlbumCatalog(dependencies: PublicSitemapDependencies = {}): Promise<Album[]> {
  const { getAlbums: loadAlbums } = resolveDependencies(dependencies)
  const albums: Album[] = []
  const seenAlbumIds = new Set<string>()
  const seenCursors = new Set<string>()
  let cursor: string | undefined

  while (true) {
    const response = await loadAlbums({
      status: 'published',
      limit: 50,
      cursor,
      sortBy: 'newest'
    })

    for (const album of response.data) {
      if (album.status !== 'published' || seenAlbumIds.has(album.id)) continue
      seenAlbumIds.add(album.id)
      albums.push(album)
    }

    const { hasMore, nextCursor } = response.pagination
    if (hasMore && !nextCursor) {
      throw new Error('SITEMAP_INCOMPLETE_PAGE')
    }
    if (nextCursor && seenCursors.has(nextCursor)) {
      throw new Error('SITEMAP_CURSOR_LOOP')
    }
    if (!hasMore) break

    seenCursors.add(nextCursor!)
    cursor = nextCursor!
  }

  return albums
}

function dedupeByUrl(entries: MetadataRoute.Sitemap): MetadataRoute.Sitemap {
  const seenUrls = new Set<string>()
  return entries.filter(entry => {
    if (seenUrls.has(entry.url)) return false
    seenUrls.add(entry.url)
    return true
  })
}

function albumLastModified(album: Album): string | undefined {
  return album.updatedAt || album.publishedAt || undefined
}

function categoryLastModified(category: PublicCategory): string | undefined {
  return category.updatedAt || undefined
}

export async function loadPublicSitemap(dependencies: PublicSitemapDependencies = {}): Promise<MetadataRoute.Sitemap> {
  const resolved = resolveDependencies(dependencies)

  try {
    const [albums, categories] = await Promise.all([
      loadPublishedAlbumCatalog(resolved),
      resolved.getIndexableCategories()
    ])
    const categoryUrls: MetadataRoute.Sitemap = categories.map(category => ({
      url: `${SITE_URL}/thu-vien/danh-muc/${category.slug}`,
      ...(categoryLastModified(category) ? { lastModified: categoryLastModified(category) } : {}),
      changeFrequency: 'weekly',
      priority: 0.75
    }))
    const albumUrls: MetadataRoute.Sitemap = albums.map(album => ({
      url: `${SITE_URL}/thu-vien/${album.slug}`,
      ...(albumLastModified(album) ? { lastModified: albumLastModified(album) } : {}),
      changeFrequency: 'weekly',
      priority: 0.8
    }))

    return dedupeByUrl([...staticPages, ...categoryUrls, ...albumUrls])
  } catch (error) {
    resolved.logger.error('Error generating sitemap:', { errorType: errorType(error) })
    throw error
  }
}
