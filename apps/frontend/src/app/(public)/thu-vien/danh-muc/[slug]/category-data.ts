import { cache } from 'react'
import { getPublicCategoryBySlug, listAlbums } from '@/lib/api'

export const getCategoryLandingData = cache(async (slug: string) => {
  const categoryPromise = getPublicCategoryBySlug(slug)
  const albumsPromise = listAlbums({
    status: 'published',
    category: slug,
    limit: 8,
    sortBy: 'gallery'
  })
  const [category, albums] = await Promise.all([categoryPromise, albumsPromise])
  return { category, albums }
})
