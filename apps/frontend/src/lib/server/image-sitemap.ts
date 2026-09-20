import { getAlbum, type Album, type Image } from '@/lib/api/albums'
import { getAlbumImages } from '@/lib/api/images'
import { loadPublishedAlbumCatalog } from '@/lib/server/public-sitemap'
import { SITE_URL } from '@/lib/seo'

export const MAX_IMAGES_PER_ALBUM = 1_000
export const MAX_INDEX_ENTRIES = 50_000
export const MAX_XML_BYTES = 50 * 1024 * 1024

const ALBUM_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const IMAGE_SITEMAP_XMLNS = 'http://www.sitemaps.org/schemas/sitemap/0.9'
const IMAGE_SITEMAP_IMAGE_XMLNS = 'http://www.google.com/schemas/sitemap-image/1.1'

export type ImageSitemapLimits = {
  maxImagesPerAlbum: number
  maxIndexEntries: number
  maxXmlBytes: number
}

export type ImageSitemapDependencies = {
  loadPublishedAlbumCatalog?: () => Promise<Album[]>
  getAlbum?: (slug: string) => Promise<Album>
  getAlbumImages?: (albumId: string) => Promise<Image[]>
  limits?: Partial<ImageSitemapLimits>
}

export class ImageSitemapError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'ImageSitemapError'
  }
}

export class ImageSitemapNotFoundError extends ImageSitemapError {
  constructor() {
    super('IMAGE_SITEMAP_ALBUM_NOT_FOUND')
    this.name = 'ImageSitemapNotFoundError'
  }
}

export class ImageSitemapInvalidIdentifierError extends ImageSitemapError {
  constructor() {
    super('IMAGE_SITEMAP_INVALID_ALBUM_ID')
    this.name = 'ImageSitemapInvalidIdentifierError'
  }
}

function resolveLimits(dependencies: ImageSitemapDependencies): ImageSitemapLimits {
  const limits: ImageSitemapLimits = {
    maxImagesPerAlbum: dependencies.limits?.maxImagesPerAlbum ?? MAX_IMAGES_PER_ALBUM,
    maxIndexEntries: dependencies.limits?.maxIndexEntries ?? MAX_INDEX_ENTRIES,
    maxXmlBytes: dependencies.limits?.maxXmlBytes ?? MAX_XML_BYTES
  }

  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new ImageSitemapError(`IMAGE_SITEMAP_INVALID_LIMIT_${name.toUpperCase()}`)
    }
  }

  return limits
}

function resolveDependencies(dependencies: ImageSitemapDependencies) {
  return {
    loadPublishedAlbumCatalog: dependencies.loadPublishedAlbumCatalog ?? (() => loadPublishedAlbumCatalog()),
    getAlbum: dependencies.getAlbum ?? getAlbum,
    getAlbumImages: dependencies.getAlbumImages ?? getAlbumImages
  }
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function assertXmlSize(xml: string, maxXmlBytes: number): string {
  const bytes = utf8ByteLength(xml)
  if (bytes > maxXmlBytes) {
    throw new ImageSitemapError('IMAGE_SITEMAP_XML_SIZE_LIMIT')
  }
  return xml
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function absoluteAlbumUrl(slug: string): string {
  return new URL(`/thu-vien/${encodeURIComponent(slug)}`, SITE_URL).toString()
}

function absoluteImageSitemapUrl(albumId: string): string {
  return new URL(`/image-sitemaps/${encodeURIComponent(albumId)}`, SITE_URL).toString()
}

function xmlDocument(root: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>${root}${body}`
}

function hasHttpStatus(error: unknown, status: number): boolean {
  return Boolean(
    error && typeof error === 'object' && 'status' in error && (error as { status?: unknown }).status === status
  )
}

function isNonPublicAlbum(album: Album, expectedId: string): boolean {
  const record = album as Album & { deleteStatus?: string }
  return (
    album.id !== expectedId ||
    album.status !== 'published' ||
    (record.deleteStatus !== undefined && record.deleteStatus !== 'active')
  )
}

function isPublicImage(image: Image): boolean {
  const record = image as Image & {
    status?: string
    uploadStatus?: string
    deleteStatus?: string
    deletedAt?: string | null
  }

  if (record.uploadStatus !== undefined && record.uploadStatus !== 'completed') return false
  if (record.status !== undefined && ['draft', 'deleted', 'processing'].includes(record.status)) return false
  if (record.deleteStatus !== undefined && record.deleteStatus !== 'active') return false
  if (record.deletedAt !== undefined && record.deletedAt !== null) return false
  return true
}

function publicImageUrl(image: Image): string {
  const value = image.largeUrl
  if (typeof value !== 'string' || !value.trim()) {
    throw new ImageSitemapError('IMAGE_SITEMAP_IMAGE_URL_MISSING')
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ImageSitemapError('IMAGE_SITEMAP_IMAGE_URL_INVALID')
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new ImageSitemapError('IMAGE_SITEMAP_IMAGE_URL_INVALID')
  }

  return url.toString()
}

function getUniquePublicImageUrls(images: Image[], maxImagesPerAlbum: number): string[] {
  const seen = new Set<string>()
  const urls: string[] = []
  let publicImageCount = 0

  for (const image of images) {
    if (!isPublicImage(image)) continue
    publicImageCount += 1
    if (publicImageCount > maxImagesPerAlbum) {
      throw new ImageSitemapError('IMAGE_SITEMAP_ALBUM_IMAGE_LIMIT')
    }
    const url = publicImageUrl(image)
    if (seen.has(url)) continue
    seen.add(url)
    urls.push(url)
  }

  return urls
}

function serializeImageUrlset(album: Album, imageUrls: string[]): string {
  const imageEntries = imageUrls
    .map(url => `<image:image><image:loc>${escapeXml(url)}</image:loc></image:image>`)
    .join('')
  const body = imageUrls.length ? `<url><loc>${escapeXml(absoluteAlbumUrl(album.slug))}</loc>${imageEntries}</url>` : ''

  return xmlDocument(
    `<urlset xmlns="${IMAGE_SITEMAP_XMLNS}" xmlns:image="${IMAGE_SITEMAP_IMAGE_XMLNS}">`,
    body ? `${body}</urlset>` : '</urlset>'
  )
}

function serializeSitemapIndex(albums: Album[]): string {
  const body = albums
    .map(albumEntry => `<sitemap><loc>${escapeXml(absoluteImageSitemapUrl(albumEntry.id))}</loc></sitemap>`)
    .join('')
  return xmlDocument(`<sitemapindex xmlns="${IMAGE_SITEMAP_XMLNS}">`, `${body}</sitemapindex>`)
}

function assertCatalogAlbum(album: Album | undefined, albumId: string): Album {
  if (!album || isNonPublicAlbum(album, albumId)) {
    throw new ImageSitemapNotFoundError()
  }
  return album
}

export async function buildImageSitemapIndex(dependencies: ImageSitemapDependencies = {}): Promise<string> {
  const limits = resolveLimits(dependencies)
  const { loadPublishedAlbumCatalog: loadCatalog } = resolveDependencies(dependencies)
  const albums = await loadCatalog()

  if (albums.length > limits.maxIndexEntries) {
    throw new ImageSitemapError('IMAGE_SITEMAP_INDEX_LIMIT')
  }

  for (const albumEntry of albums) {
    if (!ALBUM_ID_PATTERN.test(albumEntry.id)) {
      throw new ImageSitemapInvalidIdentifierError()
    }
  }

  return assertXmlSize(serializeSitemapIndex(albums), limits.maxXmlBytes)
}

export async function buildAlbumImageSitemap(
  albumId: string,
  dependencies: ImageSitemapDependencies = {}
): Promise<string> {
  if (!ALBUM_ID_PATTERN.test(albumId)) {
    throw new ImageSitemapInvalidIdentifierError()
  }

  const limits = resolveLimits(dependencies)
  const resolved = resolveDependencies(dependencies)
  const catalogAlbum = assertCatalogAlbum(
    (await resolved.loadPublishedAlbumCatalog()).find(albumEntry => albumEntry.id === albumId),
    albumId
  )

  let confirmedAlbum: Album
  try {
    confirmedAlbum = await resolved.getAlbum(catalogAlbum.slug)
  } catch (error) {
    if (hasHttpStatus(error, 404)) throw new ImageSitemapNotFoundError()
    throw error
  }

  if (isNonPublicAlbum(confirmedAlbum, albumId)) {
    throw new ImageSitemapNotFoundError()
  }

  const images = await resolved.getAlbumImages(albumId)
  const imageUrls = getUniquePublicImageUrls(images, limits.maxImagesPerAlbum)
  return assertXmlSize(serializeImageUrlset(confirmedAlbum, imageUrls), limits.maxXmlBytes)
}

export function imageSitemapResponse(xml: string, status = 200): Response {
  return new Response(xml, {
    status,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8'
    }
  })
}

export function isImageSitemapNotFoundError(error: unknown): boolean {
  return error instanceof ImageSitemapNotFoundError || error instanceof ImageSitemapInvalidIdentifierError
}
