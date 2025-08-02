'use client'

import Image, { StaticImageData } from 'next/image'
import AnimatedContent from '../common/AnimatedContent'
import { useState } from 'react'

interface TwoLayoutSectionProps {
  readonly pic1src?: string | StaticImageData
  readonly pic1alt?: string
  readonly pic1title?: string
  readonly pic1titleButton?: string
  readonly pic2src?: string | StaticImageData
  readonly pic2alt?: string
  readonly pic2title?: string
  readonly pic2titleButton?: string
  readonly pic1width?: number
  readonly pic1height?: number
  readonly pic2width?: number
  readonly pic2height?: number
  readonly containerGap?: number
}

export default function TwoLayoutSection({
  pic1src = '',
  pic1alt = 'Ảnh 1',
  pic1title = 'KHÁM PHÁ BỘ ẢNH',
  pic1titleButton = 'NỮ',
  pic2src = '',
  pic2alt = 'Ảnh 2',
  pic2title = 'KHÁM PHÁ BỘ ẢNH',
  pic2titleButton = 'Nam',
  pic1width = 100,
  pic1height = 100,
  pic2width = 100,
  pic2height = 100,
  containerGap = 24
}: TwoLayoutSectionProps) {
  const [pic1Loaded, setPic1Loaded] = useState(false)
  const [pic2Loaded, setPic2Loaded] = useState(false)
  return (
    <div className="w-full overflow-x-hidden">
      <div className="flex items-center justify-center" style={{ gap: `${containerGap}px` }}>
        {/* Card 1 */}
        <AnimatedContent
          distance={160}
          direction="horizontal"
          reverse={true}
          duration={1.5}
          delay={0.5}
          threshold={0.1}
        >
          <div
            className="relative overflow-hidden bg-gray-200"
            style={{
              width: `${pic1width}px`,
              height: `${pic1height}px`
            }}
          >
            {/* Loading placeholder */}
            {!pic1Loaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-600"></div>
              </div>
            )}
            
            {pic1src && (
              <Image 
                src={pic1src} 
                alt={pic1alt} 
                fill 
                className={`object-cover transition-opacity duration-300 ${pic1Loaded ? 'opacity-100' : 'opacity-0'}`}
                priority={true}
                placeholder="blur"
                blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGRkqGx0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyJckliyjqTzSlT54b6bk+h0R//2Q=="
                onLoad={() => setPic1Loaded(true)}
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            )}
            
            <div className="absolute inset-0 bg-black/20" />
            <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${pic1Loaded ? 'opacity-100' : 'opacity-0'}`}>
              <div className="text-center">
                <h2 className="mb-4 text-2xl font-bold text-white">{pic1title}</h2>
                <button className="rounded-md border-2 border-white bg-transparent px-4 py-2 font-semibold text-white transition-all duration-300 hover:bg-white hover:text-black">
                  {pic1titleButton}
                </button>
              </div>
            </div>
          </div>
        </AnimatedContent>

        {/* Card 2 */}
        <AnimatedContent distance={160} direction="horizontal" duration={1.5} delay={0.5} threshold={0.1}>
          <div
            className="relative overflow-hidden bg-gray-200"
            style={{
              width: `${pic2width}px`,
              height: `${pic2height}px`
            }}
          >
            {/* Loading placeholder */}
            {!pic2Loaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-600"></div>
              </div>
            )}
            
            {pic2src && (
              <Image 
                src={pic2src} 
                alt={pic2alt} 
                fill 
                className={`object-cover transition-opacity duration-300 ${pic2Loaded ? 'opacity-100' : 'opacity-0'}`}
                priority={true}
                placeholder="blur"
                blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGRkqGx0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyJckliyjqTzSlT54b6bk+h0R//2Q=="
                onLoad={() => setPic2Loaded(true)}
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            )}
            
            <div className="absolute inset-0 bg-black/20" />
            <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${pic2Loaded ? 'opacity-100' : 'opacity-0'}`}>
              <div className="text-center">
                <h2 className="mb-4 text-2xl font-bold text-white">{pic2title}</h2>
                <button className="rounded-md border-2 border-white bg-transparent px-4 py-2 font-semibold text-white transition-all duration-300 hover:bg-white hover:text-black">
                  {pic2titleButton}
                </button>
              </div>
            </div>
          </div>
        </AnimatedContent>
      </div>
    </div>
  )
}
