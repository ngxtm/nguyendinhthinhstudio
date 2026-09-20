import { cache } from 'react'
import { ApiError, getAlbum, getAlbumImageBatch, getRelatedAlbums } from '@/lib/api'
import type { Album } from '@/lib/api/albums'
import type { AlbumImagePage } from '@/lib/api/images'

export type PublicAlbumPageLogger = {
  warn(message: string, context: { slug: string; status?: number; errorType: string }): void
}

export type PublicAlbumPageDependencies = {
  getAlbum?: (slug: string) => Promise<Album>
  getRelatedAlbums?: (slug: string) => Promise<Album[]>
  getAlbumImageBatch?: (albumId: string) => Promise<AlbumImagePage>
  logger?: PublicAlbumPageLogger
}

export type PublicAlbumPageData = {
  album: Album
  initialImagePage: AlbumImagePage
  relatedAlbums: Album[]
}

/**
 * React cache keeps metadata and page rendering on the same album snapshot for
 * the lifetime of one server request.
 */
export const getCachedPublicAlbum = cache((slug: string) => getAlbum(slug))

const defaultLogger: PublicAlbumPageLogger = {
  warn: (message, context) => console.warn(message, context)
}

const defaultDependencies: Required<PublicAlbumPageDependencies> = {
  getAlbum: getCachedPublicAlbum,
  getRelatedAlbums,
  getAlbumImageBatch,
  logger: defaultLogger
}

function safeErrorType(error: unknown): string {
  if (error instanceof ApiError) return 'ApiError'
  if (error instanceof Error) return 'Error'
  return typeof error
}

function safeRelatedAlbumsLog(slug: string, error: unknown): { slug: string; status?: number; errorType: string } {
  return {
    slug,
    ...(error instanceof ApiError ? { status: error.status } : {}),
    errorType: safeErrorType(error)
  }
}

/**
 * Loads the public album page data. The album and related request start
 * together; the first image batch starts as soon as the album id is known.
 * Only related albums are optional. Primary album and image errors propagate.
 */
export async function getPublicAlbumPage(
  slug: string,
  dependencies: PublicAlbumPageDependencies = {}
): Promise<PublicAlbumPageData> {
  const resolved = { ...defaultDependencies, ...dependencies }
  const albumPromise = resolved.getAlbum(slug)
  const relatedAlbumsPromise = resolved.getRelatedAlbums(slug).catch((error: unknown) => {
    resolved.logger.warn('Failed to load related albums', safeRelatedAlbumsLog(slug, error))
    return []
  })

  const album = await albumPromise
  const [initialImagePage, relatedAlbums] = await Promise.all([
    resolved.getAlbumImageBatch(album.id),
    relatedAlbumsPromise
  ])

  return { album, initialImagePage, relatedAlbums }
}
