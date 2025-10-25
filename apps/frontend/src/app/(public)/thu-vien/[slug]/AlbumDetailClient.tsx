/**
 * Album Detail Client Component
 * Handles interactive features like PhotoSwipe lightbox
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ArrowLeft, Eye, Calendar } from 'lucide-react'
import { type Album, normalizeAlbumTags, normalizeAlbumCategories } from '@/lib/api'
import Masonry from 'react-masonry-css'
import PhotoSwipeLightbox from 'photoswipe/lightbox'
import 'photoswipe/style.css'
import DividerWithText from '../../../components/common/DividerWithText'
import { getDefaultPhotoSwipeOptions, registerPhotoSwipeUI } from '@/lib/photoswipe'

type Props = {
  album: Album
  relatedAlbums: Album[]
}

export default function AlbumDetailClient({ album, relatedAlbums }: Props) {
  const [imagesLoaded, setImagesLoaded] = useState(false)
  const [imageDimensions, setImageDimensions] = useState<Record<string, { width: number; height: number }>>({})
  const lightboxRef = useRef<PhotoSwipeLightbox | null>(null)

  const displayTags = normalizeAlbumTags(album.tags)
  const displayCategories = normalizeAlbumCategories(album.categories)
  const primaryCategory = album.primaryCategory || displayCategories.find(cat => cat.source === 'manual') || null

  // Preload all images before showing and get real dimensions
  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (!album.images || album.images.length === 0) {
      setImagesLoaded(true)
      return
    }

    const dimensions: Record<string, { width: number; height: number }> = {}

    const imagePromises = album.images.map(img => {
      return new Promise(resolve => {
        const image = new window.Image()
        image.onload = () => {
          // Store real dimensions from loaded image
          dimensions[img.id] = {
            width: img.width || image.naturalWidth,
            height: img.height || image.naturalHeight
          }
          resolve(true)
        }
        image.onerror = () => {
          // Fallback to DB values or default
          dimensions[img.id] = {
            width: img.width || 3840,
            height: img.height || 2560
          }
          resolve(false)
        }
        image.src = img.largeUrl
      })
    })

    Promise.all(imagePromises).then(() => {
      setImageDimensions(dimensions)
      setImagesLoaded(true)
    })
  }, [album.images])

  // Helper function to get high-quality image URL using flexible variants
  const getHighQualityUrl = (imageUrl: string) => {
    const match = imageUrl.match(/imagedelivery\.net\/[^/]+\/([^/]+)\//)
    if (match && match[1]) {
      const imageId = match[1]
      const hash = process.env.NEXT_PUBLIC_CLOUDFLARE_IMAGES_HASH
      // Use xlarge variant with max width for ultra high quality
      return `https://imagedelivery.net/${hash}/${imageId}/xlarge?width=3840&quality=80&format=auto`
    }
    return imageUrl
  }

  // Initialize PhotoSwipe
  useEffect(() => {
    if (!album.images || album.images.length === 0) return

    // Initialize PhotoSwipe with centralized config
    lightboxRef.current = new PhotoSwipeLightbox(getDefaultPhotoSwipeOptions())

    lightboxRef.current.init()

    // Register custom UI elements
    let cleanupUI: (() => void) | undefined

    lightboxRef.current.on('uiRegister', function () {
      const pswp = lightboxRef.current?.pswp
      if (!pswp) return

      // Register all custom UI elements (zoom out, fullscreen, keyboard shortcuts)
      cleanupUI = registerPhotoSwipeUI(pswp)
    })

    return () => {
      // Cleanup UI
      if (cleanupUI) {
        cleanupUI()
      }

      // Destroy lightbox
      if (lightboxRef.current) {
        lightboxRef.current.destroy()
        lightboxRef.current = null
      }
    }
  }, [album.images])

  // Format shoot date
  const formatDate = (dateString?: string) => {
    if (!dateString) return null
    const date = new Date(dateString)
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  return (
    <>
      <div className="min-h-screen bg-neutral-50 px-4 py-12">
        <div className="mx-auto max-w-7xl">
          {/* Back Button */}
          <Link
            href="/thu-vien"
            className="mb-8 inline-flex items-center gap-2 text-neutral-600 hover:text-neutral-900"
          >
            <ArrowLeft size={20} />
            Quay lại thư viện
          </Link>

          {/* Album Header: Cover + Info - Mobile Optimized */}
          <div className="mx-auto mb-12 max-w-5xl md:mb-16">
            <div className="flex flex-col items-start gap-6 md:flex-row md:gap-8">
              {/* Cover Image */}
              <div className="w-full md:w-1/2">
                {album.coverImage ? (
                  <div className="aspect-[3/4] overflow-hidden rounded-lg bg-neutral-100 shadow-lg">
                    <img src={album.coverImage.largeUrl} alt={album.title} className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="flex aspect-[3/4] items-center justify-center rounded-lg bg-neutral-200 shadow-lg">
                    <Eye size={64} className="text-neutral-400" />
                  </div>
                )}
              </div>

              {/* Album Info */}
              <div className="flex w-full flex-col justify-center md:w-1/2">
                <h1 className="mb-3 text-3xl font-bold text-neutral-900 md:mb-4 md:text-4xl lg:text-5xl">
                  {album.title}
                </h1>

                {album.description && (
                  <p className="mb-4 text-base leading-relaxed text-neutral-600 md:mb-6 md:text-lg">
                    {album.description}
                  </p>
                )}

                {/* Tags */}
                {displayTags.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2 md:mb-4">
                    {displayTags.map((tag, index) => (
                      <Link
                        key={tag.id || tag.slug || `tag-${index}`}
                        href={tag.slug ? `/thu-vien/tag/${tag.slug}` : '#'}
                        className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-200 md:px-3 md:py-1.5 md:text-sm"
                      >
                        #{tag.name}
                      </Link>
                    ))}
                  </div>
                )}

                {/* Shoot Date */}
                {album.shootDate && (
                  <div className="mb-3 flex items-center gap-2 text-neutral-600 md:mb-4">
                    <Calendar size={16} className="md:h-[18px] md:w-[18px]" />
                    <span className="text-xs md:text-sm">
                      Ngày chụp: <span className="font-medium">{formatDate(album.shootDate)}</span>
                    </span>
                  </div>
                )}

                {/* Stats */}
                <div className="flex items-center gap-3 border-t border-neutral-200 pt-3 text-xs text-neutral-500 md:gap-4 md:pt-4 md:text-sm">
                  <span className="flex items-center gap-1">
                    <Eye size={14} className="md:h-4 md:w-4" />
                    {album.imageCount} ảnh
                  </span>
                  <span>•</span>
                  <span>{album.viewCount} lượt xem</span>
                </div>

                {/* Category Badges */}
                {(displayCategories.length > 0 || primaryCategory) && (
                  <div className="mt-3 flex flex-wrap gap-2 md:mt-4">
                    {(displayCategories.length > 0 ? displayCategories : primaryCategory ? [primaryCategory] : [])
                      .filter(category => category)
                      .map(category => (
                        <span
                          key={category.id}
                          className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium md:px-4 md:py-2 md:text-sm ${
                            category.source === 'manual'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-neutral-100 text-neutral-600'
                          }`}
                        >
                          {category.name}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Divider */}
          <DividerWithText text="" className="mb-12" />

          {/* Images Masonry Grid - PhotoSwipe Gallery */}
          {album.images && album.images.length > 0 ? (
            <div className="mb-12 md:mb-16">
              {/* Skeleton Loading */}
              {!imagesLoaded && (
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
                  {Array.from({ length: Math.min(album.images.length, 12) }).map((_, i) => (
                    <div
                      key={`skeleton-${i}`}
                      className="aspect-[3/4] animate-pulse rounded-md bg-neutral-200 md:rounded-lg"
                    />
                  ))}
                </div>
              )}

              {/* PhotoSwipe Gallery */}
              <div
                id="album-gallery"
                className={`transition-all duration-700 ${
                  imagesLoaded ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
                }`}
                style={{ display: imagesLoaded ? 'block' : 'none' }}
              >
                <Masonry
                  breakpointCols={{
                    default: 4,
                    1536: 4, // 2xl
                    1280: 3, // xl
                    1024: 3, // lg
                    768: 2, // md
                    640: 2, // sm
                    480: 1 // xs
                  }}
                  className="-ml-4 flex w-auto md:-ml-6"
                  columnClassName="pl-4 md:pl-6 bg-clip-padding"
                >
                  {album.images.map((image, index) => {
                    const highQualityUrl = getHighQualityUrl(image.xlargeUrl)
                    // Use real dimensions from state (loaded from image) or fallback to DB values
                    const dimensions = imageDimensions[image.id] || {
                      width: image.width || 3840,
                      height: image.height || 2560
                    }

                    return (
                      <div
                        key={image.id}
                        className="mb-4 md:mb-6"
                        style={{
                          animation: `fadeInUp 0.6s ease-out ${index * 0.05}s both`
                        }}
                      >
                        <a
                          href={highQualityUrl}
                          data-pswp-width={dimensions.width}
                          data-pswp-height={dimensions.height}
                          target="_blank"
                          rel="noreferrer"
                          className="group block cursor-pointer"
                        >
                          <div className="relative overflow-hidden rounded-md bg-neutral-100 shadow-md transition-shadow hover:shadow-xl active:scale-[0.98] md:rounded-lg md:active:scale-100">
                            <img
                              src={image.largeUrl}
                              alt={image.altText || `${album.title} - Ảnh ${index + 1}`}
                              className="h-auto w-full object-cover transition-transform duration-300 group-hover:scale-105"
                              loading="lazy"
                            />
                          </div>
                        </a>
                      </div>
                    )
                  })}
                </Masonry>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center md:py-12">
              <p className="text-sm text-neutral-500 md:text-base">Album này chưa có ảnh</p>
            </div>
          )}

          {/* Divider */}
          <DividerWithText text="" className="mb-12" />

          {/* Related Albums - Mobile Optimized */}
          {relatedAlbums.length > 0 && (
            <div className="mt-8 md:mt-10">
              <h2 className="mb-6 text-left text-xl font-bold text-neutral-900 md:mb-8 md:text-2xl">KHÁM PHÁ THÊM</h2>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
                {relatedAlbums.slice(0, 8).map(related => (
                  <Link key={related.id ?? related.slug} href={`/thu-vien/${related.slug}`} className="group mb-8 block">
                    {/* Cover Image */}
                    <div className="relative overflow-hidden rounded-lg bg-neutral-100">
                      {related.coverImage ? (
                        <img
                          src={related.coverImage.thumbnailUrl}
                          alt={related.title}
                          className="h-auto w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex aspect-square w-full items-center justify-center">
                          <Eye size={48} className="text-neutral-300" />
                        </div>
                      )}
                    </div>

                    {/* Title */}
                    <h3 className="mt-3 line-clamp-2 text-left text-sm font-medium text-neutral-900 transition-colors group-hover:text-neutral-600 md:text-base">
                      {related.title}
                    </h3>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Custom CSS for animations and PhotoSwipe controls */}
      <style jsx global>{`
        /* PhotoSwipe keeps aspect ratio by default, don't override */
        .pswp {
          --pswp-bg: rgba(0, 0, 0, 0.95) !important;
        }

        .pswp__top-bar {
          background: rgba(0, 0, 0, 0.3) !important;
        }

        /* Zoom controls hint */
        .pswp__ui {
          cursor: zoom-in;
        }

        .pswp--zoomed-in .pswp__ui {
          cursor: grab;
        }

        .pswp--dragging .pswp__ui {
          cursor: grabbing;
        }

        /* Add zoom hint on hover */
        @media (min-width: 768px) {
          .pswp__img:hover {
            cursor: zoom-in;
          }

          .pswp--zoomed-in .pswp__img {
            cursor: grab !important;
          }

          .pswp--dragging .pswp__img {
            cursor: grabbing !important;
          }
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  )
}
