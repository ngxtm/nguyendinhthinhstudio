import { getAlbumImageBatch, type AlbumImagePage } from '@/lib/api/images'
import type { Image } from '@/lib/api/albums'

export type AlbumImagePageKey = readonly ['album-images', string, string | null]

export type AlbumImageConnection = {
  effectiveType?: string
  saveData?: boolean
}

const constrainedConnectionTypes = new Set(['slow-2g', '2g', '3g'])

export function getAlbumImagePrefetchPolicy(connection?: AlbumImageConnection | null) {
  const constrained = connection?.saveData === true || constrainedConnectionTypes.has(connection?.effectiveType ?? '')

  return {
    immediate: !constrained,
    rootMargin: constrained ? '0px 0px 1200px 0px' : '0px 0px 800px 0px'
  } as const
}

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
