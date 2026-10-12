'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export default function LatestCollectionCarousel({
  children,
  albumTitles
}: {
  children: ReactNode
  albumTitles: string[]
}) {
  const trackId = useId()
  const track = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const element = track.current
    const card = element?.children[activeIndex]
    if (!element || !card) return

    const updateHeight = () => {
      // Mobile follows the visible photo's height when portrait and landscape covers are mixed.
      element.style.setProperty('--active-slide-height', `${card.getBoundingClientRect().height}px`)
    }

    const observer = new ResizeObserver(updateHeight)
    observer.observe(card)
    updateHeight()
    return () => observer.disconnect()
  }, [activeIndex])

  function updateActiveIndex() {
    const element = track.current
    if (!element) return

    const left = element.getBoundingClientRect().left
    let nearestIndex = 0
    let nearestDistance = Infinity

    Array.from(element.children).forEach((child, index) => {
      const distance = Math.abs(child.getBoundingClientRect().left - left)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestIndex = index
      }
    })

    setActiveIndex(nearestIndex)
  }

  function selectAlbum(index: number) {
    const element = track.current
    const card = element?.children[index]
    const firstCard = element?.children[0]
    if (!element || !card || !firstCard) return

    element.scrollTo({
      left: card.getBoundingClientRect().left - firstCard.getBoundingClientRect().left,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
    })
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (window.matchMedia('(min-width: 768px)').matches || event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return

    event.preventDefault()
    const nextIndex = activeIndex + (event.key === 'ArrowRight' ? 1 : -1)
    selectAlbum(Math.max(0, Math.min(albumTitles.length - 1, nextIndex)))
  }

  return (
    <>
      <div
        ref={track}
        id={trackId}
        role="group"
        aria-label="Các bộ ảnh mới nhất"
        tabIndex={0}
        onScroll={updateActiveIndex}
        onKeyDown={handleKeyDown}
        className="scrollbar-hide grid h-[var(--active-slide-height)] snap-x snap-mandatory auto-cols-[100%] grid-flow-col items-start gap-3 overflow-x-auto overscroll-x-contain rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-600 md:h-auto md:auto-cols-auto md:grid-flow-row md:grid-cols-3 md:overflow-visible"
      >
        {children}
      </div>
      {albumTitles.length > 1 ? (
        <div role="group" aria-label="Chọn bộ ảnh" className="mt-2 flex justify-center md:hidden">
          {albumTitles.map((title, index) => (
            <button
              key={index}
              type="button"
              aria-label={`Xem bộ ảnh ${title}`}
              aria-controls={trackId}
              aria-current={activeIndex === index ? 'true' : undefined}
              onClick={() => selectAlbum(index)}
              className="flex size-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600"
            >
              <span
                aria-hidden="true"
                className={`size-2.5 rounded-full ${activeIndex === index ? 'bg-neutral-800 dark:bg-neutral-100' : 'bg-neutral-300 dark:bg-neutral-700'}`}
              />
            </button>
          ))}
        </div>
      ) : null}
    </>
  )
}
