export type AlbumFilter = 'all' | 'published' | 'draft'

export type AdminAlbumListContext = {
  page: number
  filter: AlbumFilter
  search: string
}

type SearchParamsLike = {
  get: (name: string) => string | null
}

export function parseAdminAlbumListContext(searchParams: SearchParamsLike): AdminAlbumListContext {
  const rawPage = searchParams.get('page')
  const parsedPage = rawPage ? Number(rawPage) : NaN
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const status = searchParams.get('status')
  const filter: AlbumFilter = status === 'published' || status === 'draft' ? status : 'all'

  return {
    page,
    filter,
    search: searchParams.get('search') ?? ''
  }
}

export function serializeAdminAlbumListContext(context: AdminAlbumListContext): string {
  const searchParams = new URLSearchParams()

  if (context.page > 1) {
    searchParams.set('page', String(context.page))
  }

  if (context.filter !== 'all') {
    searchParams.set('status', context.filter)
  }

  const search = context.search.trim()
  if (search) {
    searchParams.set('search', search)
  }

  return searchParams.toString()
}

export function getAdminAlbumListHref(context: AdminAlbumListContext): string {
  const query = serializeAdminAlbumListContext(context)
  return `/admin/albums${query ? `?${query}` : ''}`
}

export function getAdminAlbumDetailHref(slug: string, context: AdminAlbumListContext): string {
  const query = serializeAdminAlbumListContext(context)
  return `/admin/albums/${slug}${query ? `?${query}` : ''}`
}
