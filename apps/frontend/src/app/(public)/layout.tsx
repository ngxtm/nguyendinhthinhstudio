/**
 * Public Layout
 * Layout for public-facing pages with Header and Footer
 */

import Footer from '../components/common/Footer'
import Header from '../components/layout/Header'
import { ReactNode } from 'react'
import { getPublicCategoryNavigation } from '@/lib/server/public-categories'
import { buildPublicNavigation } from '@/lib/public-navigation'

export const revalidate = 60

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const categories = await getPublicCategoryNavigation()
  const navigationItems = buildPublicNavigation(categories)

  return (
    <>
      <Header logoText="NDT STUDIO" showMobileMenu={true} showSocialLinks={true} navigationItems={navigationItems} />

      {/* Main content with padding for fixed header */}
      <main className="pt-11 md:pt-13">{children}</main>

      {/* Footer - TODO: Create Footer component */}
      <Footer />
    </>
  )
}
