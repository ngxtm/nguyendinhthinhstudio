'use client'

import { useState } from 'react'
import { serviceCategories, additionalServiceAndTerms, pricingPackages } from './data/gia-dinh'
import DividerWithText from '@/app/components/common/DividerWithText'
import ServiceCategories from '../components/ServiceCategories'
import PricingModel from '../ca-nhan/components/PricingModel'
import AdditionalServiceAndTerms from '../ca-nhan/components/AdditionalServiceAndTerms'
import type { PricingPrices } from '@ndt/types'
import { applyPublishedPrices } from '@/lib/pricing'

export default function FamilyPrice({ prices }: { prices: PricingPrices }) {
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
    <div className="space-y-10 px-2.5 md:px-16">
      <div className="space-y-12 md:space-y-4">
        <h1 className="mt-8 text-center text-xl font-bold md:text-4xl">BẢNG GIÁ CHỤP ẢNH GIA ĐÌNH TẠI NHA TRANG</h1>
        <div>
          <p className="text-center text-[#888888] dark:text-neutral-400">
            Bảng báo giá chụp ảnh gia đình tại Nha Trang: Bố Mẹ - Bé và gia đình nhiều thế hệ
          </p>
          <p className="text-center text-[#888888] italic dark:text-neutral-400">
            (Baby và Trẻ em dưới 12 tuổi được tặng thêm 2 ảnh PTS/bộ hình)
          </p>
        </div>
        <DividerWithText
          text="NGUYỄN ĐÌNH THỊNH STUDIO"
          textClassName="text-[#888888] dark:text-neutral-400 text-sm md:text-base"
          className="px-1.5"
        />
      </div>
      <div className="px-6">
        <h2 className="text-2xl font-bold text-[#585858] md:text-3xl dark:text-neutral-300">Layout</h2>
        <div className="my-8 h-px w-14 border border-b-2 border-[#bdbdbd] bg-[#bdbdbd]" />
        <p className="text-sm leading-relaxed md:text-[15px]">
          Mỗi Layout, hay còn gọi là concept, theo cách mọi người hiểu là “01 bộ ảnh”, đối với quy chuẩn của NDT Studio
          là bao gồm gần như tất cả mọi thứ liên quan để khách hàng có được hình ảnh mong muốn. Layout có thể Custom
          (tùy chỉnh) để phù hợp với mỗi cá nhân tùy theo Order (đặt hàng) của mỗi người.
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
      <PricingModel pricingPackages={applyPublishedPrices(pricingPackages, prices)} />
      <AdditionalServiceAndTerms service={additionalServiceAndTerms} />
    </div>
  )
}
