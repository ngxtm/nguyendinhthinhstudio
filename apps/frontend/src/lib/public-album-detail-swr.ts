import { getAlbumImageBatch, type AlbumImagePage } from '@/lib/api/images'
import type { Image } from '@/lib/api/albums'

export type AlbumImagePageKey = readonly ['album-images', string, string | null]

export function getAlbumImagePageKey(albumId: string) {
  return (pageIndex: number, previousPageData: AlbumImagePage | null): AlbumImagePageKey | null => {
    if (pageIndex === 0) {
      return ['album-images', albumId, null]
    }

    if (!previousPageData?.pagination.hasMore || !previousPageData.pagination.nextCursor) {
      return null
    }

    return ['album-images', albumId, previousPageData.pagination.nextCursor]
  }
}

export async function fetchAlbumImagePage(key: AlbumImagePageKey): Promise<AlbumImagePage> {
  const [, albumId, cursor] = key
  return getAlbumImageBatch(albumId, cursor ?? undefined)
}

export function mergeAlbumImagePages(pages: readonly AlbumImagePage[] | null | undefined): Image[] {
  const seen = new Set<string>()
  const images: Image[] = []

  for (const page of pages ?? []) {
    for (const image of page.data) {
      if (seen.has(image.id)) continue
      seen.add(image.id)
      images.push(image)
    }
  }

  return images
}
