/**
 * Public Gallery Page
 * Hiển thị tất cả albums với infinite scroll
 */

'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { Eye } from 'lucide-react'
import Masonry from 'react-masonry-css'
import { listAlbums, type Album } from '@/lib/api'
import DividerWithText from '../../components/common/DividerWithText'
import NavigationLinks from '../../components/common/NavigationLinks'

export default function GalleryPage() {
  const [albums, setAlbums] = useState<Album[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [cursor, setCursor] = useState<string | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const requestInFlightRef = useRef(false)

  const loadAlbums = useCallback(async (initial: boolean) => {
    if (requestInFlightRef.current) {
      return
    }

    requestInFlightRef.current = true

    try {
      if (initial) {
        setLoading(true)
      } else {
        setLoadingMore(true)
      }

      const response = await listAlbums({
        status: 'published',
        limit: 20,
        cursor: initial ? undefined : cursor || undefined,
        sortBy: 'newest'
      })

      if (initial) {
        setAlbums(response.data)
      } else {
        setAlbums(prev => [...prev, ...response.data])
      }

      setHasMore(response.pagination.hasMore)
      setCursor(response.pagination.nextCursor)
    } catch (error) {
      console.error('Failed to load albums:', error)
    } finally {
      setLoading(false)
      setLoadingMore(false)
      requestInFlightRef.current = false
    }
  }, [cursor])

  useEffect(() => {
    loadAlbums(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Setup Intersection Observer cho infinite scroll
    observerRef.current = new IntersectionObserver(
      entries => {
        if (
          entries[0].isIntersecting &&
          hasMore &&
          !loadingMore &&
          !loading &&
          !requestInFlightRef.current
        ) {
          loadAlbums(false)
        }
      },
      { threshold: 0.1 }
    )

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current)
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [hasMore, loadingMore, loading, loadAlbums])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-neutral-500">Đang tải...</p>
      </div>
    )
  }

  return (
    <div className="px-4 md:px-8 lg:px-16">
      <div className="max-w-[120rem] mx-auto">
          {/* Hero Section */}
          <div className="space-y-6 py-10 sm:py-14">
            <div className="text-center">
              <h1 className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl md:text-5xl">
                Thư Viện Ảnh
              </h1>

              {/* Navigation Links */}
              <div className="mt-6 flex justify-center">
                <NavigationLinks
                  links={[
                    { label: 'Khám Phá', href: '/thu-vien' },
                    { label: 'Liên Hệ', href: '/lien-he' },
                    { label: 'Đặt Lịch', href: '/lien-he#ho-tro-nhanh' }
                  ]}
                  linkClassName="text-neutral-600 hover:text-neutral-900 font-medium transition-colors"
                  separatorClassName="text-neutral-300"
                />
              </div>

              <p className="mx-auto mt-6 max-w-2xl text-sm leading-relaxed text-neutral-600 md:text-base">
                Thư viện ảnh với hơn 1000 concept được cập nhật liên tục và “Ready to Shoot”.
              </p>
              <DividerWithText
                text="NGUYEN DINH THINH STUDIO"
                textClassName="text-neutral-400 text-xs sm:text-sm"
                className="mt-4"
              />
            </div>
          </div>

          {/* Albums Grid */}
          {albums.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-neutral-500">Chưa có album nào</p>
            </div>
          ) : (
            <>
              <Masonry
                breakpointCols={{
                  default: 4,
                  1280: 3,
                  1024: 3,
                  768: 2,
                  640: 1
                }}
                className="flex w-auto sm:-ml-6 lg:-ml-8"
                columnClassName="pl-0 sm:pl-6 lg:pl-8 bg-clip-padding"
              >
                {albums.map(album => (
                  <AlbumCard key={album.id} album={album} />
                ))}
              </Masonry>

              {/* Load More Trigger */}
              <div ref={loadMoreRef} className="flex h-20 items-center justify-center">
                {loadingMore && <p className="text-sm text-neutral-500">Đang tải thêm...</p>}
                {!hasMore && albums.length > 0 && <p className="text-sm text-neutral-400">Đã hiển thị tất cả albums</p>}
              </div>
            </>
          )}
      </div>
    </div>
  )
}

function AlbumCard({ album }: { album: Album }) {
  return (
    <Link href={`/thu-vien/${album.slug}`} className="group block mb-8">
      {/* Cover Image */}
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

      {/* Title */}
      <h3 className="mt-3 text-left text-sm font-bold text-neutral-900 transition-colors line-clamp-2 group-hover:text-neutral-600 md:text-base">
        {album.title}
      </h3>
    </Link>
  )
}
