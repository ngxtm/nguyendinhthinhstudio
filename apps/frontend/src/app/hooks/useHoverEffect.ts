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
      let classes = `group relative overflow-hidden rounded-lg border border-white bg-transparent px-3 py-1 text-white font-light transition-all duration-700 ease-out backdrop-blur-sm ${baseClasses}`
      if (enableScale) {
        classes += ' hover:scale-[1.01] hover:border-opacity-80'
      }

      if (enableShadow) {
        classes += ' hover:shadow-lg hover:shadow-white/5'
      }

      return classes
    },
    [enableScale, enableShadow]
  )

  const getSpanClasses = useCallback(
    (baseClasses = '') => {
      let classes = `absolute inset-0 bg-gradient-to-r from-white/95 to-gray-50/95 transition-all duration-700 ease-out opacity-0 transform ${baseClasses}`
      if (enableSlideUp) {
        classes += ' group-hover:opacity-100 group-hover:scale-105'
      }

      return classes
    },
    [enableSlideUp]
  )

  const getTextClasses = useCallback((baseClasses = '') => {
    return `relative z-10 transition-all duration-700 ease-out group-hover:text-slate-800 group-hover:tracking-[0.15em] group-hover:font-medium group-hover:drop-shadow-sm ${baseClasses}`
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
