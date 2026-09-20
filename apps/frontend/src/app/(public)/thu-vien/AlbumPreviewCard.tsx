'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Eye } from 'lucide-react'
import type { Album, Image as AlbumImage } from '@/lib/api/albums'
import { apiClient } from '@/lib/api/client'
import { getResponsiveImageProps } from '@/lib/responsive-image'

const SIZES = '(max-width: 639px) 100vw, (max-width: 767px) 50vw, (max-width: 1279px) 33vw, 25vw'

export default function AlbumPreviewCard({ album, animationDelay }: { album: Album; animationDelay: number }) {
  const [frame, setFrame] = useState<{ current?: AlbumImage; previous?: AlbumImage }>({})
  const [position, setPosition] = useState(0)
  const [total, setTotal] = useState(album.imageCount)
  const [engaged, setEngaged] = useState(false)
  const images = useRef<AlbumImage[]>(album.coverImage ? [album.coverImage] : [])
  const request = useRef<Promise<AlbumImage[]> | null>(null)
  const loaded = useRef(false)
  const decoded = useRef(new Map<string, Promise<void>>())
  const index = useRef(0)
  const current = useRef(album.coverImage)
  const generation = useRef(0)
  const hovering = useRef(false)
  const hoverSession = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touch = useRef<{ x: number; y: number; horizontal: boolean } | null>(null)
  const suppressClick = useRef(false)
  const mounted = useRef(true)

  function clearTimer() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  function stop(reset = false) {
    hovering.current = false
    hoverSession.current += 1
    generation.current += 1
    clearTimer()
    if (reset) {
      index.current = 0
      current.current = album.coverImage
      setPosition(0)
      setFrame({})
      setEngaged(false)
    }
  }

  useEffect(() => {
    mounted.current = true
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const visibility = () => {
      if (document.hidden) stop()
    }
    const preference = () => {
      if (motion.matches) stop()
    }
    document.addEventListener('visibilitychange', visibility)
    motion.addEventListener('change', preference)
    return () => {
      mounted.current = false
      stop()
      document.removeEventListener('visibilitychange', visibility)
      motion.removeEventListener('change', preference)
    }
  }, [])

  function loadImages() {
    if (loaded.current) return Promise.resolve(images.current)
    if (!request.current) {
      request.current = apiClient<AlbumImage[]>(`/images/album/${encodeURIComponent(album.id)}`)
        .then(result => {
          const cover = album.coverImage
          images.current = [...(cover ? [cover] : []), ...result.filter(image => image.id !== cover?.id)]
          loaded.current = true
          if (mounted.current) setTotal(images.current.length)
          return images.current
        })
        .finally(() => {
          request.current = null
        })
    }
    return request.current
  }

  function preload(image: AlbumImage) {
    const cached = decoded.current.get(image.id)
    if (cached) return cached
    const pending = new Promise<void>((resolve, reject) => {
      const element = new window.Image()
      const props = getResponsiveImageProps(image, SIZES)
      element.onload = () => {
        element.decode().then(resolve, reject)
      }
      element.onerror = () => reject(new Error('Preview image unavailable'))
      element.sizes = props.sizes
      if (props.srcSet) element.srcset = props.srcSet
      element.src = props.src
    }).catch(error => {
      decoded.current.delete(image.id)
      throw error
    })
    decoded.current.set(image.id, pending)
    return pending
  }

  async function advance(direction: number) {
    const token = ++generation.current
    try {
      const list = await loadImages()
      if (!mounted.current || token !== generation.current || list.length < 2) return
      const nextIndex = (index.current + direction + list.length) % list.length
      const next = list[nextIndex]
      await preload(next)
      if (!mounted.current || token !== generation.current) return
      setFrame({ previous: current.current, current: next })
      current.current = next
      index.current = nextIndex
      setPosition(nextIndex)
      setEngaged(true)
      void preload(list[(nextIndex + 1) % list.length]).catch(() => undefined)
    } catch {
      // Keep the last successful image and preserve normal album navigation.
    }
  }

  async function autoplay(session: number) {
    if (!hovering.current || session !== hoverSession.current || document.hidden) return
    await advance(1)
    if (hovering.current && session === hoverSession.current)
      timer.current = setTimeout(() => {
        void autoplay(session)
      }, 2000)
  }

  function startHover(pointerType: string) {
    if (pointerType !== 'mouse' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    setEngaged(true)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    clearTimer()
    hovering.current = true
    const session = ++hoverSession.current
    timer.current = setTimeout(() => {
      void autoplay(session)
    }, 500)
  }

  function manual(direction: number) {
    stop()
    void advance(direction)
  }

  return (
    <div
      className="group relative mb-2 md:mb-3 gallery-card-enter"
      style={{ animationDelay: `${animationDelay}ms` }}
      onPointerEnter={event => startHover(event.pointerType)}
      onPointerLeave={event => {
        if (event.pointerType === 'mouse') stop(true)
      }}
    >
      <div className="relative bg-neutral-100 dark:bg-neutral-900 rounded-lg overflow-hidden">
        <Link
          href={`/thu-vien/${album.slug}`}
          className="block relative touch-pan-y"
          aria-label={`Xem bộ ảnh ${album.title}`}
          onClick={event => {
            if (suppressClick.current) {
              event.preventDefault()
              suppressClick.current = false
            }
          }}
          onTouchStart={event => {
            suppressClick.current = false
            if (event.touches.length !== 1) {
              touch.current = null
              return
            }
            const point = event.touches[0]
            touch.current = { x: point.clientX, y: point.clientY, horizontal: false }
          }}
          onTouchMove={event => {
            if (!touch.current || event.touches.length !== 1) return
            const dx = Math.abs(event.touches[0].clientX - touch.current.x)
            const dy = Math.abs(event.touches[0].clientY - touch.current.y)
            if (dy > 12 && dy > dx) {
              touch.current = null
              return
            }
            if (dx > 12 && dx > dy * 1.5) {
              touch.current.horizontal = true
              suppressClick.current = true
            }
          }}
          onTouchEnd={event => {
            const start = touch.current
            touch.current = null
            if (!start || !start.horizontal) return
            const dx = event.changedTouches[0].clientX - start.x
            if (Math.abs(dx) >= 40) manual(dx < 0 ? 1 : -1)
          }}
          onTouchCancel={() => {
            touch.current = null
          }}
        >
          {album.coverImage ? (
            <img
              {...getResponsiveImageProps(album.coverImage, SIZES)}
              alt={album.title}
              className="block w-full h-auto"
              loading="lazy"
              draggable={false}
            />
          ) : (
            <div className="flex justify-center items-center aspect-square">
              <Eye size={48} className="text-neutral-300" />
            </div>
          )}
          {frame.previous && frame.current ? (
            <img
              {...getResponsiveImageProps(frame.previous, SIZES)}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 album-preview-image"
              draggable={false}
            />
          ) : null}
          {frame.current ? (
            <img
              key={frame.current.id}
              {...getResponsiveImageProps(frame.current, SIZES)}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 preview-frame album-preview-image"
              draggable={false}
            />
          ) : null}
          {total > 1 ? (
            <span
              className={`pointer-events-none absolute right-2 bottom-2 rounded-full bg-black/50 px-2 py-1 text-xs text-white tabular-nums ${engaged ? '' : 'md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100'}`}
            >
              {position + 1}/{total}
            </span>
          ) : null}
        </Link>
        {total > 1 ? (
          <div className="top-1/2 absolute inset-x-2 flex justify-between md:opacity-0 focus-within:opacity-100 group-hover:opacity-100 -translate-y-1/2 pointer-events-none">
            <button
              type="button"
              aria-label={`Ảnh trước của ${album.title}`}
              onClick={() => manual(-1)}
              className="pointer-events-auto flex size-7 !min-h-0 !min-w-0 shrink-0 items-center justify-center rounded-full bg-black/60 p-0 text-white focus-visible:outline-2 focus-visible:outline-offset-2 md:size-9"
            >
              <ChevronLeft className="size-3.5 md:size-4" />
            </button>
            <button
              type="button"
              aria-label={`Ảnh tiếp theo của ${album.title}`}
              onClick={() => manual(1)}
              className="pointer-events-auto flex size-7 !min-h-0 !min-w-0 shrink-0 items-center justify-center rounded-full bg-black/60 p-0 text-white focus-visible:outline-2 focus-visible:outline-offset-2 md:size-9"
            >
              <ChevronRight className="size-3.5 md:size-4" />
            </button>
          </div>
        ) : null}
      </div>
      <Link href={`/thu-vien/${album.slug}`} className="block mt-3">
        <h2 className="font-bold text-neutral-900 dark:group-hover:text-neutral-300 dark:text-neutral-100 group-hover:text-neutral-600 text-sm md:text-base text-left line-clamp-2 transition-colors">
          {album.title}
        </h2>
      </Link>
      <style jsx>{`
        .gallery-card-enter {
          animation: galleryFadeInUp 500ms ease-out both;
        }
        .preview-frame {
          animation: previewFade 280ms ease-out both;
        }
        @keyframes previewFade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
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
          .gallery-card-enter,
          .preview-frame {
            animation: none;
          }
        }
      `}</style>
    </div>
  )
}
