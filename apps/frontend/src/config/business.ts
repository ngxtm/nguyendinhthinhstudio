import { absoluteUrl } from '@/lib/seo'

const address = {
  '@type': 'PostalAddress',
  streetAddress: '111/1 Thống Nhất',
  addressLocality: 'Nha Trang',
  addressRegion: 'Khánh Hòa',
  postalCode: '650000',
  addressCountry: 'VN'
} as const

const openingHours = {
  '@type': 'OpeningHoursSpecification',
  dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  opens: '07:00',
  closes: '17:00'
} as const

export const businessProfile = {
  id: absoluteUrl('/#business'),
  displayName: 'Nguyễn Đình Thịnh Studio',
  brandName: 'NDT Studio',
  telephone: '+84983885473',
  telephoneDisplay: '0983 885 473',
  address,
  addressDisplay: '111/1 Thống Nhất, Phường Nha Trang, Tỉnh Khánh Hoà',
  openingHours,
  openingHoursDisplay: '07:00 - 17:00 (Thứ 2 - Chủ nhật)',
  social: {
    // Social accounts remain page-owned until the two existing sets are confirmed.
    approvedSameAs: [] as readonly string[]
  }
} as const

export function createBusinessEntitySchema({
  type,
  sameAs
}: {
  type: 'Organization' | 'LocalBusiness'
  sameAs: readonly string[]
}) {
  return {
    '@context': 'https://schema.org',
    '@type': type,
    '@id': businessProfile.id,
    name: businessProfile.displayName,
    url: absoluteUrl('/'),
    telephone: businessProfile.telephone,
    address: { ...businessProfile.address },
    openingHoursSpecification: [
      {
        ...businessProfile.openingHours,
        dayOfWeek: [...businessProfile.openingHours.dayOfWeek]
      }
    ],
    sameAs: [...sameAs]
  }
}
