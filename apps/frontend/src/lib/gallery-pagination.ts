export type GallerySearchParamValue = string | string[] | undefined

export type GallerySearchParams = Record<string, GallerySearchParamValue>

export type ParsedGalleryPage = {
  page: number
  explicit: boolean
}

export type GalleryPaginationSummary = {
  total?: number
  totalPages?: number
}

const PAGE_PATTERN = /^[1-9]\d*$/

export function parseGalleryPageSearchParams(
  searchParams: GallerySearchParams,
): ParsedGalleryPage {
  const rawPage = searchParams.page

  if (rawPage === undefined) {
    return { page: 1, explicit: false }
  }

  if (Array.isArray(rawPage) || !PAGE_PATTERN.test(rawPage)) {
    throw new Error('Invalid gallery page')
  }

  const page = Number(rawPage)
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new Error('Invalid gallery page')
  }

  return { page, explicit: true }
}

export function buildGalleryPageHref(path: string, page: number): string {
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new Error('Invalid gallery page')
  }

  return page === 1 ? path : `${path}?page=${page}`
}

export function shouldNotFoundGalleryPage(
  page: number,
  pagination: GalleryPaginationSummary,
  _isRootGallery: boolean,
): boolean {
  if (page === 1) return false

  return typeof pagination.totalPages !== 'number' || page > pagination.totalPages
}

export function addGalleryPageToTitle(title: string, page: number): string {
  const baseTitle = title.replace(/\s+- Trang \d+$/, '')
  return page <= 1 ? baseTitle : `${baseTitle} - Trang ${page}`
}
