import type { Metadata } from 'next'
import { Geist, Geist_Mono, Inter, Montserrat } from 'next/font/google'
import localFont from 'next/font/local'
import Script from 'next/script'
import './globals.css'

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
  metadataBase: new URL('https://ndtstudio.site'),
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
    address: false,
    telephone: true
  },
  openGraph: {
    type: 'website',
    locale: 'vi_VN',
    url: 'https://ndtstudio.site',
    siteName: 'NDT Studio',
    title: 'NDT Studio - Nhiếp ảnh chuyên nghiệp',
    description:
      'Studio chụp ảnh chuyên nghiệp tại Nha Trang. Chuyên chụp ảnh cưới, ảnh gia đình, beauty, couple với phong cách nghệ thuật độc đáo.',
    images: [
      {
        url: '/og-image.jpg', // Bạn cần thêm ảnh này vào public folder
        width: 1200,
        height: 630,
        alt: 'NDT Studio'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NDT Studio - Nhiếp ảnh chuyên nghiệp',
    description: 'Studio chụp ảnh chuyên nghiệp tại Việt Nam. Chuyên chụp ảnh cưới, ảnh gia đình, beauty, couple.',
    creator: '@ndtstudio',
    images: ['/og-image.jpg']
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
  },

  verification: {
    // Thêm sau khi verify với Google Search Console
    google: 'your-google-verification-code'
    // yandex: 'your-yandex-verification-code',
    // bing: 'your-bing-verification-code',
  }
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  // JSON-LD for Organization
  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'NDT Studio',
    url: 'https://ndtstudio.site',
    logo: 'https://ndtstudio.site/logo.png',
    description: 'Studio chụp ảnh chuyên nghiệp tại Việt Nam',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'VN'
    },
    sameAs: [
      // Thêm các social media links sau
      'https://facebook.com/nguyendinhthinh.foto',
      'https://instagram.com/nguyendinhthinh.foto',
      'https://www.tiktok.com/@nguyendinhthinhstudio'
    ]
  }

  return (
    <html lang="vi">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${kapakana.variable} ${montserrat.variable} antialiased`}
      >
        {children}

        <Script
          id="organization-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
          strategy="beforeInteractive"
        />
      </body>
    </html>
  )
}
