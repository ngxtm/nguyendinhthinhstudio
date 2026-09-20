import { buildImageSitemapIndex, imageSitemapResponse } from '@/lib/server/image-sitemap'

export const revalidate = 60

export async function GET(): Promise<Response> {
  return imageSitemapResponse(await buildImageSitemapIndex())
}
