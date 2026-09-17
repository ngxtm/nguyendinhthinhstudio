'use client'
import Script from 'next/script'
import { absoluteUrl, SITE_URL } from '@/lib/seo'
import DividerWithText from '../../components/common/DividerWithText'
import NavigationLinks from '../../components/common/NavigationLinks'
import ServiceCategories from './components/ServiceCategories'
import { useState } from 'react'
import TablePricePerCategory from './components/TablePricePerCategory'
import { serviceCategories, premiumCategories, standardCategories } from './data/bang-gia'

interface PricingClientProps {
  publicCategorySlugs: string[]
}

export default function PricingClient({ publicCategorySlugs }: Readonly<PricingClientProps>) {
  const [openAccordions, setOpenAccordions] = useState<Set<string>>(new Set())

  const toggleAccordion = (id: string) => {
    setOpenAccordions(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  // JSON-LD for Service Offerings
  const servicesSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: [
      {
        '@type': 'Service',
        '@id': absoluteUrl('/bang-gia#premium'),
        name: 'Premium Photography Package - NDT Studio',
        description:
          'Gói dịch vụ hình ảnh cao cấp với phương châm "Like a Stars". Sử dụng thiết bị và công nghệ cao cấp nhất trong ngành nhiếp ảnh.',
        provider: {
          '@type': 'LocalBusiness',
          name: 'Nguyễn Đình Thịnh Studio',
          telephone: '+84899990497',
          address: {
            '@type': 'PostalAddress',
            streetAddress: '111/1 Thống Nhất',
            addressLocality: 'Nha Trang',
            addressRegion: 'Khánh Hòa',
            addressCountry: 'VN'
          }
        },
        serviceType: 'Photography',
        areaServed: {
          '@type': 'Country',
          name: 'Vietnam'
        },
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'VND',
          lowPrice: '3000000',
          highPrice: '20000000',
          offerCount: '10'
        }
      },
      {
        '@type': 'Service',
        '@id': absoluteUrl('/bang-gia#standard'),
        name: 'Standard Photography Package - NDT Studio',
        description:
          'Gói dịch vụ hình ảnh tiết kiệm với tinh thần "Make it easy", "Do it faster". Phù hợp với khách hàng trẻ trung, năng động.',
        provider: {
          '@type': 'LocalBusiness',
          name: 'Nguyễn Đình Thịnh Studio'
        },
        serviceType: 'Photography',
        areaServed: {
          '@type': 'Country',
          name: 'Vietnam'
        },
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'VND',
          lowPrice: '2000000',
          highPrice: '15000000',
          offerCount: '10'
        }
      },
      {
        '@type': 'Service',
        '@id': absoluteUrl('/bang-gia#wedding'),
        name: 'Wedding Photography - NDT Studio',
        description: 'Dịch vụ chụp ảnh cưới chuyên nghiệp với phong cách nghệ thuật độc đáo',
        provider: {
          '@type': 'LocalBusiness',
          name: 'Nguyễn Đình Thịnh Studio'
        },
        serviceType: 'Wedding Photography',
        areaServed: {
          '@type': 'Country',
          name: 'Vietnam'
        }
      },
      {
        '@type': 'Service',
        '@id': absoluteUrl('/bang-gia#couple'),
        name: 'Couple Photography - NDT Studio',
        description: 'Dịch vụ chụp ảnh cặp đôi, đôi bạn thân, nhóm bạn với nhiều concept độc đáo',
        provider: {
          '@type': 'LocalBusiness',
          name: 'Nguyễn Đình Thịnh Studio'
        },
        serviceType: 'Couple Photography',
        areaServed: {
          '@type': 'Country',
          name: 'Vietnam'
        }
      }
    ]
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
        name: 'Bảng giá',
        item: absoluteUrl('/bang-gia')
      }
    ]
  }

  return (
    <>
      <div className="px-6 md:px-16">
        <div className="space-y-6 sm:space-y-4">
          <h1 className="mt-8 text-center text-xl font-bold md:text-4xl">BẢNG GIÁ DỊCH VỤ</h1>

          {/* Navigation Links */}
          <div className="mt-6 mb-4 flex justify-center">
            <NavigationLinks
              links={[
                { label: 'Cá Nhân', href: '/bang-gia/ca-nhan' },
                { label: 'Couple', href: '/bang-gia/couple' },
                { label: 'Wedding', href: '/bang-gia/wedding' },
                { label: 'Video', href: '/bang-gia/video' }
              ]}
              linkClassName="text-neutral-600 hover:text-neutral-900 font-medium transition-colors"
              separatorClassName="text-neutral-300"
            />
          </div>

          <DividerWithText text="NGUYỄN ĐÌNH THỊNH STUDIO" textClassName="text-[#888888] text-sm" />

          {/* Art - Beauty - Fashion */}
          <div className="mx-auto mt-16 max-w-4xl">
            <div className="text-center">
              <h2 className="mb-4 text-3xl font-bold text-[#585858]">Art - Beauty - Fashion</h2>
              <div className="my-4 h-px w-14 border border-b-2 border-[#bdbdbd] bg-[#bdbdbd]" />
              <p className="text-start text-[15px] leading-relaxed">
                Bảng giá của NDT Studio không được thiết lập dựa trên những tiêu chuẩn cũ mà mọi người thường thấy tại
                các Studio/Photographer thông thường. Mà việc phân định giá sẽ dựa trên những tiêu chuẩn của các thương
                hiệu cao cấp toàn cầu.
              </p>
            </div>

            <ServiceCategories
              categories={serviceCategories}
              openAccordions={openAccordions}
              onToggleAccordion={toggleAccordion}
            />
          </div>

          {/* Premium And Standard */}
          <div className="mx-auto mt-16 max-w-5xl md:mt-40">
            <div className="grid grid-cols-1 gap-12 md:grid-cols-2 md:gap-32">
              <div className="space-y-6">
                <h2 className="text-3xl font-bold text-[#585858]">Premium</h2>
                <div className="h-px w-14 border border-b-2 border-[#bdbdbd]" />
                <p className="text-[15px] leading-relaxed">
                  Premium là gói dịch vụ hình ảnh cao cấp của NDT Studio. Phương châm của Premium là &quot;Like a
                  Stars&quot;. Các Layout Premium được sáng tạo, kiểm duyệt nghiêm ngặt trước khi xuất bản để thương
                  mại. Hình ảnh của Premium được thiết kế phù hợp với phương châm hoàn mỹ, và tỏa sáng như một ngôi sao.
                  Đây là phiên bản Original nhất của NDT Studio. Sử dụng những thiết bị và công nghệ cao cấp nhất trong
                  ngành nhiếp ảnh sẽ cho phép thực hiện được những layout có độ khó cực kỳ cao như những bộ ảnh của các
                  ngôi sao, của các idol.
                </p>
                <ServiceCategories
                  categories={premiumCategories}
                  openAccordions={openAccordions}
                  onToggleAccordion={toggleAccordion}
                />
              </div>
              <div className="space-y-6">
                <h2 className="text-3xl font-bold text-[#585858]">Standard</h2>
                <div className="h-px w-14 border border-b-2 border-[#bdbdbd]" />
                <p className="text-[15px] leading-relaxed">
                  Standard là gói dịch vụ hình ảnh tiết kiệm nhất của NDT Studio. Được thiết kế để dành riêng cho những
                  khách hàng trẻ trung, năng động. Mang trong nội tại tinh thần: &quot;Make it easy&quot;, &quot;Do it
                  faster&quot;, nhưng vẫn giữ được chất lượng thuần nhất với chất lượng hình ảnh của NDT Studio.
                  Standard làm mọi thứ trở nên đơn giản hơn để mọi người có thể dễ dàng tiếp cận hơn với nhiếp ảnh cao
                  cấp. Sử dụng thiết bị và công nghệ cận cao cấp cho phép gói chụp thực hiện được gần như mọi concept.
                </p>
                <ServiceCategories
                  categories={standardCategories}
                  openAccordions={openAccordions}
                  onToggleAccordion={toggleAccordion}
                />
              </div>
            </div>
          </div>

          {/* Detail Price */}
          <div className="mx-auto my-16 max-w-6xl md:mt-40">
            <TablePricePerCategory publicCategorySlugs={publicCategorySlugs} />
          </div>
          <DividerWithText textClassName="text-[#888888] text-sm" className="mb-16" />
        </div>
      </div>

      {/* JSON-LD Schemas */}
      <Script
        id="services-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(servicesSchema) }}
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
