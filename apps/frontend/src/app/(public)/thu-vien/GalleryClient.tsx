'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Eye } from 'lucide-react'
import Masonry from 'react-masonry-css'
import { listAlbums, type Album, type PaginatedResponse } from '@/lib/api'
import DividerWithText from '../../components/common/DividerWithText'
import NavigationLinks from '../../components/common/NavigationLinks'

interface GalleryClientProps {
  initialAlbums: Album[]
  initialPagination: PaginatedResponse<Album>['pagination']
  categorySlug?: string
  title?: string
  description?: string
}

export default function GalleryClient({
  initialAlbums,
  initialPagination,
  categorySlug,
  title = 'Thư Viện Ảnh',
  description = 'Thư viện ảnh với hơn 1000 concept được cập nhật liên tục và “Ready to Shoot”.'
}: GalleryClientProps) {
  const [albums, setAlbums] = useState(initialAlbums)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(initialPagination.hasMore)
  const [cursor, setCursor] = useState<string | null>(initialPagination.nextCursor)
  const [error, setError] = useState<string | null>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const requestInFlightRef = useRef(false)

  const loadMore = useCallback(async () => {
    if (requestInFlightRef.current || !hasMore || !cursor) return

    requestInFlightRef.current = true
    setLoadingMore(true)
    setError(null)

    try {
      const response = await listAlbums({
        status: 'published',
        category: categorySlug,
        limit: initialPagination.limit,
        cursor,
        sortBy: 'newest'
      })
      setAlbums(current => {
        const ids = new Set(current.map(album => album.id))
        return [...current, ...response.data.filter(album => !ids.has(album.id))]
      })
      setHasMore(response.pagination.hasMore)
      setCursor(response.pagination.nextCursor)
    } catch (loadError) {
      console.error('Failed to load more albums:', loadError)
      setError('Không thể tải thêm album. Vui lòng thử lại.')
    } finally {
      setLoadingMore(false)
      requestInFlightRef.current = false
    }
  }, [categorySlug, cursor, hasMore, initialPagination.limit])

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target) return

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) void loadMore()
      },
      { threshold: 0.1 }
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [loadMore])

  return (
    <div className="px-4 md:px-8 lg:px-16">
      <div className="mx-auto max-w-[120rem]">
        <div className="space-y-6 py-10 sm:py-14">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl md:text-5xl">{title}</h1>
            <div className="mt-6 flex justify-center">
              <NavigationLinks
                links={[
                  { label: 'Khám Phá', href: '/thu-vien' },
                  { label: 'Liên Hệ', href: '/lien-he' },
                  { label: 'Đặt Lịch', href: '/lien-he#ho-tro-nhanh' }
                ]}
                linkClassName="font-medium text-neutral-600 transition-colors hover:text-neutral-900"
                separatorClassName="text-neutral-300"
              />
            </div>
            <p className="mx-auto mt-6 max-w-2xl text-sm leading-relaxed text-neutral-600 md:text-base">
              {description}
            </p>
            <DividerWithText
              text="NGUYEN DINH THINH STUDIO"
              textClassName="text-neutral-400 text-xs sm:text-sm"
              className="mt-4"
            />
          </div>
        </div>

        {albums.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-neutral-500">Chưa có album nào trong danh mục này</p>
          </div>
        ) : (
          <>
            <Masonry
              breakpointCols={{ default: 4, 1280: 3, 1024: 3, 768: 2, 640: 1 }}
              className="flex w-auto sm:-ml-6 lg:-ml-8"
              columnClassName="pl-0 sm:pl-6 lg:pl-8 bg-clip-padding"
            >
              {albums.map(album => (
                <AlbumCard key={album.id} album={album} />
              ))}
            </Masonry>
            <div ref={loadMoreRef} className="flex h-20 items-center justify-center">
              {loadingMore ? <p className="text-sm text-neutral-500">Đang tải thêm...</p> : null}
              {error ? <p className="text-sm text-red-500">{error}</p> : null}
              {!loadingMore && !hasMore ? <p className="text-sm text-neutral-400">Đã hiển thị tất cả albums</p> : null}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function AlbumCard({ album }: { album: Album }) {
  return (
    <Link href={`/thu-vien/${album.slug}`} className="group mb-8 block">
      <div className="relative overflow-hidden rounded-lg bg-neutral-100">
        {album.coverImage ? (
          <img
            src={album.coverImage.largeUrl}
            alt={album.title}
            className="h-auto w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center">
            <Eye size={48} className="text-neutral-300" />
          </div>
        )}
      </div>
      <h2 className="mt-3 line-clamp-2 text-left text-sm font-bold text-neutral-900 transition-colors group-hover:text-neutral-600 md:text-base">
        {album.title}
      </h2>
    </Link>
  )
}
