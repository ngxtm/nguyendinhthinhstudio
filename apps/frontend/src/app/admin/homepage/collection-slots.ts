import type { HomepageCollectionAlbum, HomepageCollectionConfiguration } from '@/lib/api/homepage-collection'

export type CollectionSlots = [
  HomepageCollectionAlbum | null,
  HomepageCollectionAlbum | null,
  HomepageCollectionAlbum | null
]

export function getCollectionSlots(configuration: HomepageCollectionConfiguration): CollectionSlots {
  const byId = new Map(configuration.albums.map(album => [album.id, album]))
  return [0, 1, 2].map(index => byId.get(configuration.albumIds[index]) ?? null) as CollectionSlots
}

export function isCompleteCollection(slots: CollectionSlots): boolean {
  const ids = slots.flatMap(album => (album ? [album.id] : []))
  return ids.length === 3 && new Set(ids).size === 3
}

export function moveCollectionSlot(slots: CollectionSlots, from: number, to: number): CollectionSlots {
  if (from < 0 || from > 2 || to < 0 || to > 2) return slots
  const next: CollectionSlots = [...slots]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}
