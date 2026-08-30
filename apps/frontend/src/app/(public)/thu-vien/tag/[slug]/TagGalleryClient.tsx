"use client"

import { useCallback, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import Masonry from 'react-masonry-css'
import useSWRInfinite from 'swr/infinite'
import { Eye } from 'lucide-react'
import DividerWithText from '../../../../components/common/DividerWithText'
import NavigationLinks from '../../../../components/common/NavigationLinks'
import { type Album, type Tag, type TagAlbumsResponse } from '@/lib/api'
import {
  fetchTagPage,
  getTagPageKey,
  mergeTagPages,
  publicGallerySWRConfig
} from '@/lib/public-gallery-swr'

interface Props {
  slug: string
  initialTag: Tag
  initialAlbums: Album[]
  initialPagination: TagAlbumsResponse['pagination']
}

export default function TagGalleryClient({ slug, initialTag, initialAlbums, initialPagination }: Props) {
  const pageLimit = initialPagination.limit || 20
  const fallbackData = useMemo<TagAlbumsResponse[]>(
    () => [{ tag: initialTag, data: initialAlbums, pagination: initialPagination }],
    [initialAlbums, initialPagination, initialTag]
  )
  const { data, error, isLoading, isValidating, setSize, size } = useSWRInfinite<TagAlbumsResponse, Error>(
    getTagPageKey(slug, pageLimit),
    fetchTagPage,
    { ...publicGallerySWRConfig, fallbackData }
  )

  const pages = data ?? fallbackData
  const tag = pages[0]?.tag ?? initialTag
  const albums = useMemo(() => mergeTagPages(pages), [pages])
  const lastPage = pages[pages.length - 1] ?? fallbackData[0]
  const hasMore = lastPage.pagination.hasMore && lastPage.pagination.nextOffset !== null
  const loadingMore = isLoading || (isValidating && size > 1)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const requestInFlightRef = useRef(false)

  const loadMore = useCallback(() => {
    if (requestInFlightRef.current || loadingMore || !hasMore) {
      return
    }

    requestInFlightRef.current = true
    void setSize(currentSize => currentSize + 1)
      .catch(loadError => {
        console.error('Failed to load more tag albums:', loadError)
      })
      .finally(() => {
        requestInFlightRef.current = false
      })
  }, [hasMore, loadingMore, setSize])

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
            #{tag.name}
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
            {tag.description || `Các album thuộc tag ${tag.name} được tuyển chọn bởi Nguyen Dinh Thinh Studio.`}
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

          <div ref={loadMoreRef} className="h-px" aria-hidden="true" />
          {error && <p className="text-sm text-red-500 py-4 text-center">Không thể tải thêm album. Vui lòng thử lại.</p>}
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
