/**
 * Albums List Page
 * Hiển thị danh sách albums với actions
 */

'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import ConfirmDialog from '../components/ConfirmDialog'
import Link from 'next/link'
import { Plus, Edit, Trash2, Eye, Star, Search } from 'lucide-react'
import { toast } from 'sonner'
import { listAlbums, deleteAlbum, toggleFeatured, type Album, type PaginatedResponse } from '@/lib/api'
import { formatFullCount } from '@/lib/format'
import { useAbortableEffect, useDebouncedValue } from '../hooks'
import {
  getAdminAlbumDetailHref,
  getAdminAlbumListHref,
  parseAdminAlbumListContext,
  type AdminAlbumListContext,
  type AlbumFilter
} from './list-context'

export default function AlbumsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialContext = parseAdminAlbumListContext(searchParams)
  const [albums, setAlbums] = useState<Album[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<AlbumFilter>(initialContext.filter)
  const [searchTerm, setSearchTerm] = useState(initialContext.search)
  const [page, setPage] = useState(initialContext.page)
  const [pagination, setPagination] = useState<PaginatedResponse<Album>['pagination']>({
    hasMore: false,
    nextCursor: null,
    limit: 24,
    page: 1,
    total: 0,
    totalPages: 0
  })

  const debouncedSearch = useDebouncedValue(searchTerm, 300)
  const trimmedSearch = debouncedSearch.trim()

  useAbortableEffect(
    signal => {
      async function loadAlbums() {
        try {
          setLoading(true)
          const response = await listAlbums(
            {
              status: filter === 'all' ? undefined : filter,
              limit: 24,
              page: page,
              search: trimmedSearch ? trimmedSearch : undefined
            },
            { signal, admin: true }
          )

          if (!signal.aborted) {
            setAlbums(response.data)
            setPagination(response.pagination)
          }
        } catch (error: any) {
          if (signal.aborted) {
            return
          }

          const isAbortError =
            error?.name === 'AbortError' || (error instanceof DOMException && error.name === 'AbortError')
          if (isAbortError) {
            return
          }

          console.error('Failed to load albums:', error)
          toast.error('Không thể tải danh sách bộ ảnh')
        } finally {
          if (!signal.aborted) {
            setLoading(false)
          }
        }
      }

      loadAlbums()
    },
    [filter, trimmedSearch, page]
  )

  const isSearching = trimmedSearch.length > 0
  const [deleteCandidate, setDeleteCandidate] = useState<Album | null>(null)
  const [isDeletePending, setIsDeletePending] = useState(false)

  const updateListContext = (context: AdminAlbumListContext) => {
    router.replace(getAdminAlbumListHref(context), { scroll: false })
  }

  const handleFilterChange = (nextFilter: AlbumFilter) => {
    setFilter(nextFilter)
    setPage(1)
    updateListContext({ page: 1, filter: nextFilter, search: searchTerm })
  }

  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    setPage(1)
    updateListContext({ page: 1, filter, search: value })
  }

  const handlePageChange = (nextPage: number) => {
    setPage(nextPage)
    updateListContext({ page: nextPage, filter, search: searchTerm })
  }

  const requestDelete = (album: Album) => {
    if (!isDeletePending) setDeleteCandidate(album)
  }

  const handleConfirmDelete = async (): Promise<void> => {
    if (!deleteCandidate || isDeletePending) return

    setIsDeletePending(true)
    try {
      await deleteAlbum(deleteCandidate.id)
      setAlbums(previous => previous.filter(album => album.id !== deleteCandidate.id))
      toast.success('Đã xóa bộ ảnh!')
      setDeleteCandidate(null)
    } catch (error) {
      console.error('Failed to delete album:', error)
      toast.error('Không thể xóa bộ ảnh')
    } finally {
      setIsDeletePending(false)
    }
  }

  const handleToggleFeatured = async (album: Album) => {
    try {
      const updated = await toggleFeatured(album.id)
      setAlbums(previous => previous.map(item => (item.id === album.id ? updated : item)))
    } catch (error) {
      console.error('Failed to toggle featured:', error)
      toast.error('Không thể cập nhật trạng thái nổi bật')
    }
  }

  return (
    <div>
      <AlbumsHeader />
      <AlbumsToolbar
        filter={filter}
        onFilterChange={handleFilterChange}
        search={searchTerm}
        onSearchChange={handleSearchChange}
      />
      <AlbumsContent
        albums={albums}
        loading={loading}
        onToggleFeatured={handleToggleFeatured}
        onDelete={requestDelete}
        isSearching={isSearching}
        pagination={pagination}
        onPageChange={handlePageChange}
        listContext={{ page, filter, search: searchTerm }}
      />
      <ConfirmDialog
        open={deleteCandidate !== null}
        title="Xóa bộ ảnh?"
        description={
          <>
            Xóa bộ ảnh <strong>&quot;{deleteCandidate?.title}&quot;</strong>? Hành động này không thể hoàn tác.
          </>
        }
        confirmLabel="Xóa bộ ảnh"
        isPending={isDeletePending}
        onClose={() => setDeleteCandidate(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

function AlbumsHeader() {
  return (
    <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Bộ ảnh</h1>
        <p className="text-gray-600">Quản lý danh sách bộ ảnh và trạng thái hiển thị</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/homepage"
          className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Chọn cho trang chủ
        </Link>
        <Link
          href="/admin/albums/new"
          className="flex items-center gap-2 self-start rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Plus size={18} />
          Tạo bộ ảnh mới
        </Link>
      </div>
    </div>
  )
}

function AlbumsToolbar({
  filter,
  onFilterChange,
  search,
  onSearchChange
}: {
  filter: AlbumFilter
  onFilterChange: (filter: AlbumFilter) => void
  search: string
  onSearchChange: (value: string) => void
}) {
  const filters = useMemo(
    () => [
      { label: 'Tất cả', value: 'all' as AlbumFilter },
      { label: 'Đã xuất bản', value: 'published' as AlbumFilter },
      { label: 'Nháp', value: 'draft' as AlbumFilter }
    ],
    []
  )

  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-wrap gap-2">
        {filters.map(item => (
          <FilterPill
            key={item.value}
            label={item.label}
            active={filter === item.value}
            onClick={() => onFilterChange(item.value)}
          />
        ))}
      </div>
      <div className="relative w-full md:w-72">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={search}
          onChange={event => onSearchChange(event.target.value)}
          placeholder="Tìm kiếm bộ ảnh..."
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pr-3 pl-9 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
        />
      </div>
    </div>
  )
}

function AlbumsContent({
  albums,
  loading,
  onToggleFeatured,
  onDelete,
  isSearching,
  pagination,
  onPageChange,
  listContext
}: {
  albums: Album[]
  loading: boolean
  onToggleFeatured: (album: Album) => void
  onDelete: (album: Album) => void
  isSearching: boolean
  pagination: PaginatedResponse<Album>['pagination']
  onPageChange: (page: number) => void
  listContext: AdminAlbumListContext
}) {
  if (loading) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500">Đang tải danh sách bộ ảnh...</p>
      </div>
    )
  }

  if (albums.length === 0) {
    return <EmptyState isSearching={isSearching} />
  }

  return (
    <div className="rounded-lg bg-white shadow">
      <div className="overflow-x-auto">
        <AlbumsTable
          albums={albums}
          onToggleFeatured={onToggleFeatured}
          onDelete={onDelete}
          listContext={listContext}
        />
      </div>
      <AlbumsPagination pagination={pagination} onPageChange={onPageChange} />
    </div>
  )
}

function AlbumsPagination({
  pagination,
  onPageChange
}: {
  pagination: PaginatedResponse<Album>['pagination']
  onPageChange: (page: number) => void
}) {
  const currentPage = pagination.page ?? 1
  const totalPages = pagination.totalPages ?? 0
  const total = pagination.total ?? 0
  const start = total === 0 ? 0 : (currentPage - 1) * pagination.limit + 1
  const end = Math.min(currentPage * pagination.limit, total)

  if (totalPages <= 1) {
    return total > 0 ? (
      <div className="border-t border-gray-200 px-6 py-4 text-sm text-gray-500">
        Đang xem {start}–{end} trên {total}
      </div>
    ) : null
  }

  return (
    <div className="flex flex-col gap-3 border-t border-gray-200 px-6 py-4 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
      <span>
        Đang xem {start}–{end} trên {total}
      </span>
      <div className="flex items-center gap-1">
        <PaginationButton disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)}>
          Trước
        </PaginationButton>
        {Array.from({ length: totalPages }, (_, index) => index + 1).map(value => (
          <PaginationButton key={value} active={value === currentPage} onClick={() => onPageChange(value)}>
            {value}
          </PaginationButton>
        ))}
        <PaginationButton disabled={currentPage === totalPages} onClick={() => onPageChange(currentPage + 1)}>
          Sau
        </PaginationButton>
      </div>
    </div>
  )
}

function PaginationButton({
  children,
  active = false,
  disabled = false,
  onClick
}: {
  children: ReactNode
  active?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-9 items-center justify-center rounded-md px-3 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'bg-blue-600 font-medium text-white' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  )
}

function AlbumsTable({
  albums,
  onToggleFeatured,
  onDelete,
  listContext
}: {
  albums: Album[]
  onToggleFeatured: (album: Album) => void
  onDelete: (album: Album) => void
  listContext: AdminAlbumListContext
}) {
  return (
    <table className="w-full min-w-[840px]">
      <thead className="border-b border-gray-200 bg-gray-50">
        <tr>
          <TableHeader>Bộ ảnh</TableHeader>
          <TableHeader>Danh mục</TableHeader>
          <TableHeader>Trạng thái</TableHeader>
          <TableHeader>Hình ảnh</TableHeader>
          <TableHeader>Lượt xem</TableHeader>
          <TableHeader align="right">Thao tác</TableHeader>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200">
        {albums.map(album => (
          <AlbumRow
            key={album.id}
            album={album}
            onToggleFeatured={onToggleFeatured}
            onDelete={onDelete}
            listContext={listContext}
          />
        ))}
      </tbody>
    </table>
  )
}

function AlbumRow({
  album,
  onToggleFeatured,
  onDelete,
  listContext
}: {
  album: Album
  onToggleFeatured: (album: Album) => void
  onDelete: (album: Album) => void
  listContext: AdminAlbumListContext
}) {
  const manualCategories = album.categories?.filter(cat => cat.source === 'manual') ?? []

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          {album.coverImage ? (
            <img src={album.coverImage.thumbnailUrl} alt={album.title} className="h-12 w-12 rounded object-cover" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded bg-gray-200">
              <Eye size={20} className="text-gray-400" />
            </div>
          )}
          <div>
            <p className="font-medium text-gray-900">{album.title}</p>
            <p className="text-sm text-gray-500">/{album.slug}</p>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <span className="text-sm text-gray-600">
          {manualCategories.length > 0 ? manualCategories.map(cat => cat.name).join(', ') : '-'}
        </span>
      </td>
      <td className="px-6 py-4">
        <StatusBadge status={album.status} />
      </td>
      <td className="px-6 py-4">
        <span className="text-sm text-gray-900">{album.imageCount}</span>
      </td>
      <td className="px-6 py-4">
        <span className="text-sm text-gray-900">{formatFullCount(album.viewCount)}</span>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => onToggleFeatured(album)}
            className={`inline-flex items-center justify-center rounded p-2 transition-colors hover:bg-gray-100 ${
              album.isFeatured ? 'text-yellow-500' : 'text-gray-400'
            }`}
            title={album.isFeatured ? 'Đang nổi bật' : 'Chưa nổi bật'}
          >
            <Star size={18} fill={album.isFeatured ? 'currentColor' : 'none'} />
          </button>
          <Link
            href={getAdminAlbumDetailHref(album.slug, listContext)}
            className="inline-flex items-center justify-center rounded p-2 text-blue-600 transition-colors hover:bg-gray-100"
          >
            <Edit size={18} />
          </Link>
          <button
            onClick={() => onDelete(album)}
            className="inline-flex items-center justify-center rounded p-2 text-red-600 transition-colors hover:bg-gray-100"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </td>
    </tr>
  )
}

function EmptyState({ isSearching }: { isSearching: boolean }) {
  return (
    <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white py-12 text-center">
      <p className="mb-4 text-gray-500">
        {isSearching ? 'Không tìm thấy bộ ảnh nào khớp với từ khóa.' : 'Chưa có bộ ảnh nào.'}
      </p>
      {!isSearching && (
        <Link
          href="/admin/albums/new"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
        >
          <Plus size={16} />
          Tạo bộ ảnh đầu tiên
        </Link>
      )}
    </div>
  )
}

function TableHeader({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) {
  const alignment = align === 'right' ? 'text-right' : 'text-left'
  return (
    <th className={`px-6 py-3 text-xs font-medium tracking-wide text-gray-500 uppercase ${alignment}`}>{children}</th>
  )
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'bg-blue-600 text-white shadow-sm'
          : 'border border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:text-blue-600'
      }`}
    >
      {label}
    </button>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors = {
    published: 'bg-green-100 text-green-800',
    draft: 'bg-gray-100 text-gray-800',
    scheduled: 'bg-blue-100 text-blue-800'
  } as const
  const labels = {
    published: 'Đã xuất bản',
    draft: 'Nháp',
    scheduled: 'Đã lên lịch'
  } as const

  const colorClass = colors[status as keyof typeof colors] ?? colors.draft
  const label = labels[status as keyof typeof labels] ?? 'Không xác định'

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  )
}
