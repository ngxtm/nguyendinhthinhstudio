'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import Masonry from 'react-masonry-css'
import useSWRInfinite from 'swr/infinite'
import { type Album, type PaginatedResponse } from '@/lib/api'
import { getAlbumImageBatch } from '@/lib/api/images'
import {
  fetchGalleryPage,
  getGalleryPageKey,
  mergeAlbumPages,
  publicGallerySWRConfig,
  type GalleryPage
} from '@/lib/public-gallery-swr'
import { buildGalleryPageHref } from '@/lib/gallery-pagination'
import AlbumCard from './AlbumPreviewCard'
import DividerWithText from '../../components/common/DividerWithText'
import NavigationLinks from '../../components/common/NavigationLinks'

interface GalleryClientProps {
  initialAlbums: Album[]
  initialPagination: PaginatedResponse<Album>['pagination']
  initialPage?: number
  basePath?: string
  categorySlug?: string
  title?: string
  description?: string
}

export default function GalleryClient({
  initialAlbums,
  initialPagination,
  initialPage = initialPagination.page ?? 1,
  basePath = '/thu-vien',
  categorySlug,
  title = 'Thư Viện Ảnh',
  description = 'Thư viện ảnh với hơn 1000 concept được cập nhật liên tục và “Ready to Shoot”.'
}: GalleryClientProps) {
  const fallbackData = useMemo<GalleryPage[]>(
    () => [{ data: initialAlbums, pagination: initialPagination }],
    [initialAlbums, initialPagination]
  )

  const { data, error, isLoading, isValidating, setSize, size } = useSWRInfinite<GalleryPage, Error>(
    getGalleryPageKey(categorySlug, initialPage),
    fetchGalleryPage,
    { ...publicGallerySWRConfig, fallbackData }
  )

  const pages = data ?? fallbackData
  const albums = useMemo(() => mergeAlbumPages(pages), [pages])
  const animationDelays = useMemo(() => new Map(albums.map((album, index) => [album.id, (index % 8) * 40])), [albums])
  const lastPage = pages[pages.length - 1] ?? fallbackData[0]
  const hasMore = lastPage.pagination.hasMore && Boolean(lastPage.pagination.nextCursor)
  const lastPageNumber = lastPage.pagination.page ?? initialPage + pages.length - 1
  const nextPageHref = hasMore ? buildGalleryPageHref(basePath, lastPageNumber + 1) : null
  const previousPageHref = lastPageNumber > 1 ? buildGalleryPageHref(basePath, lastPageNumber - 1) : null
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
            <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-4xl md:text-5xl">{title}</h1>
            <div className="mt-6 flex justify-center">
              <NavigationLinks
                links={[
                  { label: 'Khám Phá', href: '/thu-vien' },
                  { label: 'Liên Hệ', href: '/lien-he' },
                  { label: 'Đặt Lịch', href: '/lien-he#ho-tro-nhanh' }
                ]}
                linkClassName="font-medium text-neutral-600 dark:text-neutral-300 transition-colors hover:text-neutral-900 dark:hover:text-neutral-100"
                separatorClassName="text-neutral-300"
              />
            </div>
            <p className="mx-auto mt-6 max-w-2xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-300 md:text-base">
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
            <p className="text-neutral-500 dark:text-neutral-400">Chưa có album nào trong danh mục này</p>
          </div>
        ) : (
          <>
            <Masonry
              breakpointCols={{ default: 4, 1280: 3, 1024: 3, 768: 2, 640: 2 }}
              className="-ml-2 flex w-auto md:-ml-3"
              columnClassName="bg-clip-padding pl-2 md:pl-3"
            >
              {albums.map(album => (
                <AlbumCard key={album.id} album={album} animationDelay={animationDelays.get(album.id) ?? 0} />
              ))}
            </Masonry>
            <nav className="flex items-center justify-center gap-4 py-10" aria-label="Phân trang thư viện">
              {previousPageHref ? (
                <Link
                  href={previousPageHref}
                  className="text-sm font-medium text-neutral-600 dark:text-neutral-300 underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-100 hover:underline"
                >
                  Trang trước
                </Link>
              ) : null}
              {nextPageHref ? (
                <Link
                  href={nextPageHref}
                  className="text-sm font-medium text-neutral-600 dark:text-neutral-300 underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-100 hover:underline"
                >
                  Trang tiếp theo
                </Link>
              ) : null}
            </nav>
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
