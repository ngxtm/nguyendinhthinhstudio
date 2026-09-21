import { buildImageSitemapIndex, imageSitemapResponse } from '@/lib/server/image-sitemap'

export const revalidate = 60

export async function GET(): Promise<Response> {
  try {
    return imageSitemapResponse(await buildImageSitemapIndex())
  } catch (error) {
    console.error('Failed to load image sitemap index during build/render:', error)
    return imageSitemapResponse(
      '<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>'
    )
  }
}

