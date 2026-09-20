import type { Image } from '@/lib/api/albums'

export type ResponsiveImageProps = {
  src: string
  srcSet?: string
  sizes: string
  width?: number
  height?: number
}

const RESPONSIVE_VARIANTS = [
  { key: 'smallUrl', maxEdge: 800 },
  { key: 'mediumUrl', maxEdge: 1200 },
  { key: 'largeUrl', maxEdge: 1920 }
] as const

function isPositiveDimension(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function getFitDimensions(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / width, maxEdge / height)

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  }
}

function getFallbackSource(image: Image): string {
  return image.smallUrl || image.mediumUrl || image.largeUrl || image.xlargeUrl || image.thumbnailUrl
}

/**
 * Build responsive props from the variants already supplied by the API.
 *
 * The API variants use imgproxy's `fit` resize, so a portrait image requested
 * as 800x800 is narrower than 800px. Width descriptors are therefore derived
 * from the source dimensions instead of the variant box dimensions.
 */
export function getResponsiveImageProps(image: Image, sizes: string): ResponsiveImageProps {
  const props: ResponsiveImageProps = {
    src: getFallbackSource(image),
    sizes
  }

  const sourceWidth = image.width
  const sourceHeight = image.height
  if (!isPositiveDimension(sourceWidth) || !isPositiveDimension(sourceHeight)) {
    return props
  }

  const seenWidths = new Set<number>()
  const srcSet = RESPONSIVE_VARIANTS.flatMap(({ key, maxEdge }) => {
    const url = image[key]
    if (!url) return []

    const dimensions = getFitDimensions(sourceWidth, sourceHeight, maxEdge)
    if (seenWidths.has(dimensions.width)) return []

    seenWidths.add(dimensions.width)
    return [`${url} ${dimensions.width}w`]
  })

  return {
    ...props,
    ...(srcSet.length > 0 ? { srcSet: srcSet.join(', ') } : {}),
    width: sourceWidth,
    height: sourceHeight
  }
}
