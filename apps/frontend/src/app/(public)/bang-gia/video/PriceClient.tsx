'use client'

import { FaRegCheckCircle } from 'react-icons/fa'
import Link from 'next/link'
import { additionalServiceAndTerms, videoProData, videoSinglePackages } from './data/video'
import DividerWithText from '@/app/components/common/DividerWithText'
import AdditionalServiceAndTerms from '../ca-nhan/components/AdditionalServiceAndTerms'
import type { PricingPrices } from '@ndt/types'
import { formatPriceVnd, publishedPrice } from '@/lib/pricing'

function SingleVideoSection({ prices }: { prices: PricingPrices }) {
  return (
    <>
      {videoSinglePackages.map(block => (
        <div key={block.id} className="space-y-6">
          <DividerWithText
            text="NGUYỄN ĐÌNH THỊNH STUDIO"
            textClassName="text-[#888888] dark:text-neutral-400 text-sm md:text-base"
            className="px-1.5"
          />
          <div className="text-center">
            <h2 className="text-2xl font-bold md:text-3xl">{block.sectionTitle}</h2>
            <p className="text-[#888888] md:text-[15px] dark:text-neutral-400">{block.sectionDescription}</p>
          </div>

          <div className="relative">
            <div className="bg-opacity-30 pointer-events-none absolute -inset-y-2 left-1/2 z-10 min-w-[100vw] -translate-x-1/2 bg-[#d8d8d8] dark:bg-neutral-800" />
            <div className="relative z-20 overflow-hidden rounded-3xl border-2 border-black">
              <div className="bg-[#d8d8d8] px-6 py-3 text-center text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100">
                <p className="text-xl font-bold md:text-2xl">{block.cardTitle}</p>
                <p className="text-xs md:text-sm">{block.subTitle}</p>
              </div>
              <div className="space-y-6 px-6 py-8 text-center">
                <p className="text-3xl font-extrabold tabular-nums sm:text-5xl">
                  {formatPriceVnd(publishedPrice(prices, block.cardTitle))}
                </p>
                <p className="-mt-5 text-xs font-semibold text-[#888888] md:text-sm dark:text-neutral-400">
                  {block.unit}
                </p>

                <div className="mx-auto max-w-3xl space-y-3">
                  {block.features.map(item => (
                    <p
                      key={item}
                      className="flex items-center justify-center gap-2 text-sm font-bold text-[#585858] md:text-[15px] dark:text-neutral-300"
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

                <p className="text-xs font-semibold text-[#888888] dark:text-neutral-400">
                  Xem mục các dịch vụ phụ để thêm tùy chọn
                </p>
              </div>
            </div>
          </div>
        </div>
      ))}
    </>
  )
}

function VideoProSection({ prices }: { prices: PricingPrices }) {
  const { headerTitle, headerDescription, cards, footerNote } = videoProData
  return (
    <div className="space-y-6">
      <DividerWithText
        text="NGUYỄN ĐÌNH THỊNH STUDIO"
        textClassName="text-[#888888] dark:text-neutral-400 text-sm md:text-base"
        className="px-1.5"
      />
      <div className="text-center">
        <h2 className="text-2xl font-bold md:text-3xl">{headerTitle}</h2>
        <p className="text-[#888888] md:text-[15px] dark:text-neutral-400">{headerDescription}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map(card => (
          <div key={card.id} className="flex flex-col overflow-hidden rounded-xl border-2 border-[#888888]">
            {/* Header gray bar */}
            <div className="bg-[#d8d8d8] px-6 py-4 text-center dark:bg-neutral-800">
              <h3 className="text-2xl font-bold text-neutral-800 dark:text-neutral-100">{card.title}</h3>
              <p className="text-xs text-neutral-700 md:text-sm dark:text-neutral-300">{card.subTitle}</p>
            </div>
            <div className="flex-1 space-y-6 px-6 py-6 text-center">
              <p className="text-3xl font-extrabold md:text-4xl">
                {formatPriceVnd(publishedPrice(prices, card.title))}
              </p>
              <div className="space-y-2">
                {card.features.map(f => (
                  <p key={f} className="text-sm font-bold text-[#585858] md:text-[15px] dark:text-neutral-300">
                    {f}
                  </p>
                ))}
              </div>
            </div>
            <Link
              href="/lien-he#ho-tro-nhanh"
              className="mx-auto mb-4 block w-fit rounded-4xl bg-[#cccccc] px-6 py-2 text-center font-semibold text-[#585858] transition-colors hover:bg-neutral-700 hover:text-white dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
            >
              Hỗ Trợ Nhanh
            </Link>
            <p className="px-4 pb-4 text-center text-xs font-semibold text-neutral-600 md:px-6 dark:text-neutral-400">
              {footerNote}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function VideoPrice({ prices }: { prices: PricingPrices }) {
  return (
    <div className="space-y-10 px-2.5 md:px-16">
      <div className="space-y-12 md:space-y-4">
        <h1 className="mt-8 text-center text-xl font-bold md:text-4xl">BẢNG GIÁ QUAY VIDEO TẠI NHA TRANG</h1>
        <p className="text-center text-[#888888] dark:text-neutral-400">
          Bảng báo giá quay video cá nhân tại Nha Trang
        </p>
      </div>

      <SingleVideoSection prices={prices} />
      <VideoProSection prices={prices} />
      <AdditionalServiceAndTerms service={additionalServiceAndTerms} />
    </div>
  )
}
