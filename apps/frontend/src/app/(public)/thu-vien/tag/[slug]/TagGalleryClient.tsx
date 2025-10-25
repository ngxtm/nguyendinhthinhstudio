"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Masonry from 'react-masonry-css'
import { Eye } from 'lucide-react'
import DividerWithText from '../../../../components/common/DividerWithText'
import NavigationLinks from '../../../../components/common/NavigationLinks'
import { getTagAlbums, type Album, type Tag, type TagAlbumsResponse } from '../../../../lib/api'

interface Props {
  slug: string
  initialTag: Tag
  initialAlbums: Album[]
  initialPagination: TagAlbumsResponse['pagination']
}

export default function TagGalleryClient({ slug, initialTag, initialAlbums, initialPagination }: Props) {
  const [albums, setAlbums] = useState<Album[]>(initialAlbums)
  const [hasMore, setHasMore] = useState(initialPagination.hasMore)
  const [nextOffset, setNextOffset] = useState<number | null>(initialPagination.nextOffset)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const pageLimit = useMemo(() => initialPagination.limit || 20, [initialPagination.limit])
  const requestInFlightRef = useRef(false)

  const mergeAlbums = useCallback((current: Album[], incoming: Album[]) => {
    const seen = new Set(current.map(album => album.id))
    const merged = [...current]

    incoming.forEach(album => {
      if (seen.has(album.id)) {
        return
      }
      seen.add(album.id)
      merged.push(album)
    })

    return merged
  }, [])

  const loadMore = useCallback(async () => {
    if (requestInFlightRef.current || loadingMore || !hasMore || nextOffset === null) {
      return
    }

    requestInFlightRef.current = true
    setLoadingMore(true)
    setError(null)

    try {
      const response = await getTagAlbums(slug, { limit: pageLimit, offset: nextOffset })
      setAlbums(prev => mergeAlbums(prev, response.data))
      setHasMore(response.pagination.hasMore)
      setNextOffset(response.pagination.nextOffset)
    } catch (err) {
      console.error('Failed to load more tag albums:', err)
      setError('Không thể tải thêm album. Vui lòng thử lại.')
    } finally {
      setLoadingMore(false)
      requestInFlightRef.current = false
    }
  }, [loadingMore, hasMore, nextOffset, slug, pageLimit, mergeAlbums])

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && !requestInFlightRef.current) {
          loadMore()
        }
      },
      { threshold: 0.1 }
    )

    const target = loadMoreRef.current
    if (target) {
      observerRef.current.observe(target)
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [loadMore])

  return (
    <div className="max-w-[120rem] mx-auto">
      <div className="space-y-6 py-10 sm:py-14">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl md:text-5xl">
            #{initialTag.name}
          </h1>

          <div className="mt-6 flex justify-center">
            <NavigationLinks
              links={[
                { label: 'Khám Phá', href: '/thu-vien' },
                { label: 'Đặt Lịch', href: '/lien-he#ho-tro-nhanh' },
                { label: 'Liên Hệ', href: '/lien-he' },
              ]}
              linkClassName="text-neutral-600 hover:text-neutral-900 font-medium transition-colors"
              separatorClassName="text-neutral-300"
            />
          </div>

          <p className="mx-auto mt-6 max-w-2xl text-sm leading-relaxed text-neutral-600 md:text-base">
            {initialTag.description || `Các album thuộc tag ${initialTag.name} được tuyển chọn bởi Nguyen Dinh Thinh Studio.`}
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
          <p className="text-neutral-500">Chưa có album nào cho tag này</p>
        </div>
      ) : (
        <>
          <Masonry
            breakpointCols={{
              default: 4,
              1280: 3,
              1024: 3,
              768: 2,
              640: 1,
            }}
            className="flex -ml-8 w-auto"
            columnClassName="pl-8 bg-clip-padding"
          >
            {albums.map(album => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </Masonry>

          <div ref={loadMoreRef} className="flex h-20 items-center justify-center">
            {loadingMore && <p className="text-sm text-neutral-500">Đang tải thêm...</p>}
            {error && <p className="text-sm text-red-500">{error}</p>}
            {!loadingMore && !hasMore && albums.length > 0 && (
              <p className="text-sm text-neutral-400">Đã hiển thị tất cả albums cho tag này</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function AlbumCard({ album }: { album: Album }) {
  return (
    <Link href={`/thu-vien/${album.slug}`} className="group block mb-8">
      <div className="relative overflow-hidden rounded-lg bg-neutral-100">
        {album.coverImage ? (
          <img
            src={album.coverImage.largeUrl}
            alt={album.title}
            className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center">
            <Eye size={48} className="text-neutral-300" />
          </div>
        )}
      </div>

      <h3 className="mt-3 text-left text-sm font-medium text-neutral-900 transition-colors line-clamp-2 group-hover:text-neutral-600 md:text-base">
        {album.title}
      </h3>
    </Link>
  )
}
