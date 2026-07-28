import { cache } from 'react'
import { getCategoryNavigation } from '@/lib/api/categories'

export const getPublicCategoryNavigation = cache(async () => {
  try {
    return await getCategoryNavigation()
  } catch (error) {
    console.error('Failed to load public category navigation:', error)
    return []
  }
})

export const getPublicCategorySlugs = cache(async () => {
  const roots = await getPublicCategoryNavigation()
  const slugs = new Set<string>()
  const pending = [...roots]

  while (pending.length) {
    const category = pending.pop()
    if (!category) continue
    slugs.add(category.slug)
    if (category.children) pending.push(...category.children)
  }

  return slugs
})
