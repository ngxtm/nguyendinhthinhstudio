import Script from 'next/script'
import DividerWithText from '../../components/common/DividerWithText'
import NavigationLinks from '../../components/common/NavigationLinks'
import Support from './components/Support'
import SeeMore from './components/SeeMore'
import AnimatedContent from '../../components/common/AnimatedContent'
import { businessProfile, createBusinessEntitySchema } from '@/config/business'
import { absoluteUrl, createPublicMetadata, SITE_URL } from '@/lib/seo'

export const metadata = createPublicMetadata({
  title: 'Liên hệ và đặt lịch | NDT Studio',
  description: 'Liên hệ Nguyễn Đình Thịnh Studio tại Nha Trang để được tư vấn, đặt lịch chụp ảnh và hỗ trợ dịch vụ.',
  path: '/lien-he'
})

export default function Contact() {
  // JSON-LD for LocalBusiness
  const localBusinessSchema = {
    ...createBusinessEntitySchema({
      type: 'LocalBusiness',
      sameAs: [
        'https://www.facebook.com/nguyendinhthinhstudio',
        'https://instagram.com/ndtstudio',
        'https://maps.app.goo.gl/RoGc5qKWbE9gmMzX7'
      ]
    }),
    '@id': businessProfile.id,
    name: businessProfile.displayName,
    image: absoluteUrl('/logo.png'),
    description:
      'Studio chụp ảnh chuyên nghiệp tại Nha Trang - Chuyên chụp ảnh cưới, couple, gia đình, beauty với phong cách nghệ thuật độc đáo',
    url: SITE_URL,
    priceRange: '₫₫₫',
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 12.245696487956922,
      longitude: 109.1734630109475
    }
  }

  // Breadcrumb Schema
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Trang chủ',
        item: SITE_URL
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Liên hệ',
        item: absoluteUrl('/lien-he')
      }
    ]
  }

  return (
    <>
      <div className="px-6 md:px-16">
        <div className="space-y-6 sm:space-y-4">
          <h1 className="mt-8 text-center text-xl font-bold md:text-4xl">
            LIÊN HỆ VỚI <br className="md:hidden" />
            NGUYỄN ĐÌNH THỊNH STUDIO
          </h1>

          {/* Navigation Links */}
          <div className="mt-6 mb-4 flex justify-center">
            <NavigationLinks
              links={[
                { label: 'Tư Vấn', href: '/lien-he' },
                { label: 'Xem Bảng Giá', href: '/bang-gia' },
                { label: 'Thư Viện', href: '/thu-vien' }
              ]}
              linkClassName="text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 font-medium transition-colors"
              separatorClassName="text-neutral-300"
            />
          </div>

          <DividerWithText text="THÔNG TIN LIÊN HỆ" textClassName="text-[#888888] dark:text-neutral-400 text-sm" />
          <div className="flex w-full flex-col items-center gap-10 md:flex-row">
            {/* Bản đồ Google Maps */}
            <div className="w-full lg:w-2/3">
              <div className="h-64 w-full overflow-hidden rounded-lg shadow-lg md:h-80 lg:h-96">
                <iframe
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3899.0381455583592!2d109.1734630109475!3d12.245696487956922!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x317067006f0cee6b%3A0xf5972a38ccf94667!2sNDTStudio!5e0!3m2!1svi!2stw!4v1790130833434!5m2!1svi!2stw"
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Vị trí NguyenDinhThinh Studio"
                />
              </div>
            </div>

            {/* Thông tin liên hệ */}
            <div className="w-full space-y-8 lg:w-1/3">
              <div className="space-y-6">
                <h2 className="font-kapakana text-center text-2xl text-gray-800 dark:text-gray-100 md:text-3xl">
                  Nguyen Dinh Thinh Studio
                </h2>

                <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
                  <div className="border-b border-gray-100 dark:border-gray-700 pb-4">
                    <p className="mb-2 text-xs tracking-wider text-gray-400 uppercase">Địa chỉ</p>
                    <p className="leading-relaxed">{businessProfile.addressDisplay}</p>
                  </div>

                  <div className="border-b border-gray-100 dark:border-gray-700 pb-4">
                    <p className="mb-2 text-xs tracking-wider text-gray-400 uppercase">Giờ hoạt động</p>
                    <p className="leading-relaxed">{businessProfile.openingHoursDisplay}</p>
                  </div>

                  <div className="border-b border-gray-100 dark:border-gray-700 pb-4">
                    <p className="mb-2 text-xs tracking-wider text-gray-400 uppercase">Hotline</p>
                    <a
                      href={`tel:${businessProfile.telephone}`}
                      className="text-gray-600 dark:text-gray-300 transition-colors hover:text-gray-800 dark:hover:text-gray-100"
                    >
                      {businessProfile.telephoneDisplay}
                    </a>
                  </div>

                  <div className="border-b border-gray-100 dark:border-gray-700 pb-4">
                    <p className="mb-2 text-xs tracking-wider text-gray-400 uppercase">Chia sẻ trải nghiệm</p>
                    <p className="leading-relaxed">
                      Nếu bạn đã sử dụng dịch vụ, hãy chia sẻ trải nghiệm thực tế của mình trên Google Maps.
                    </p>
                  </div>
                </div>

                <div id="ho-tro-nhanh">
                  <p className="mb-4 text-xs text-gray-400">
                    Lưu ý: Trong các ứng dụng (Google Maps, Apple Maps), có thể gõ &quot;Nguyễn Đình Thịnh Studio&quot;
                    để tìm đúng địa điểm.
                  </p>

                  <div className="flex flex-col gap-3 md:flex-row">
                    <a
                      href="https://maps.app.goo.gl/RoGc5qKWbE9gmMzX7"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center rounded border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 transition-all hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-950 md:w-fit"
                    >
                      Mở trong Google Maps
                    </a>

                    <a
                      href="https://g.page/nguyendinhthinhstudio?share"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center rounded border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 transition-all hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-950 md:w-fit"
                    >
                      Tìm kiếm trên Google
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <DividerWithText text="LIÊN HỆ NHANH" textClassName="text-[#888888] dark:text-neutral-400 text-sm" className="mt-4" />
        <Support />
        <DividerWithText textClassName="text-[#888888] dark:text-neutral-400 text-sm" className="mt-6" />
        <AnimatedContent direction="vertical" duration={2} delay={0.2} threshold={0.2}>
          <SeeMore className="mt-12" />
        </AnimatedContent>
        <DividerWithText textClassName="text-[#888888] dark:text-neutral-400 text-sm" className="my-12" />
      </div>

      {/* JSON-LD Schemas */}
      <Script
        id="local-business-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
        strategy="beforeInteractive"
      />
      <Script
        id="breadcrumb-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
        strategy="beforeInteractive"
      />
    </>
  )
}
