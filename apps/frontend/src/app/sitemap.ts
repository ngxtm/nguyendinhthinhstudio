import type { MetadataRoute } from 'next'
import { loadPublicSitemap } from '@/lib/server/public-sitemap'

export const revalidate = 60

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return loadPublicSitemap()
}
