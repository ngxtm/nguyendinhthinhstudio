/**
 * Album Detail Client Component
 * Handles interactive features like PhotoSwipe lightbox
 */

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Eye, Image as ImageIcon } from 'lucide-react'
import useSWRInfinite from 'swr/infinite'
import {
  type Album,
  type AlbumImagePage,
  incrementAlbumView,
  normalizeAlbumCategories,
  normalizeAlbumTags
} from '@/lib/api'
import Masonry from 'react-masonry-css'
import PhotoSwipeLightbox from 'photoswipe/lightbox'
import 'photoswipe/style.css'
import DividerWithText from '../../../components/common/DividerWithText'
import { getDefaultPhotoSwipeOptions, registerPhotoSwipeUI } from '@/lib/photoswipe'
import { getResponsiveImageProps } from '@/lib/responsive-image'
import {
  fetchAlbumImagePage,
  getAlbumImagePageKey,
  getAlbumImagePrefetchPolicy,
  mergeAlbumImagePages,
  type AlbumImageConnection
} from '@/lib/public-album-detail-swr'
import { publicGallerySWRConfig } from '@/lib/public-gallery-swr'

type Props = {
  album: Album
  relatedAlbums: Album[]
  initialImagePage: AlbumImagePage
}

type ImageLoadState = 'loaded' | 'failed'
type ImageDimensions = { width: number; height: number }

function getAlbumImageConnection(): AlbumImageConnection | undefined {
  if (typeof navigator === 'undefined') return undefined

  return (navigator as Navigator & { connection?: AlbumImageConnection }).connection
}

function loadImage(src: string, fetchPriority: 'high' | 'low'): Promise<ImageDimensions | null> {
  return new Promise(resolve => {
    const image = new window.Image()
    image.decoding = 'async'
    image.fetchPriority = fetchPriority
    image.onload = () => {
      const decoded = typeof image.decode === 'function' ? image.decode().catch(() => undefined) : Promise.resolve()
      void decoded.then(() => {
        resolve({ width: image.naturalWidth, height: image.naturalHeight })
      })
    }
    image.onerror = () => resolve(null)
    image.src = src
  })
}

async function loadImageWithRetry(src: string, fetchPriority: 'high' | 'low'): Promise<ImageDimensions | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const dimensions = await loadImage(src, fetchPriority)
    if (dimensions) return dimensions
  }

  return null
}

export default function AlbumDetailClient({ album, relatedAlbums, initialImagePage }: Props) {
  const [imageLoadStates, setImageLoadStates] = useState<Record<string, ImageLoadState>>({})
  const [imageDimensions, setImageDimensions] = useState<Record<string, ImageDimensions>>({})
  const lightboxRef = useRef<PhotoSwipeLightbox | null>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const requestInFlightRef = useRef(false)
  const loadingImageIdsRef = useRef(new Set<string>())
  const imageLoadStatesRef = useRef<Record<string, ImageLoadState>>({})
  const loadMoreHandlerRef = useRef<() => void>(() => undefined)
  const mountedRef = useRef(false)
  // In-memory dedupe for environments where sessionStorage is unavailable
  // (Safari private mode). Survives re-mounts within the same tab session.
  const viewedRef = useRef<Set<string>>(new Set())

  const fallbackData = useMemo(() => [initialImagePage], [initialImagePage])
  const { data, error, isLoading, isValidating, setSize, size } = useSWRInfinite<AlbumImagePage, Error>(
    getAlbumImagePageKey(album.id),
    fetchAlbumImagePage,
    { ...publicGallerySWRConfig, revalidateFirstPage: false, fallbackData }
  )
  const pages = data ?? fallbackData
  const images = useMemo(() => mergeAlbumImagePages(pages), [pages])
  const lastPage = pages[pages.length - 1] ?? fallbackData[0]
  const hasMore = lastPage.pagination.hasMore && Boolean(lastPage.pagination.nextCursor)
  const loadingMore = isLoading || (isValidating && size > 1)
  const readyImages = useMemo(
    () => images.filter(image => imageLoadStates[image.id] === 'loaded'),
    [imageLoadStates, images]
  )
  const hasReadyImages = readyImages.length > 0
  const initialImageIds = useMemo(() => new Set(initialImagePage.data.map(image => image.id)), [initialImagePage])
  const prefetchPolicy = useMemo(() => getAlbumImagePrefetchPolicy(getAlbumImageConnection()), [])

  const loadMore = useCallback(() => {
    if (requestInFlightRef.current || loadingMore || !hasMore) return

    requestInFlightRef.current = true
    void setSize(currentSize => currentSize + 1)
      .catch(loadError => {
        console.error('Failed to load more album images:', loadError)
      })
      .finally(() => {
        requestInFlightRef.current = false
      })
  }, [hasMore, loadingMore, setSize])

  useEffect(() => {
    loadMoreHandlerRef.current = loadMore
  }, [loadMore])

  useEffect(() => {
    if (!prefetchPolicy.immediate || error || !hasMore) return

    loadMore()
  }, [error, hasMore, loadMore, prefetchPolicy.immediate])

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target) return

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) loadMoreHandlerRef.current()
      },
      { threshold: 0.1, rootMargin: prefetchPolicy.rootMargin }
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [prefetchPolicy.rootMargin])

  const displayTags = normalizeAlbumTags(album.tags)
  const displayCategories = normalizeAlbumCategories(album.categories)
  const primaryCategory = album.primaryCategory || displayCategories.find(cat => cat.source === 'manual') || null
  const categoriesForDisplay =
    displayCategories.length > 0 ? displayCategories : primaryCategory ? [primaryCategory] : []

  // Record one real page view (server no longer increments on GET).
  // Deduped across re-mounts/reloads in the same tab via sessionStorage; the
  // key is only persisted AFTER the POST succeeds, so a failed first attempt
  // retries on the next mount instead of being permanently dropped.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = `ndt:view:${album.slug}`

    let storageAvailable = true
    try {
      if (sessionStorage.getItem(key)) return
    } catch {
      storageAvailable = false
    }
    if (viewedRef.current.has(key)) return

    incrementAlbumView(album.slug)
      .then(() => {
        viewedRef.current.add(key)
        if (storageAvailable) {
          try {
            sessionStorage.setItem(key, '1')
          } catch {
            // Best-effort persist; in-memory guard still prevents re-fire.
          }
        }
      })
      .catch(() => {
        // Leave the guard unset so a later mount can retry.
      })
  }, [album.slug])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Preload each image independently so one slow image never blocks
  // already-ready images from appearing in the gallery.
  useEffect(() => {
    if (typeof window === 'undefined') return

    for (const image of images) {
      if (imageLoadStatesRef.current[image.id] || loadingImageIdsRef.current.has(image.id)) continue

      loadingImageIdsRef.current.add(image.id)
      const fetchPriority = initialImageIds.has(image.id) ? 'high' : 'low'

      void loadImageWithRetry(image.largeUrl, fetchPriority).then(dimensions => {
        loadingImageIdsRef.current.delete(image.id)
        if (!mountedRef.current) return

        const state: ImageLoadState = dimensions ? 'loaded' : 'failed'
        imageLoadStatesRef.current[image.id] = state
        if (dimensions) {
          setImageDimensions(current => ({
            ...current,
            [image.id]: {
              width: dimensions.width || image.width || 3840,
              height: dimensions.height || image.height || 2560
            }
          }))
        }
        setImageLoadStates(current => ({ ...current, [image.id]: state }))
      })
    }
  }, [images, initialImageIds])

  // Initialize PhotoSwipe
  useEffect(() => {
    if (!hasReadyImages) return

    // Initialize PhotoSwipe with centralized config
    const lightbox = new PhotoSwipeLightbox(getDefaultPhotoSwipeOptions())
    lightboxRef.current = lightbox

    lightbox.init()

    // Register custom UI elements
    let cleanupUI: (() => void) | undefined

    lightbox.on('uiRegister', function () {
      const pswp = lightbox.pswp
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
      lightbox.destroy()
      if (lightboxRef.current === lightbox) {
        lightboxRef.current = null
      }
    }
  }, [hasReadyImages])

  return (
    <>
      <div className="min-h-screen bg-neutral-50 px-4 py-12 md:px-8 lg:px-16 dark:bg-neutral-950">
        <div className="w-full">
          {/* Back Button */}
          <Link
            href="/thu-vien"
            className="mb-8 inline-flex items-center gap-2 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100"
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
                  <div className="aspect-[3/4] overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-900 shadow-lg">
                    <img
                      {...getResponsiveImageProps(album.coverImage, '(max-width: 767px) 100vw, 50vw')}
                      src={album.coverImage.largeUrl}
                      alt={album.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex aspect-[3/4] items-center justify-center rounded-lg bg-neutral-200 dark:bg-neutral-800 shadow-lg">
                    <Eye size={64} className="text-neutral-400" />
                  </div>
                )}
              </div>

              {/* Album Info */}
              <div className="flex w-full flex-col justify-center md:w-1/2">
                <h1 className="mb-3 text-3xl font-bold text-neutral-900 dark:text-neutral-100 md:mb-4 md:text-4xl lg:text-5xl">
                  {album.title}
                </h1>

                {album.description && (
                  <p className="mb-4 text-base leading-relaxed text-neutral-600 dark:text-neutral-300 md:mb-6 md:text-lg">
                    {album.description}
                  </p>
                )}

                {/* Tags */}
                {displayTags.length > 0 && (
                  <div className="mb-3 flex flex-wrap justify-center gap-2 md:mb-4 md:justify-start">
                    {displayTags.map((tag, index) => (
                      <Link
                        key={tag.id || tag.slug || `tag-${index}`}
                        href={tag.slug ? `/thu-vien/tag/${tag.slug}` : '#'}
                        className="inline-flex items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-900 px-2.5 py-1 text-center text-xs font-medium text-neutral-700 dark:text-neutral-200 transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-800 md:px-3 md:py-1.5 md:text-sm"
                      >
                        #{tag.name}
                      </Link>
                    ))}
                  </div>
                )}

                {/* Stats */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-neutral-200 dark:border-neutral-700 pt-3 text-xs text-neutral-500 dark:text-neutral-400 md:gap-x-4 md:pt-4 md:text-sm">
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    <ImageIcon size={14} className="md:h-4 md:w-4" />
                    Số lượng ảnh trong album: {album.imageCount} ảnh
                  </span>
                </div>

                {/* Album Topic */}
                {categoriesForDisplay.length > 0 && (
                  <p className="mt-3 text-xs leading-6 md:mt-4 md:text-sm">
                    <span className="font-medium">Chủ đề:</span>{' '}
                    {categoriesForDisplay.map(category => category.name).join(', ')}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Divider */}
          <DividerWithText text="" className="mb-12" />

          {/* Images Masonry Grid - PhotoSwipe Gallery */}
          {images.length > 0 ? (
            <div className="mb-12 md:mb-16">
              {readyImages.length > 0 && (
                <div id="album-gallery" className="mx-auto">
                  <Masonry
                    breakpointCols={{
                      default: 4,
                      1536: 4, // 2xl
                      1280: 4, // xl
                      1024: 4, // lg
                      768: 2, // md
                      640: 2, // sm
                      480: 2 // xs
                    }}
                    className="-ml-2 flex w-auto md:-ml-3"
                    style={{ maxWidth: 'none' }}
                    columnClassName="bg-clip-padding pl-2 md:pl-3"
                  >
                    {images.map((image, index) => {
                      const highQualityUrl =
                        image.xlargeUrl || image.largeUrl || image.mediumUrl || image.smallUrl || image.thumbnailUrl
                      const dimensions = imageDimensions[image.id] || {
                        width: image.width || 3840,
                        height: image.height || 2560
                      }
                      const responsiveImageProps = getResponsiveImageProps(
                        imageDimensions[image.id] ? { ...image, ...imageDimensions[image.id] } : image,
                        '(max-width: 767px) 50vw, 25vw'
                      )
                      const isInitialImage = initialImageIds.has(image.id)
                      const isImageLoaded = imageLoadStates[image.id] === 'loaded'

                      return (
                        <div
                          key={image.id}
                          className={`mb-2 md:mb-3 ${isImageLoaded ? '' : 'invisible'}`}
                          style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}` }}
                        >
                          {isImageLoaded ? (
                            <a
                              href={highQualityUrl}
                              data-pswp-width={dimensions.width}
                              data-pswp-height={dimensions.height}
                              target="_blank"
                              rel="noreferrer"
                              className="group block cursor-pointer"
                            >
                              <div className="relative overflow-hidden rounded-md bg-neutral-100 dark:bg-neutral-900 shadow-md transition-shadow hover:shadow-xl active:scale-[0.98] md:rounded-lg md:active:scale-100">
                                <img
                                  {...responsiveImageProps}
                                  src={image.largeUrl}
                                  alt={image.altText || `${album.title} - Ảnh ${index + 1}`}
                                  width={dimensions.width}
                                  height={dimensions.height}
                                  className="album-image-reveal h-auto w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                  loading={isInitialImage ? 'eager' : 'lazy'}
                                  fetchPriority={isInitialImage ? 'high' : 'low'}
                                  decoding="async"
                                />
                              </div>
                            </a>
                          ) : null}
                        </div>
                      )
                    })}
                  </Masonry>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center md:py-12">
              <p className="text-sm text-neutral-500 dark:text-neutral-400 md:text-base">Album này chưa có ảnh</p>
            </div>
          )}

          {images.length > 0 && (
            <>
              <div ref={loadMoreRef} className="h-px" aria-hidden="true" />
              {error ? (
                <div className="flex justify-center py-4">
                  <button
                    type="button"
                    onClick={() => loadMore()}
                    className="text-sm text-red-500 underline underline-offset-2"
                  >
                    Không thể tải thêm ảnh. Vui lòng thử lại.
                  </button>
                </div>
              ) : null}
            </>
          )}

          {/* Divider */}
          <DividerWithText text="" className="mb-12" />

          {/* Related Albums - Mobile Optimized */}
          {relatedAlbums.length > 0 && (
            <div className="mt-8 md:mt-10">
              <h2 className="mb-6 text-left text-xl font-bold text-neutral-900 dark:text-neutral-100 md:mb-8 md:text-2xl">KHÁM PHÁ THÊM</h2>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3 lg:grid-cols-4">
                {relatedAlbums.slice(0, 8).map(related => (
                  <Link key={related.id ?? related.slug} href={`/thu-vien/${related.slug}`} className="group block">
                    {/* Cover Image */}
                    <div className="relative overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-900">
                      {related.coverImage ? (
                        <img
                          {...getResponsiveImageProps(
                            related.coverImage,
                            '(max-width: 767px) 50vw, (max-width: 1023px) 33vw, 25vw'
                          )}
                          src={related.coverImage.largeUrl}
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
                    <h3 className="mt-3 line-clamp-2 text-left text-sm font-medium text-neutral-900 dark:text-neutral-100 transition-colors group-hover:text-neutral-600 dark:group-hover:text-neutral-300 md:text-base">
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

        .album-image-reveal {
          transform-origin: center;
          animation: albumImageReveal 700ms ease-out both;
        }

        @keyframes albumImageReveal {
          from {
            opacity: 0;
            transform: scale(1.1);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .album-image-reveal {
            animation: none;
          }
        }
      `}</style>
    </>
  )
}
