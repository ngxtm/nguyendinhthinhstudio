'use client'
import DividerWithText from '../components/common/DividerWithText'
import Footer from '../components/common/Footer'
import Header from '../components/layout/Header'
import ServiceCategories from './components/ServiceCategories'
import { useState } from 'react'
import TablePricePerCategory from './components/TablePricePerCategory'
import { serviceCategories, premiumCategories, standardCategories } from './data/bang-gia'

export default function Pricing() {
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

  return (
    <>
      <div className="px-6 md:px-16">
        <Header logoText="NguyenDinhThinh" showMobileMenu={true} />
        <div className="space-y-6 pt-16 sm:pt-16 md:space-y-4">
          <h1 className="mt-8 text-center text-xl font-bold md:text-4xl">BẢNG GIÁ DỊCH VỤ</h1>
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
            <div className="grid grid-cols-1 gap-12 md:gap-32 md:grid-cols-2">
              <div className="space-y-6">
                <h2 className="text-3xl font-bold text-[#585858]">Premium</h2>
                <div className="h-px w-14 border border-b-2 border-[#bdbdbd]" />
                <p className="text-[15px] leading-relaxed">
                  Premium là gói dịch vụ hình ảnh cao cấp của TVB. Phương châm của Premium là &quot;Like a Stars&quot;.
                  Các Layout Premium được sáng tạo, kiểm duyệt nghiêm ngặt trước khi xuất bản để thương mại. Hình ảnh
                  của Premium được thiết kế phù hợp với phương châm hoàn mỹ, và tỏa sáng như một ngôi sao. Đây là phiên
                  bản Original nhất của TVB. Sử dụng những thiết bị và công nghệ cao cấp nhất trong ngành nhiếp ảnh sẽ
                  cho phép thực hiện được những layout có độ khó cực kỳ cao như những bộ ảnh của các ngôi sao, của các
                  idol.
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
                  Standard là gói dịch vụ hình ảnh tiết kiệm nhất của TVB. Được thiết kế để dành riêng cho những khách
                  hàng trẻ trung, năng động. Mang trong nội tại tinh thần: &quot;Make it easy&quot;, &quot;Do it
                  faster&quot;, nhưng vẫn giữ được chất lượng thuần nhất với chất lượng hình ảnh của TVB. Standard làm
                  mọi thứ trở nên đơn giản hơn để mọi người có thể dễ dàng tiếp cận hơn với nhiếp ảnh cao cấp. Sử dụng
                  thiết bị và công nghệ cận cao cấp cho phép gói chụp thực hiện được gần như mọi concept.
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
            <TablePricePerCategory />
          </div>
          <DividerWithText textClassName="text-[#888888] text-sm" className="mb-16" />
        </div>
      </div>
      <Footer />
    </>
  )
}
