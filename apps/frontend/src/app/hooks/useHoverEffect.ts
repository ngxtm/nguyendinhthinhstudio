'use client'

import { useCallback, useState } from 'react'

interface HoverEffectOptions {
  enableScale?: boolean
  enableShadow?: boolean
  enableSlideUp?: boolean
}

interface HoverEffectReturn {
  isHovered: boolean
  handleMouseEnter: () => void
  handleMouseLeave: () => void
  getButtonClasses: (baseClasses?: string) => string
  getSpanClasses: (baseClasses?: string) => string
  getTextClasses: (baseClasses?: string) => string
}

export default function useHoverEffect(options: HoverEffectOptions = {}): HoverEffectReturn {
  const { enableScale = true, enableShadow = true, enableSlideUp = true } = options

  const [isHovered, setIsHovered] = useState(false)

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false)
  }, [])

  const getButtonClasses = useCallback(
    (baseClasses = '') => {
      let classes = `group relative overflow-hidden rounded-md border-2 border-white bg-transparent px-3 py-1 text-white font-semibold tracking-wide transition-all duration-300 ease-in-out ${baseClasses}`
      if (enableScale) {
        classes += 'hover:scale-105'
      }

      if (enableShadow) {
        classes += 'hover:shadow-lg hover:shadow-white/20'
      }

      return classes
    },
    [enableScale, enableShadow]
  )

  const getSpanClasses = useCallback(
    (baseClasses = '') => {
      let classes = `absolute inset-0 bg-white transition-transform duration-300 ease-in-out ${baseClasses}`
      if (enableSlideUp) {
        classes += ' transform translate-y-full group-hover:translate-y-0'
      }

      return classes
    },
    [enableSlideUp]
  )

  const getTextClasses = useCallback((baseClasses = '') => {
    return `relative z-10 transition-colors duration-300 ease-in-out group-hover:text-black ${baseClasses}`
  }, [])

  return {
    isHovered,
    handleMouseEnter,
    handleMouseLeave,
    getButtonClasses,
    getSpanClasses,
    getTextClasses
  }
}
