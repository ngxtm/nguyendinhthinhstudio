import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const LOOPBACK_HOST = '127.0.0.1'
const DEFAULT_PORT = 3100
const DEFAULT_ALBUM_COUNT = 17
const EXPANDED_SITEMAP_ALBUM_COUNT = 101
const DEFAULT_IMAGE_COUNT = 9
const DEFAULT_GALLERY_LIMIT = 8
const DEFAULT_IMAGE_LIMIT = 4

export type SeoFixtureErrorMode =
  | 'primary404'
  | 'primary500'
  | 'related500'
  | 'image404'
  | 'image500'
  | 'sitemapSecondPageFailure'

export interface SeoApiServerOptions {
  port?: number
  tlsKeyPath?: string
  tlsCertPath?: string
}

export interface SeoApiServer {
  host: typeof LOOPBACK_HOST
  port: number
  protocol: 'http' | 'https'
  origin: string
  close(): Promise<void>
}

type FixtureCategory = {
  id: string
  name: string
  slug: string
  description: string
  parentId: null
  albumCount: number
  showInNavigation: boolean
  navigationOrder: number
  updatedAt: string
  children?: FixtureCategory[]
}

type FixtureImage = {
  id: string
  albumId: string
  filename: string
  thumbnailUrl: string
  smallUrl: string
  mediumUrl: string
  largeUrl: string
  xlargeUrl: string
  altText: string
  orderIndex: number
  width: number
  height: number
}

type FixtureAlbum = {
  id: string
  title: string
  slug: string
  description: string
  status: 'published'
  isFeatured: false
  featuredOrder: null
  coverImage: FixtureImage
  images: FixtureImage[]
  tags: Array<{ id: string; name: string; slug: string }>
  categories: Array<{
    category: FixtureCategory
    depth: number
    source: 'manual'
  }>
  primaryCategory: FixtureCategory
  imageCount: number
  viewCount: number
  createdAt: string
  updatedAt: string
  publishedAt: string
  shootDate: string
  metaTitle: null
  metaDescription: null
}

type Pagination = {
  hasMore: boolean
  nextCursor: string | null
  limit: number
  page?: number
  total?: number
  totalPages?: number
}

const ERROR_MODES = new Set<SeoFixtureErrorMode>([
  'primary404',
  'primary500',
  'related500',
  'image404',
  'image500',
  'sitemapSecondPageFailure'
])

const WEDDING_CATEGORY: FixtureCategory = {
  id: 'fixture-category-wedding',
  name: 'Wedding',
  slug: 'wedding',
  description: 'Các album cưới fixture dùng cho kiểm tra SEO cục bộ.',
  parentId: null,
  albumCount: 8,
  showInNavigation: true,
  navigationOrder: 1,
  updatedAt: '2026-09-01T00:00:00.000Z',
  children: []
}

const OTHER_CATEGORY: FixtureCategory = {
  id: 'fixture-category-portrait',
  name: 'Portrait',
  slug: 'portrait',
  description: 'Nhãn phụ để phân biệt tập gallery chính.',
  parentId: null,
  albumCount: 9,
  showInNavigation: false,
  navigationOrder: 2,
  updatedAt: '2026-09-01T00:00:00.000Z',
  children: []
}

function padded(value: number): string {
  return String(value).padStart(2, '0')
}

function imageUrl(origin: string, imageId: string): string {
  return `${origin}/fixture-images/${encodeURIComponent(imageId)}.svg`
}

function createImage(origin: string, albumId: string, imageIndex: number): FixtureImage {
  const imageId = `${albumId}-image-${padded(imageIndex + 1)}`
  const baseUrl = imageUrl(origin, imageId)
  return {
    id: imageId,
    albumId,
    filename: `${imageId}.svg`,
    thumbnailUrl: baseUrl,
    smallUrl: baseUrl,
    mediumUrl: baseUrl,
    largeUrl: baseUrl,
    xlargeUrl: baseUrl,
    altText: `Fixture ${albumId} image ${imageIndex + 1}`,
    orderIndex: imageIndex + 1,
    width: 640,
    height: 480
  }
}

function fixtureAlbumId(index: number): string {
  if (index < 9) return `fixture-main-${padded(index + 1)}`
  if (index < DEFAULT_ALBUM_COUNT) return `fixture-wedding-${padded(index - 8)}`
  return `fixture-extra-${padded(index - DEFAULT_ALBUM_COUNT + 1)}`
}

function createCatalog(origin: string, count: number): FixtureAlbum[] {
  return Array.from({ length: count }, (_, index) => {
    const id = fixtureAlbumId(index)
    const category = index < 9 ? OTHER_CATEGORY : WEDDING_CATEGORY
    const timestamp = new Date(Date.UTC(2026, 8, 17 - index)).toISOString()
    const images = Array.from({ length: DEFAULT_IMAGE_COUNT }, (_, imageIndex) => createImage(origin, id, imageIndex))
    const categoryAssignment = {
      category,
      depth: 0,
      source: 'manual' as const
    }
    return {
      id,
      title: `Fixture ${id}`,
      slug: id,
      description: `Album fixture ${id} cho kiểm tra SEO.`,
      status: 'published' as const,
      isFeatured: false as const,
      featuredOrder: null,
      coverImage: images[0]!,
      images,
      tags: [{ id: `fixture-tag-${index + 1}`, name: 'Fixture', slug: 'fixture' }],
      categories: [categoryAssignment],
      primaryCategory: category,
      imageCount: images.length,
      viewCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      publishedAt: timestamp,
      shootDate: timestamp,
      metaTitle: null,
      metaDescription: null
    }
  })
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body))
}

function writeError(response: ServerResponse, status: number, code: string): void {
  writeJson(response, status, {
    statusCode: status,
    code,
    message: code
  })
}

function numericQueryValue(query: URLSearchParams, key: string, fallback: number, maximum: number): number | null {
  const values = query.getAll(key)
  if (values.length > 1) return null
  const raw = values[0]
  if (raw === undefined) return fallback
  if (!/^\d+$/.test(raw)) return null
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 1) return null
  return Math.min(value, maximum)
}

function hasCategory(album: FixtureAlbum, slug: string): boolean {
  return album.categories.some(assignment => assignment.category.slug === slug || assignment.category.id === slug)
}

function publicAlbum(album: FixtureAlbum): Omit<FixtureAlbum, 'images'> {
  const { images: _images, ...withoutImages } = album
  return withoutImages
}

function requestOrigin(request: IncomingMessage): string {
  const origin = request.headers.origin
  return typeof origin === 'string' && origin ? origin : '*'
}

function applyCors(request: IncomingMessage, response: ServerResponse): void {
  response.setHeader('Access-Control-Allow-Origin', requestOrigin(request))
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  response.setHeader('Vary', 'Origin')
}

function svgBody(imageId: string): string {
  const safeId = imageId.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><rect width="640" height="480" fill="#e5e7eb"/><text x="24" y="48" fill="#374151">${safeId}</text></svg>`
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  origin: string,
  errorModes: Set<SeoFixtureErrorMode>
): Promise<void> {
  applyCors(request, response)
  if (request.method === 'OPTIONS') {
    response.statusCode = 204
    response.end()
    return
  }

  const requestUrl = new URL(request.url ?? '/', origin)
  const path = decodeURIComponent(requestUrl.pathname)
  const method = request.method ?? 'GET'

  if (path === '/_fixture/control' && method === 'GET') {
    const mode = requestUrl.searchParams.get('mode')
    if (mode === 'reset') {
      errorModes.clear()
      writeJson(response, 200, { mode: 'reset', enabled: false })
      return
    }
    if (!mode || !ERROR_MODES.has(mode as SeoFixtureErrorMode)) {
      writeError(response, 400, 'unknown_fixture_error_mode')
      return
    }
    errorModes.clear()
    errorModes.add(mode as SeoFixtureErrorMode)
    writeJson(response, 200, { mode, enabled: true })
    return
  }

  if (path === '/health' && method === 'GET') {
    writeJson(response, 200, { ok: true, fixture: 'seo-api' })
    return
  }

  const expandedCatalog = errorModes.has('sitemapSecondPageFailure') && requestUrl.searchParams.get('limit') === '50'
  const catalog = createCatalog(origin, expandedCatalog ? EXPANDED_SITEMAP_ALBUM_COUNT : DEFAULT_ALBUM_COUNT)
  const albumsBySlug = new Map(catalog.map(album => [album.slug, album]))
  const albumsById = new Map(catalog.map(album => [album.id, album]))
  const imageIds = new Set(catalog.flatMap(album => album.images.map(image => image.id)))

  if (path === '/categories/navigation' && method === 'GET') {
    writeJson(response, 200, [WEDDING_CATEGORY])
    return
  }

  if (path === '/categories/indexable' && method === 'GET') {
    writeJson(response, 200, [WEDDING_CATEGORY])
    return
  }

  if (path === '/categories/slug/wedding' && method === 'GET') {
    writeJson(response, 200, WEDDING_CATEGORY)
    return
  }

  if (path === '/categories/slug/portrait' && method === 'GET') {
    writeError(response, 404, 'category_not_found')
    return
  }

  if (path === '/albums' && method === 'GET') {
    if (
      errorModes.has('sitemapSecondPageFailure') &&
      requestUrl.searchParams.get('limit') === '50' &&
      requestUrl.searchParams.has('cursor')
    ) {
      writeError(response, 500, 'fixture_sitemap_second_page_failure')
      return
    }

    const limit = numericQueryValue(requestUrl.searchParams, 'limit', DEFAULT_GALLERY_LIMIT, 50)
    if (limit === null) {
      writeError(response, 400, 'invalid_limit')
      return
    }
    const pageValues = requestUrl.searchParams.getAll('page')
    const cursorValues = requestUrl.searchParams.getAll('cursor')
    if (pageValues.length > 1 || cursorValues.length > 1 || (pageValues.length > 0 && cursorValues.length > 0)) {
      writeError(response, 400, 'invalid_pagination')
      return
    }

    let filtered = catalog
    const category = requestUrl.searchParams.get('category')
    if (category) filtered = filtered.filter(album => hasCategory(album, category))

    const pageValue = numericQueryValue(requestUrl.searchParams, 'page', 1, Number.MAX_SAFE_INTEGER)
    if (pageValue === null) {
      writeError(response, 400, 'invalid_page')
      return
    }

    let pageAlbums: FixtureAlbum[]
    let hasMore: boolean
    let nextCursor: string | null
    let page: number | undefined

    if (pageValues.length > 0) {
      page = pageValue
      const start = (page - 1) * limit
      const withLookahead = filtered.slice(start, start + limit + 1)
      hasMore = withLookahead.length > limit
      pageAlbums = withLookahead.slice(0, limit)
      nextCursor = hasMore ? (pageAlbums.at(-1)?.id ?? null) : null
    } else {
      const cursor = cursorValues[0]
      const cursorIndex = cursor ? filtered.findIndex(album => album.id === cursor) : -1
      if (cursor && cursorIndex < 0) {
        writeError(response, 400, 'invalid_cursor')
        return
      }
      const start = cursorIndex >= 0 ? cursorIndex + 1 : 0
      const withLookahead = filtered.slice(start, start + limit + 1)
      hasMore = withLookahead.length > limit
      pageAlbums = withLookahead.slice(0, limit)
      nextCursor = hasMore ? (pageAlbums.at(-1)?.id ?? null) : null
    }

    const pagination: Pagination = {
      hasMore,
      nextCursor,
      limit
    }
    if (page !== undefined) {
      pagination.page = page
      pagination.total = filtered.length
      pagination.totalPages = Math.ceil(filtered.length / limit)
    }
    writeJson(response, 200, { data: pageAlbums.map(publicAlbum), pagination })
    return
  }

  const viewMatch = path.match(/^\/albums\/([^/]+)\/view$/)
  if (viewMatch && method === 'POST') {
    if (!albumsBySlug.has(viewMatch[1]!)) {
      writeError(response, 404, 'album_not_found')
      return
    }
    writeJson(response, 200, { ok: true })
    return
  }

  const relatedMatch = path.match(/^\/albums\/([^/]+)\/related$/)
  if (relatedMatch && method === 'GET') {
    if (errorModes.has('related500')) {
      writeError(response, 500, 'fixture_related_failure')
      return
    }
    const album = albumsBySlug.get(relatedMatch[1]!)
    if (!album) {
      writeError(response, 404, 'album_not_found')
      return
    }
    writeJson(
      response,
      200,
      catalog
        .filter(candidate => candidate.id !== album.id)
        .slice(0, 8)
        .map(publicAlbum)
    )
    return
  }

  const albumMatch = path.match(/^\/albums\/([^/]+)$/)
  if (albumMatch && method === 'GET') {
    if (errorModes.has('primary404')) {
      writeError(response, 404, 'fixture_primary_failure')
      return
    }
    if (errorModes.has('primary500')) {
      writeError(response, 500, 'fixture_primary_failure')
      return
    }
    const album = albumsBySlug.get(albumMatch[1]!)
    if (!album) {
      writeError(response, 404, 'album_not_found')
      return
    }
    writeJson(response, 200, publicAlbum(album))
    return
  }

  const imageBatchMatch = path.match(/^\/images\/album\/([^/]+)\/batch$/)
  if (imageBatchMatch && method === 'GET') {
    if (errorModes.has('image404')) {
      writeError(response, 404, 'fixture_image_failure')
      return
    }
    if (errorModes.has('image500')) {
      writeError(response, 500, 'fixture_image_failure')
      return
    }
    const album = albumsById.get(imageBatchMatch[1]!)
    if (!album) {
      writeError(response, 404, 'album_not_found')
      return
    }
    const limit = numericQueryValue(requestUrl.searchParams, 'limit', DEFAULT_IMAGE_LIMIT, 50)
    if (limit === null) {
      writeError(response, 400, 'invalid_limit')
      return
    }
    const cursor = requestUrl.searchParams.get('cursor')
    const cursorIndex = cursor ? album.images.findIndex(image => image.id === cursor) : -1
    if (cursor && cursorIndex < 0) {
      writeError(response, 400, 'invalid_cursor')
      return
    }
    const start = cursorIndex >= 0 ? cursorIndex + 1 : 0
    const withLookahead = album.images.slice(start, start + limit + 1)
    const pageImages = withLookahead.slice(0, limit)
    const hasMore = withLookahead.length > limit
    writeJson(response, 200, {
      data: pageImages,
      pagination: {
        hasMore,
        nextCursor: hasMore ? (pageImages.at(-1)?.id ?? null) : null,
        limit
      }
    })
    return
  }

  const imageListMatch = path.match(/^\/images\/album\/([^/]+)$/)
  if (imageListMatch && method === 'GET') {
    const album = albumsById.get(imageListMatch[1]!)
    if (!album) {
      writeError(response, 404, 'album_not_found')
      return
    }
    writeJson(response, 200, album.images)
    return
  }

  const imageMatch = path.match(/^\/fixture-images\/([^/]+)\.svg$/)
  if (imageMatch && method === 'GET') {
    const imageId = imageMatch[1]!
    if (!imageIds.has(imageId)) {
      writeError(response, 404, 'image_not_found')
      return
    }
    response.statusCode = 200
    response.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    response.end(svgBody(imageId))
    return
  }

  writeError(response, 404, 'fixture_route_not_found')
}

function validatePort(port: number): number {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('SEO fixture port must be an integer from 0 to 65535')
  }
  return port
}

export async function startSeoApi(options: SeoApiServerOptions = {}): Promise<SeoApiServer> {
  const port = validatePort(options.port ?? DEFAULT_PORT)
  const hasKey = Boolean(options.tlsKeyPath)
  const hasCert = Boolean(options.tlsCertPath)
  if (hasKey !== hasCert) {
    throw new Error('SEO fixture TLS requires both tlsKeyPath and tlsCertPath')
  }

  const protocol = hasKey ? 'https' : 'http'
  const errorModes = new Set<SeoFixtureErrorMode>()
  let origin = ''
  const handler = (request: IncomingMessage, response: ServerResponse) => {
    void handleRequest(request, response, origin, errorModes).catch(() => {
      if (!response.headersSent) writeError(response, 500, 'fixture_internal_error')
      else response.end()
    })
  }
  const server = hasKey
    ? createHttpsServer(
        {
          key: readFileSync(options.tlsKeyPath!),
          cert: readFileSync(options.tlsCertPath!)
        },
        handler
      )
    : createHttpServer(handler)

  await new Promise<void>((resolvePromise, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolvePromise()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, LOOPBACK_HOST)
  })

  const address = server.address()
  const actualPort = typeof address === 'object' && address ? address.port : port
  origin = `${protocol}://${LOOPBACK_HOST}:${actualPort}`

  return {
    host: LOOPBACK_HOST,
    port: actualPort,
    protocol,
    origin,
    close: () =>
      new Promise<void>((resolvePromise, reject) => {
        server.close(error => (error ? reject(error) : resolvePromise()))
      })
  }
}

function cliValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}

function isCliEntry(): boolean {
  const entry = process.argv[1]
  return Boolean(entry && resolve(entry) === resolve(fileURLToPath(import.meta.url)))
}

if (isCliEntry()) {
  const args = process.argv.slice(2)
  const port = Number(cliValue(args, '--port') ?? process.env.SEO_FIXTURE_PORT ?? DEFAULT_PORT)
  const tlsKeyPath = cliValue(args, '--tls-key') ?? process.env.SEO_FIXTURE_TLS_KEY
  const tlsCertPath = cliValue(args, '--tls-cert') ?? process.env.SEO_FIXTURE_TLS_CERT
  startSeoApi({ port, tlsKeyPath, tlsCertPath })
    .then(server => {
      console.log(`SEO fixture listening at ${server.origin}`)
      const close = () => {
        void server.close().finally(() => process.exit(0))
      }
      process.once('SIGINT', close)
      process.once('SIGTERM', close)
    })
    .catch(error => {
      console.error(error instanceof Error ? error.message : error)
      process.exitCode = 1
    })
}
