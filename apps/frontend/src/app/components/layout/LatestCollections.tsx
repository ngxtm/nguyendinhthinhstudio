import Link from 'next/link'
import type { Album } from '@/lib/api/albums'
import { getResponsiveImageProps } from '@/lib/responsive-image'
import DividerWithText from '../common/DividerWithText'
import LatestCollectionCarousel from './LatestCollectionCarousel'

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function LatestCollections({ albums }: { albums: Album[] }) {
  const collections = albums
    .map(album => {
      const cover = album.coverImage ?? album.images?.[0]
      return { album, cover }
    })
    .filter((collection): collection is { album: Album; cover: NonNullable<Album['coverImage']> } =>
      Boolean(collection.cover && getResponsiveImageProps(collection.cover, '').src)
    )
    .slice(0, 3)

  if (collections.length === 0) return null

  return (
    <section aria-label="Bộ ảnh mới nhất" className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 md:px-8">
      <header className="mb-5 text-center sm:mb-6">
        <DividerWithText
          text="LATEST COLLECTION"
          textClassName="text-[10px] font-medium tracking-[0.16em] text-neutral-400 sm:text-xs"
          lineClassName="border-neutral-200 dark:border-neutral-800"
          className="mx-auto max-w-[720px]"
        />
      </header>

      <LatestCollectionCarousel albumTitles={collections.map(({ album }) => album.title)}>
        {collections.map(({ album, cover }, index) => {
          const featured = index === 0

          return (
            <Link
              key={album.id}
              href={`/thu-vien/${encodeURIComponent(album.slug)}`}
              className="group relative isolate block min-w-0 snap-start snap-always overflow-hidden bg-neutral-200 text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-900 dark:focus-visible:outline-white"
            >
              {/* API variants are already optimized; natural image height preserves the entire composition. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                {...getResponsiveImageProps(
                  cover,
                  '(max-width: 767px) calc(100vw - 32px), (max-width: 1200px) 33vw, 370px'
                )}
                alt={cover.altText || album.title}
                loading="lazy"
                decoding="async"
                draggable={false}
                className="block !h-auto w-full object-contain"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5 md:p-4 lg:p-6">
                {featured ? (
                  <p className="mb-2 text-[10px] font-semibold tracking-[0.14em] sm:text-xs">NEW ALBUM</p>
                ) : null}
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="line-clamp-2 text-xl font-semibold text-balance uppercase md:text-lg lg:text-2xl">
                      {album.title}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-white/90 lg:text-sm">
                      {featured ? album.description || 'Những khoảnh khắc mới từ NDT STUDIO.' : 'Bộ ảnh mới cập nhật'}
                    </p>
                  </div>
                  {!featured ? <ChevronRight className="mb-1 size-5 shrink-0" /> : null}
                </div>
                {featured ? (
                  <span className="mt-4 inline-flex min-h-11 items-center gap-4 rounded-full border border-white/90 px-4 py-2 text-[10px] font-semibold transition-colors group-hover:bg-white group-hover:text-neutral-900 sm:text-xs">
                    KHÁM PHÁ NGAY
                    <ChevronRight className="size-4" />
                  </span>
                ) : null}
              </div>
            </Link>
          )
        })}
      </LatestCollectionCarousel>
    </section>
  )
}
