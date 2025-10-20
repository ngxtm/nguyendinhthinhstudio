/**
 * Public Layout
 * Layout for public-facing pages with Header and Footer
 */

import Footer from '../components/common/Footer'
import Header from '../components/layout/Header'
import { ReactNode } from 'react'

export default function PublicLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <>
      <Header
        logoText="NDT STUDIO"
        showMobileMenu={true}
        showSocialLinks={true}
      />

      {/* Main content with padding for fixed header */}
      <main className="pt-11 md:pt-13">
        {children}
      </main>

      {/* Footer - TODO: Create Footer component */}
      <Footer/>
    </>
  )
}
