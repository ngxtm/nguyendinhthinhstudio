import { listAlbums, type Album, type PaginatedResponse } from '@/lib/api/albums'
import { getTagAlbums, type TagAlbumsResponse } from '@/lib/api/tags'

export type GalleryPage = PaginatedResponse<Album>
export type GalleryPageKey = readonly ['gallery-albums', string, string | null]
export type TagPageKey = readonly ['tag-albums', string, number, number]

export const publicGallerySWRConfig = {
  dedupingInterval: 60_000,
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  refreshInterval: 0,
  revalidateFirstPage: true,
  persistSize: true
} as const

export function getGalleryPageKey(categorySlug?: string) {
  return (pageIndex: number, previousPageData: GalleryPage | null): GalleryPageKey | null => {
    if (pageIndex === 0) {
      return ['gallery-albums', categorySlug ?? '', null]
    }

    if (!previousPageData?.pagination.hasMore || !previousPageData.pagination.nextCursor) {
      return null
    }

    return ['gallery-albums', categorySlug ?? '', previousPageData.pagination.nextCursor]
  }
}

export async function fetchGalleryPage(key: GalleryPageKey): Promise<GalleryPage> {
  const [, categorySlug, cursor] = key

  return listAlbums({
    status: 'published',
    category: categorySlug || undefined,
    limit: 8,
    cursor: cursor ?? undefined,
    sortBy: 'gallery'
  })
}

export function getTagPageKey(slug: string, limit: number) {
  return (pageIndex: number, previousPageData: TagAlbumsResponse | null): TagPageKey | null => {
    if (pageIndex === 0) {
      return ['tag-albums', slug, limit, 0]
    }

    if (!previousPageData?.pagination.hasMore || previousPageData.pagination.nextOffset === null) {
      return null
    }

    return ['tag-albums', slug, limit, previousPageData.pagination.nextOffset]
  }
}

export async function fetchTagPage(key: TagPageKey): Promise<TagAlbumsResponse> {
  const [, slug, limit, offset] = key
  return getTagAlbums(slug, { limit, offset })
}

function mergeUniqueAlbumPages(pages: readonly { data: Album[] }[] | null | undefined): Album[] {
  const seen = new Set<string>()
  const merged: Album[] = []

  for (const page of pages ?? []) {
    for (const album of page.data) {
      if (seen.has(album.id)) continue
      seen.add(album.id)
      merged.push(album)
    }
  }

  return merged
}

export function mergeAlbumPages(pages: readonly GalleryPage[] | null | undefined): Album[] {
  return mergeUniqueAlbumPages(pages)
}

export function mergeTagPages(pages: readonly TagAlbumsResponse[] | null | undefined): Album[] {
  return mergeUniqueAlbumPages(pages)
}
