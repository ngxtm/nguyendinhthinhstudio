'use client'

import Image, { StaticImageData } from 'next/image'
import Link from 'next/link'
import AnimatedContent from '../common/AnimatedContent'

interface TwoLayoutSectionProps {
  pic1src?: string | StaticImageData
  pic1alt?: string
  pic1title?: string
  pic1titleButton?: string
  pic1ButtonLink?: string
  pic2src?: string | StaticImageData
  pic2alt?: string
  pic2title?: string
  pic2titleButton?: string
  pic2ButtonLink?: string
  pic1width?: number
  pic1height?: number
  pic2width?: number
  pic2height?: number
  containerGap?: number
  mobileStackVertical?: boolean
}

export default function TwoLayoutSection({
  pic1src = '',
  pic1alt = 'Ảnh 1',
  pic1title = 'KHÁM PHÁ BỘ ẢNH',
  pic1titleButton = 'NỮ',
  pic1ButtonLink = '#',
  pic2src = '',
  pic2alt = 'Ảnh 2',
  pic2title = 'KHÁM PHÁ BỘ ẢNH',
  pic2titleButton = 'Nam',
  pic2ButtonLink = '#',
  pic1width = 100,
  pic1height = 100,
  pic2width = 100,
  pic2height = 100,
  containerGap = 24,
  mobileStackVertical = true
}: Readonly<TwoLayoutSectionProps>) {
  return (
    <div className="w-full overflow-x-hidden px-4 sm:px-6 lg:px-8">
      <div
        className={` ${
          mobileStackVertical
            ? 'flex flex-col items-center justify-center md:flex-row'
            : 'flex flex-row items-center justify-center overflow-x-auto'
        } `}
        style={{
          gap: `${containerGap}px`,
          ...(mobileStackVertical ? {} : { minWidth: 'fit-content' })
        }}
      >
        {/* Card 1 */}
        <AnimatedContent
          distance={800}
          direction="horizontal"
          reverse={true}
          threshold={0.1}
          duration={1.5}
          initialOpacity={0}
          animateOpacity={true}
        >
          <div
            className="relative overflow-hidden shadow-lg h-[60vh] lg:h-[85vh]"
            style={{
              width: `min(${pic1width}px, calc(100vw - 2rem))`,
              aspectRatio: `${pic1width} / ${pic1height}`,
              minWidth: mobileStackVertical ? '280px' : `${Math.min(pic1width, 280)}px`,
              minHeight: mobileStackVertical ? '350px' : `${Math.min(pic1height, 350)}px`
            }}
          >
            {pic1src && (
              <Image
                src={pic1src}
                alt={pic1alt}
                fill
                className="object-cover transition-opacity duration-300"
                priority={true}
                placeholder="empty"
                sizes="(max-width: 640px) 90vw, (max-width: 768px) 45vw, (max-width: 1024px) 40vw, 35vw"
              />
            )}

            <div className="absolute inset-0 bg-black/20" />
            <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-300">
              <div className="px-4 text-center">
                <h2 className="mb-2 text-lg leading-tight font-bold text-white sm:mb-4 sm:text-xl md:text-2xl">
                  {pic1title}
                </h2>
                <Link href={pic1ButtonLink}>
                  <button className="rounded-md border-2 border-white bg-transparent px-3 py-1.5 text-sm font-semibold text-white transition-all duration-300 hover:bg-white hover:text-black active:scale-95 sm:px-4 sm:py-2 sm:text-base">
                    {pic1titleButton}
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </AnimatedContent>

        {/* Card 2 */}
        <AnimatedContent
          distance={800}
          direction="horizontal"
          duration={1.5}
          threshold={0.1}
          initialOpacity={0}
          animateOpacity={true}
        >
          <div
            className="relative overflow-hidden shadow-lg h-[60vh] lg:h-[85vh]"
            style={{
              width: `min(${pic2width}px, calc(100vw - 2rem))`,
              aspectRatio: `${pic2width} / ${pic2height}`,
              minWidth: mobileStackVertical ? '280px' : `${Math.min(pic2width, 280)}px`,
              minHeight: mobileStackVertical ? '350px' : `${Math.min(pic2height, 350)}px`
            }}
          >
            {pic2src && (
              <Image
                src={pic2src}
                alt={pic2alt}
                fill
                className="object-cover transition-opacity duration-300"
                priority={true}
                placeholder="empty"
                sizes="(max-width: 640px) 90vw, (max-width: 768px) 45vw, (max-width: 1024px) 40vw, 35vw"
              />
            )}

            <div className="absolute inset-0 bg-black/20" />
            <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-300">
              <div className="px-4 text-center">
                <h2 className="mb-2 text-lg leading-tight font-bold text-white sm:mb-4 sm:text-xl md:text-2xl">
                  {pic2title}
                </h2>
                <Link href={pic2ButtonLink}>
                  <button className="rounded-md border-2 border-white bg-transparent px-3 py-1.5 text-sm font-semibold text-white transition-all duration-300 hover:bg-white hover:text-black active:scale-95 sm:px-4 sm:py-2 sm:text-base">
                    {pic2titleButton}
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </AnimatedContent>
      </div>
    </div>
  )
}
