'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { Eye } from 'lucide-react'
import Masonry from 'react-masonry-css'
import useSWRInfinite from 'swr/infinite'
import { type Album, type PaginatedResponse } from '@/lib/api'
import {
  fetchGalleryPage,
  getGalleryPageKey,
  mergeAlbumPages,
  publicGallerySWRConfig,
  type GalleryPage
} from '@/lib/public-gallery-swr'
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
  const fallbackData = useMemo<GalleryPage[]>(
    () => [{ data: initialAlbums, pagination: initialPagination }],
    [initialAlbums, initialPagination]
  )

  const { data, error, isLoading, isValidating, setSize, size } = useSWRInfinite<GalleryPage, Error>(
    getGalleryPageKey(categorySlug),
    fetchGalleryPage,
    { ...publicGallerySWRConfig, fallbackData }
  )

  const pages = data ?? fallbackData
  const albums = useMemo(() => mergeAlbumPages(pages), [pages])
  const animationDelays = useMemo(
    () => new Map(albums.map((album, index) => [album.id, (index % 8) * 40])),
    [albums]
  )
  const lastPage = pages[pages.length - 1] ?? fallbackData[0]
  const hasMore = lastPage.pagination.hasMore && Boolean(lastPage.pagination.nextCursor)
  const loadingMore = isLoading || (isValidating && size > 1)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const requestInFlightRef = useRef(false)

  const loadMore = useCallback(() => {
    if (requestInFlightRef.current || loadingMore || !hasMore) return

    requestInFlightRef.current = true
    void setSize(currentSize => currentSize + 1)
      .catch(loadError => {
        console.error('Failed to load more albums:', loadError)
      })
      .finally(() => {
        requestInFlightRef.current = false
      })
  }, [hasMore, loadingMore, setSize])

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target) return

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) void loadMore()
      },
      { threshold: 0.1, rootMargin: '0px 0px 800px 0px' }
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
                <AlbumCard key={album.id} album={album} animationDelay={animationDelays.get(album.id) ?? 0} />
              ))}
            </Masonry>
            <div ref={loadMoreRef} className="h-px" aria-hidden="true" />
            {error ? (
              <p className="py-4 text-center text-sm text-red-500">Không thể tải thêm album. Vui lòng thử lại.</p>
            ) : null}
          </>
        )}
      </div>
      <style jsx>{`
        .gallery-card-enter {
          animation: galleryFadeInUp 500ms ease-out both;
        }

        @keyframes galleryFadeInUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .gallery-card-enter {
            animation: none;
          }
        }
      `}</style>
    </div>
  )
}

function AlbumCard({ album, animationDelay }: { album: Album; animationDelay: number }) {
  return (
    <Link
      href={`/thu-vien/${album.slug}`}
      className="gallery-card-enter group mb-8 block"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
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
