'use client'

import Image, { StaticImageData } from 'next/image'
import Link from 'next/link'
import useHoverEffect from '@/app/hooks/useHoverEffect'

interface OneLayoutSectionProps {
  imgSrc: string | StaticImageData
  title: string
  titleButton: string
  buttonLink?: string
  priority?: boolean
}

export default function OneLayoutSection({ imgSrc, title, titleButton, buttonLink = '#', priority = false }: Readonly<OneLayoutSectionProps>) {
  const hoverEffect = useHoverEffect({
    enableScale: true,
    enableShadow: true,
    enableSlideUp: true
  })

  return (
    <div className="flex h-[600px] w-full items-center justify-center px-4 sm:h-[515px] sm:px-6 md:h-[670px] md:px-8">
      <div className="relative h-[600px] w-full max-w-[270px] overflow-hidden sm:h-[515px] sm:max-w-[387px] md:h-[670px] md:max-w-[550px]">
        <Image
          src={imgSrc}
          alt="One Layout Picture"
          fill
          className="object-cover"
          priority={priority}
          sizes="(max-width: 640px) 270px, (max-width: 768px) 387px, 550px"
        />
        <div className="absolute inset-0 bg-black/15" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <h1 className={`mb-8 text-xl font-bold text-white sm:text-2xl md:text-4xl`}>{title}</h1>
            <Link href={buttonLink}>
              <button
                className={hoverEffect.getButtonClasses()}
                onMouseEnter={hoverEffect.handleMouseEnter}
                onMouseLeave={hoverEffect.handleMouseLeave}
              >
                <span className={hoverEffect.getSpanClasses()}></span>
                <span className={hoverEffect.getTextClasses()}>{titleButton}</span>
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
