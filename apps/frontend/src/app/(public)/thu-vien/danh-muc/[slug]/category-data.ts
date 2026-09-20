import { cache } from 'react'
import { getPublicCategoryBySlug, listAlbums } from '@/lib/api'

export const getCategoryLandingData = cache(async (slug: string, page = 1) => {
  const categoryPromise = getPublicCategoryBySlug(slug)
  const albumsPromise = listAlbums({
    status: 'published',
    category: slug,
    limit: 8,
    sortBy: 'gallery',
    page
  })
  const [category, albums] = await Promise.all([categoryPromise, albumsPromise])
  return { category, albums }
})
