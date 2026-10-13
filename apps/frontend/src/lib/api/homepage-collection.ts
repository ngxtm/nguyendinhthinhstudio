import { adminApiClient, publicApiClient } from './client'
import type { Image } from './albums'

export interface HomepageCollectionAlbum {
  id: string
  title: string
  slug: string
  description: string | null
  coverImage: Image
  categories: { name: string }[]
}

export interface HomepageCollectionConfiguration {
  configured: boolean
  albumIds: string[]
  albums: HomepageCollectionAlbum[]
}

export interface HomepageCollectionSearchResult {
  albums: HomepageCollectionAlbum[]
  pagination: { page: number; hasMore: boolean }
}

export function getHomepageCollection(): Promise<{ albums: HomepageCollectionAlbum[] }> {
  return publicApiClient('/homepage-collection', { next: { revalidate: 60 } })
}

export function getHomepageCollectionConfiguration(signal?: AbortSignal): Promise<HomepageCollectionConfiguration> {
  return adminApiClient('/homepage-collection/admin', { signal, cache: 'no-store' })
}

export function searchHomepageCollectionAlbums(
  search: string,
  page: number,
  signal?: AbortSignal
): Promise<HomepageCollectionSearchResult> {
  const params = new URLSearchParams({ search, page: String(page) })
  return adminApiClient(`/homepage-collection/options?${params}`, { signal, cache: 'no-store' })
}

export function saveHomepageCollection(albumIds: string[]): Promise<HomepageCollectionConfiguration> {
  return adminApiClient('/homepage-collection/admin', {
    method: 'PATCH',
    body: JSON.stringify({ albumIds })
  })
}
