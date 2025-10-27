'use client'

import React, { useRef, useLayoutEffect, ReactNode } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

interface AnimatedContentProps {
  children: ReactNode
  distance?: number
  direction?: 'vertical' | 'horizontal'
  reverse?: boolean
  duration?: number
  ease?: string | ((progress: number) => number)
  initialOpacity?: number
  animateOpacity?: boolean
  scale?: number
  threshold?: number
  delay?: number
  onComplete?: () => void
  finalOpacity?: number
  className?: string
}

const AnimatedContent: React.FC<AnimatedContentProps> = ({
  children,
  distance = 100,
  direction = 'vertical',
  reverse = false,
  duration = 0.8,
  ease = 'power3.out',
  initialOpacity = 0,
  animateOpacity = true,
  scale = 1,
  threshold = 0.1,
  delay = 0,
  onComplete,
  finalOpacity = 1,
  className
}) => {
  const ref = useRef<HTMLDivElement>(null)
  const tweenRef = useRef<gsap.core.Tween | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      gsap.set(el, {
        x: 0,
        y: 0,
        scale: 1,
        opacity: animateOpacity ? finalOpacity : 1,
        clearProps: 'transform'
      })
      el.style.visibility = 'visible'
      return
    }

    const isTouchDevice = ScrollTrigger.isTouch
    const axis = direction === 'horizontal' ? 'x' : 'y'
    const rawOffset = reverse ? -distance : distance
    const offset = isTouchDevice ? rawOffset * 0.65 : rawOffset
    const resolvedDuration = isTouchDevice ? Math.min(duration, 0.6) : duration
    const startPct = (1 - threshold) * 100

    gsap.set(el, {
      [axis]: offset,
      scale,
      opacity: animateOpacity ? initialOpacity : 1
    })

    tweenRef.current = gsap.to(el, {
      [axis]: 0,
      scale: 1,
      opacity: animateOpacity ? finalOpacity : 1,
      duration: resolvedDuration,
      ease,
      delay,
      onStart: () => {
        if (animateOpacity && initialOpacity === 0) {
          el.style.visibility = 'visible'
        }
      },
      onComplete,
      scrollTrigger: {
        trigger: el,
        start: `top ${startPct}%`,
        toggleActions: 'play none none none',
        once: true,
        invalidateOnRefresh: true
      }
    })

    return () => {
      tweenRef.current?.scrollTrigger?.kill()
      tweenRef.current?.kill()
      tweenRef.current = null
    }
  }, [
    distance,
    direction,
    reverse,
    duration,
    ease,
    initialOpacity,
    animateOpacity,
    scale,
    threshold,
    delay,
    onComplete,
    finalOpacity
  ])

  return (
    <div 
      ref={ref} 
      style={{ 
        opacity: animateOpacity ? initialOpacity : 1,
        visibility: animateOpacity && initialOpacity === 0 ? 'hidden' : 'visible',
        willChange: `transform${animateOpacity ? ', opacity' : ''}`
      }}
      className={className}
    >
      {children}
    </div>
  )
}

export default AnimatedContent
