'use client'
import DividerWithText from '@/app/components/common/DividerWithText'
import Footer from '@/app/components/common/Footer'
import Header from '@/app/components/layout/Header'
import ServiceCategories from '../components/ServiceCategories'
import { useState } from 'react'
import { serviceCategories } from './data/ca-nhan'
import PricingModel from './components/PricingModel'

export default function IndividualPrice() {
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
      <div className="space-y-10 md:px-16">
        <Header logoText="NguyenDinhThinh" showMobileMenu={true} />
        <div className="space-y-12 pt-16 sm:pt-16 md:space-y-4">
          <h1 className="mt-8 text-center text-xl font-bold md:text-4xl">BẢNG GIÁ CÁ NHÂN</h1>
          <div>
            <p className="text-center text-[#888888]">
              Bảng báo giá chụp ảnh cá nhân áp dụng cho Nữ, Nam, Mẹ Bầu, Baby
            </p>
            <p className="text-center text-[#888888] italic">
              (Baby và Trẻ em dưới 12 tuổi được tặng thêm 2 ảnh PTS/bộ hình)
            </p>
          </div>
          <DividerWithText
            text="NGUYỄN ĐÌNH THỊNH STUDIO"
            textClassName="text-[#888888] text-sm md:text-base"
            className="px-1.5"
          />
        </div>
        <div className="px-6">
          <h2 className="text-2xl font-bold text-[#585858] md:text-3xl">Layout</h2>
          <div className="my-8 h-px w-14 border border-b-2 border-[#bdbdbd] bg-[#bdbdbd]" />
          <p className="text-sm leading-relaxed md:text-[15px]">
            Mỗi Layout, hay còn gọi là concept, theo cách mọi người hiểu là “01 bộ ảnh”, đối với quy chuẩn của TVB là
            bao gồm gần như tất cả mọi thứ liên quan để khách hàng có được hình ảnh mong muốn. Layout có thể Custom (tùy
            chỉnh) để phù hợp với mỗi cá nhân tùy theo Order (đặt hàng) của mỗi người.
          </p>
          <div className="my-10">
            <ServiceCategories
              borderDisabled={true}
              categories={serviceCategories}
              openAccordions={openAccordions}
              onToggleAccordion={toggleAccordion}
            />
          </div>
        </div>
        <PricingModel />
      </div>
      <Footer />
    </>
  )
}
