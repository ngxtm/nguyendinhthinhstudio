interface SiteImage {
  src: string
  alt: string
  priority?: boolean
}

//** HERO IMAGE */

const heroImagePaths = [
  '/images/home/hero-01.webp',
  '/images/home/hero-02.webp',
  '/images/home/hero-03.webp',
  '/images/home/hero-04.webp'
]

//** COLLECTION */

const collectionImagePaths = [
  '/images/home/collection-01.webp',
  '/images/home/collection-02.webp',
  '/images/home/collection-03.webp',
  '/images/home/collection-04.webp',
  '/images/home/collection-05.webp',
  '/images/home/collection-06.webp'
]

export const heroImages: SiteImage[] = heroImagePaths.map((src, index) => ({
  src,
  alt: `Hero Image ${index + 1}`,
  priority: index === 0
}))

export const collectionImages: SiteImage[] = collectionImagePaths.map((src, index) => ({
  src,
  alt: `Collection Image ${index + 1}`,
  priority: index === 0
}))
