import type { Metadata } from 'next'
import { Geist, Geist_Mono, Inter, Montserrat } from 'next/font/google'
import localFont from 'next/font/local'
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
  title: 'NguyenDinhThinh Studio',
  description: '...'
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${kapakana.variable} ${montserrat.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  )
}
