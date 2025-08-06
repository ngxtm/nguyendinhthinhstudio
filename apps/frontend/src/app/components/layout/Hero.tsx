'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'

import heroBg1 from '../../images/hero-bg.jpg'
import heroBg2 from '../../images/hero-bg-2.jpg'
import heroBg3 from '../../images/hero-bg-3.jpg'
import useHoverEffect from '@/app/hooks/useHoverEffect'

interface HeroImage {
  src: string
  alt: string
  priority?: boolean
}

interface HeroProps {
  autoPlayInterval?: number
  images?: HeroImage[]
}

const AppHero: React.FC<HeroProps> = ({ autoPlayInterval = 4000, images: customImages }) => {
  const defaultImages: HeroImage[] = useMemo(
    () => [
      { src: heroBg1.src, alt: 'Hero Image 1', priority: true },
      { src: heroBg2.src, alt: 'Hero Image 2' },
      { src: heroBg3.src, alt: 'Hero Image 3' }
    ],
    []
  )

  const images = customImages || defaultImages
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

  const nextImage = useCallback(() => {
    setCurrentImageIndex(prevIndex => (prevIndex === images.length - 1 ? 0 : prevIndex + 1))
  }, [images.length])

  useEffect(() => {
    if (images.length <= 1) return

    const interval = setInterval(nextImage, autoPlayInterval)
    return () => clearInterval(interval)
  }, [nextImage, images.length, autoPlayInterval])

  useEffect(() => {
    images.forEach((image, index) => {
      if (index !== 0) {
        const img = new window.Image()
        img.src = image.src
      }
    })
  }, [images])

  const hoverEffect = useHoverEffect({
    enableScale: true,
    enableShadow: true,
    enableSlideUp: true
  })

  const getObjectPosition = (index: number): string => {
    if (index === 1) return 'center center'
    if (index === 2) return 'center 35%'
    return 'center 20%'
  }

  return (
    <section
      className="relative h-[40vh] w-full overflow-hidden sm:h-[70vh] md:h-[80vh] lg:h-[88vh] xl:h-[94vh]"
      aria-label="Hero section"
    >
      <div className="absolute inset-0">
        {images.map((image, index) => {
          const nextIndex = currentImageIndex === images.length - 1 ? 0 : currentImageIndex + 1
          const shouldRender = index === currentImageIndex || index === nextIndex
          
          if (!shouldRender) return null
          
          return (
            <div
              key={image.src}
              className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                index === currentImageIndex ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <Image
                src={image.src}
                alt={image.alt}
                fill
                sizes="100vw"
                className="object-cover object-center"
                priority={image.priority || index === 0}
                quality={85}
                onError={() => console.error(`Failed to load image: ${image.src}`)}
                style={{
                  objectPosition: getObjectPosition(index)
                }}
              />
            </div>
          )
        })}
      </div>

      <div className="absolute inset-0 bg-black/30" />

      <div className="relative z-10 flex h-full items-center justify-start px-4 sm:px-6 md:px-8 lg:px-12">
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4 md:ml-2 lg:ml-6 xl:ml-10">
          <button className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-gray-100 sm:px-5 sm:py-2.5 sm:text-base md:px-6 md:py-3">
            Đặt lịch
          </button>
          <button
            className={hoverEffect.getButtonClasses(
              'rounded-lg border-2 border-white bg-transparent px-4 py-2 text-sm font-medium text-white transition-all hover:bg-white hover:text-black sm:px-5 sm:py-2.5 sm:text-base md:px-6 md:py-3'
            )}
            onMouseEnter={hoverEffect.handleMouseEnter}
            onMouseLeave={hoverEffect.handleMouseLeave}
          >
            <span className={hoverEffect.getSpanClasses()}></span>
            <span className={hoverEffect.getTextClasses()}>Bảng giá</span>
          </button>
        </div>
      </div>
    </section>
  )
}

export default AppHero

