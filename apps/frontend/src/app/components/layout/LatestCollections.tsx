import Link from 'next/link'
import type { Album } from '@/lib/api/albums'
import { getResponsiveImageProps } from '@/lib/responsive-image'
import DividerWithText from '../common/DividerWithText'

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
    <section
      aria-label="Bộ ảnh mới nhất"
      className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 md:px-8"
    >
      <header className="mb-5 text-center sm:mb-6">
        <DividerWithText
          text="LATEST COLLECTION"
          textClassName="text-[10px] font-medium tracking-[0.16em] text-neutral-400 sm:text-xs"
          lineClassName="border-neutral-200 dark:border-neutral-800"
          className="mx-auto mb-3 max-w-[720px]"
        />
      </header>

      <div
        className={`grid gap-2 ${collections.length > 1 ? 'md:h-[360px] md:grid-cols-[1.8fr_1fr] md:grid-rows-2 lg:h-[440px] xl:h-[480px]' : ''}`}
      >
        {collections.map(({ album, cover }, index) => {
          const featured = index === 0

          return (
            <Link
              key={album.id}
              href={`/thu-vien/${encodeURIComponent(album.slug)}`}
              className={`group relative isolate block overflow-hidden bg-neutral-200 text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-900 dark:focus-visible:outline-white ${featured ? 'aspect-[4/3] md:row-span-2 md:aspect-auto' : 'aspect-[16/9] md:aspect-auto'} ${collections.length === 1 ? 'md:aspect-[2/1]' : ''} ${collections.length === 2 && !featured ? 'md:row-span-2' : ''}`}
            >
              {/* API variants are already optimized; reuse the gallery's responsive image sources. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                {...getResponsiveImageProps(
                  cover,
                  featured
                    ? '(max-width: 767px) 100vw, (max-width: 1200px) 64vw, 730px'
                    : '(max-width: 767px) 100vw, (max-width: 1200px) 36vw, 406px'
                )}
                alt={cover.altText || album.title}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 !h-full !w-full object-cover motion-safe:transition-transform motion-safe:duration-700 motion-safe:group-hover:scale-[1.03]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
              <div className={`absolute inset-x-0 bottom-0 ${featured ? 'p-5 sm:p-7 lg:p-8' : 'p-5 lg:p-6'}`}>
                {featured ? (
                  <p className="mb-2 text-[10px] font-semibold tracking-[0.14em] sm:text-xs">NEW ALBUM</p>
                ) : null}
                <div className="flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <h3
                      className={`font-semibold text-balance uppercase ${featured ? 'text-xl sm:text-2xl lg:text-3xl' : 'text-base lg:text-xl'}`}
                    >
                      {album.title}
                    </h3>
                    <p
                      className={`mt-2 text-xs leading-relaxed text-white/85 sm:text-sm ${featured ? 'line-clamp-2 max-w-[380px]' : ''}`}
                    >
                      {featured
                        ? album.description ||
                          'Bộ ảnh mới nhất với những khoảnh khắc ngọt ngào, trong trẻo và đầy cảm xúc.'
                        : 'Bộ ảnh mới cập nhật'}
                    </p>
                  </div>
                  {!featured ? <ChevronRight className="mb-1 size-5 shrink-0" /> : null}
                </div>
                {featured ? (
                  <span className="mt-4 inline-flex items-center gap-4 rounded-sm border border-white/90 px-4 py-2.5 text-[10px] font-semibold transition-colors group-hover:bg-white group-hover:text-neutral-900 sm:text-xs">
                    KHÁM PHÁ NGAY
                    <ChevronRight className="size-4" />
                  </span>
                ) : null}
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
