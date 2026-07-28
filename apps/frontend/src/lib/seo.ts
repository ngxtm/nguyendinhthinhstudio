import type { Metadata } from 'next'

export const SITE_URL = 'https://ndtstudio.site'

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString()
}

export function createPublicMetadata({
  title,
  description,
  path
}: {
  title: string
  description: string
  path: string
}): Metadata {
  const canonical = absoluteUrl(path)
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
      url: canonical
    }
  }
}
