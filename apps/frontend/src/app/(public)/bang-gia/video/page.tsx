'use client'

import { FaRegCheckCircle } from 'react-icons/fa'
import Link from 'next/link'
import { additionalServiceAndTerms, videoProData, videoSinglePackages } from './data/video'
import DividerWithText from '@/app/components/common/DividerWithText'
import AdditionalServiceAndTerms from '../ca-nhan/components/AdditionalServiceAndTerms'

function SingleVideoSection() {
  return (
    <>
      {videoSinglePackages.map(block => (
        <div key={block.id} className="space-y-6">
          <DividerWithText
            text="NGUYỄN ĐÌNH THỊNH STUDIO"
            textClassName="text-[#888888] text-sm md:text-base"
            className="px-1.5"
          />
          <div className="text-center">
            <h2 className="text-2xl font-bold md:text-3xl">{block.sectionTitle}</h2>
            <p className="text-[#888888] md:text-[15px]">{block.sectionDescription}</p>
          </div>

          <div className="relative">
            <div className="bg-opacity-30 pointer-events-none absolute -inset-y-2 left-1/2 z-10 min-w-[100vw] -translate-x-1/2 bg-[#d8d8d8]" />
            <div className="relative z-20 overflow-hidden rounded-3xl border-2 border-black">
              <div className="bg-[#d8d8d8] px-6 py-3 text-center text-white/90">
                <p className="text-xl font-bold md:text-2xl">{block.cardTitle}</p>
                <p className="text-xs md:text-sm">{block.subTitle}</p>
              </div>
              <div className="space-y-6 px-6 py-8 text-center">
                <p className="text-6xl font-extrabold md:text-7xl">
                  {block.price}
                  <span className="text-sm">k</span>
                </p>
                <p className="-mt-5 text-xs font-semibold text-[#888888] md:text-sm">{block.unit}</p>

                <div className="mx-auto max-w-3xl space-y-3">
                  {block.features.map(item => (
                    <p
                      key={item}
                      className="flex items-center justify-center gap-2 text-sm font-bold text-[#585858] md:text-[15px]"
                    >
                      <FaRegCheckCircle className="h-[18px] w-[18px]" />
                      {item}
                    </p>
                  ))}
                </div>

                <div className="pt-2">
                  <Link
                    href="/lien-he#ho-tro-nhanh"
                    className="inline-block rounded-full bg-[#7b7b7b] px-6 py-2 font-semibold text-white transition-colors hover:bg-black"
                  >
                    Hỗ Trợ Nhanh
                  </Link>
                </div>

                <p className="text-xs font-semibold text-[#888888]">Xem mục các dịch vụ phụ để thêm tùy chọn</p>
              </div>
            </div>
          </div>
        </div>
      ))}
    </>
  )
}

function VideoProSection() {
  const { headerTitle, headerDescription, cards, footerNote } = videoProData
  return (
    <div className="space-y-6">
      <DividerWithText
        text="NGUYỄN ĐÌNH THỊNH STUDIO"
        textClassName="text-[#888888] text-sm md:text-base"
        className="px-1.5"
      />
      <div className="text-center">
        <h2 className="text-2xl font-bold md:text-3xl">{headerTitle}</h2>
        <p className="text-[#888888] md:text-[15px]">{headerDescription}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map(card => (
          <div key={card.id} className="flex flex-col overflow-hidden rounded-xl border-2 border-[#888888]">
            {/* Header gray bar */}
            <div className="bg-[#d8d8d8] px-6 py-4 text-center">
              <h3 className="text-2xl font-bold text-white">{card.title}</h3>
              <p className="text-xs text-white/90 md:text-sm">{card.subTitle}</p>
            </div>
            <div className="flex-1 space-y-6 px-6 py-6 text-center">
              <p className="text-6xl font-extrabold">{card.price}</p>
              <div className="space-y-2">
                {card.features.map(f => (
                  <p key={f} className="text-sm font-bold text-[#585858] md:text-[15px]">
                    {f}
                  </p>
                ))}
              </div>
            </div>
            <Link
              href="/lien-he#ho-tro-nhanh"
              className="mx-auto mb-4 block w-fit rounded-4xl bg-[#cccccc] px-6 py-2 text-center font-semibold text-[#585858] transition-colors hover:text-white"
            >
              Hỗ Trợ Nhanh
            </Link>
            <p className="px-4 pb-4 text-center text-xs font-semibold text-[#b9b9b9] md:px-6">{footerNote}</p>
          </div>
        ))}
      </div>
      
    </div>
  )
}

export default function VideoPrice() {
  return (
    <div className="space-y-10 px-2.5 md:px-16">
      <div className="space-y-12 md:space-y-4">
        <h1 className="mt-8 text-center text-xl font-bold md:text-4xl">BẢNG GIÁ DỊCH VỤ VIDEO CÁ NHÂN</h1>
        <p className="text-center text-[#888888]">Bảng báo giá quay video cá nhân</p>
      </div>

      <SingleVideoSection />
      <VideoProSection />
      <AdditionalServiceAndTerms service={additionalServiceAndTerms} />
    </div>
  )
}
