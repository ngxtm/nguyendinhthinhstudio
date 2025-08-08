'use client'

import Image, { StaticImageData } from 'next/image'
import Link from 'next/link'
import useHoverEffect from '@/app/hooks/useHoverEffect'

interface OneLayoutSectionProps {
  readonly imgSrc: string | StaticImageData
  readonly title: string
  readonly titleButton: string
}

export default function OneLayoutSection({ imgSrc, title, titleButton }: OneLayoutSectionProps) {
  const hoverEffect = useHoverEffect({
    enableScale: true,
    enableShadow: true,
    enableSlideUp: true
  })

  return (
    <div className="flex h-[400px] w-full items-center justify-center sm:h-[640px] md:h-[800px]">
        <div className="relative h-[400px] w-[300px] overflow-hidden sm:h-[640px] sm:w-[480px] md:h-[800px] md:w-[600px]">
            <Image src={imgSrc} alt="One Layout Picture" fill className="object-cover" />
            <div className="absolute inset-0 bg-black/15" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <h1 className={`mb-8 text-xl sm:text-2xl md:text-4xl font-bold text-white`}>{title}</h1>
                <Link href="/lien-he#ho-tro-nhanh">
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
