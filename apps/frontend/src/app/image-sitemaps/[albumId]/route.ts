import { buildAlbumImageSitemap, imageSitemapResponse, isImageSitemapNotFoundError } from '@/lib/server/image-sitemap'

export const revalidate = 60

type ImageSitemapRouteContext = {
  params: Promise<{ albumId: string }>
}

export async function GET(_request: Request, context: ImageSitemapRouteContext): Promise<Response> {
  const { albumId } = await context.params

  try {
    return imageSitemapResponse(await buildAlbumImageSitemap(albumId))
  } catch (error) {
    if (isImageSitemapNotFoundError(error)) {
      return new Response('Not Found', { status: 404 })
    }
    throw error
  }
}
