import type { Metadata } from 'next'

export const SITE_URL = 'https://ndtstudio.com.vn'

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString()
}

export const DEFAULT_SOCIAL_IMAGE = absoluteUrl('/share_home_v3.jpg')

export function createPublicMetadata({
  title,
  description,
  path,
  image
}: {
  title: string
  description: string
  path: string
  image?: string
}): Metadata {
  const canonical = absoluteUrl(path)
  const socialImage = image || DEFAULT_SOCIAL_IMAGE

  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      locale: 'vi_VN',
      siteName: 'NDT Studio',
      title,
      description,
      url: canonical,
      images: [socialImage]
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [socialImage]
    }
  }
}
