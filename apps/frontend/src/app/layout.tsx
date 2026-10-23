import type { Metadata } from 'next'
import { Geist, Geist_Mono, Inter, Montserrat } from 'next/font/google'
import localFont from 'next/font/local'
import Script from 'next/script'
import './globals.css'
import { businessProfile, createBusinessEntitySchema } from '@/config/business'
import { DEFAULT_SOCIAL_IMAGE, SITE_URL } from '@/lib/seo'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin']
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin']
})

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900']
})

const kapakana = localFont({
  src: './fonts/Kapakana-VariableFont_wght.ttf',
  variable: '--font-kapakana',
  display: 'swap'
})

const montserrat = Montserrat({
  variable: '--font-montserrat',
  subsets: ['latin'],
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900']
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'NDT Studio - Nhiếp ảnh chuyên nghiệp',
    template: '%s | NDT Studio'
  },
  icons: {
    icon: '/favicon.jpg'
  },
  description:
    'NDT Studio - Studio chụp ảnh chuyên nghiệp tại Việt Nam. Chuyên chụp ảnh cưới, ảnh gia đình, beauty, couple với phong cách nghệ thuật độc đáo. Đội ngũ nhiếp ảnh giàu kinh nghiệm, trang thiết bị hiện đại.',
  keywords: [
    'chụp ảnh',
    'nhiếp ảnh',
    'studio',
    'NDT Studio',
    'ảnh cưới',
    'ảnh gia đình',
    'beauty photography',
    'couple photography',
    'chụp ảnh chuyên nghiệp',
    'studio chụp ảnh',
    'nha trang',
    'ảnh coupe',
    'chụp ảnh kỷ yếu'
  ].join(', '),
  authors: [{ name: 'NDT Studio' }],
  creator: 'NDT Studio',
  publisher: 'NDT Studio',
  formatDetection: {
    email: false,
    address: true,
    telephone: true
  },
  openGraph: {
    type: 'website',
    locale: 'vi_VN',
    url: SITE_URL,
    siteName: 'NDT Studio',
    title: 'NDT Studio - Nhiếp ảnh chuyên nghiệp',
    description:
      'Studio chụp ảnh chuyên nghiệp tại Nha Trang. Chuyên chụp ảnh cưới, ảnh gia đình, beauty, couple với phong cách nghệ thuật độc đáo.',
    images: [
      {
        url: DEFAULT_SOCIAL_IMAGE,
        alt: 'NDT Studio'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NDT Studio - Nhiếp ảnh chuyên nghiệp',
    description: 'Studio chụp ảnh chuyên nghiệp tại Việt Nam. Chuyên chụp ảnh cưới, ảnh gia đình, beauty, couple.',
    creator: '@ndtstudio',
    images: [DEFAULT_SOCIAL_IMAGE]
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1
    }
  }
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  // JSON-LD for Organization
  const organizationJsonLd = {
    ...createBusinessEntitySchema({
      type: 'Organization',
      sameAs: [
        // Thêm các social media links sau
        'https://www.facebook.com/nguyendinhthinhstudio',
        'https://instagram.com/nguyendinhthinh.foto',
        'https://www.tiktok.com/@nguyendinhthinhstudio'
      ]
    }),
    '@id': businessProfile.id,
    name: businessProfile.brandName,
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    description: 'Studio chụp ảnh chuyên nghiệp tại Việt Nam'
  }

  return (
    <html lang="vi" data-scroll-behavior="smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${kapakana.variable} ${montserrat.variable} antialiased`}
      >
        {children}

        <Script
          id="organization-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </body>
    </html>
  )
}
