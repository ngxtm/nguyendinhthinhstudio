'use client'

import Image, { StaticImageData } from 'next/image'
import AnimatedContent from '../common/AnimatedContent'
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
    <div className="h-[400px] w-[300px] sm:h-[640px] sm:w-[480px] md:h-[800px] md:w-full">
      <div className="flex items-center justify-center">
        <AnimatedContent distance={160} direction="vertical" duration={3} threshold={0.24}>
          <div
            className="relative overflow-hidden"
            style={{
              width: `600px`,
              height: `800px`
            }}
          >
            <Image src={imgSrc} alt="One Layout Picture" fill className="object-cover" />
            <div className="absolute inset-0 bg-black/15" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <h1 className={`mb-8 text-4xl font-bold text-white`}>{title}</h1>
                <button
                  className={hoverEffect.getButtonClasses()}
                  onMouseEnter={hoverEffect.handleMouseEnter}
                  onMouseLeave={hoverEffect.handleMouseLeave}
                >
                  <span className={hoverEffect.getSpanClasses()}></span>
                  <span className={hoverEffect.getTextClasses()}>{titleButton}</span>
                </button>
              </div>
            </div>
          </div>
        </AnimatedContent>
      </div>
    </div>
  )
}
