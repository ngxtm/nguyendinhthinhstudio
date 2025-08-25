'use client'

import Footer from '@/app/components/common/Footer'
import Header from '@/app/components/layout/Header'
import Image from 'next/image'
import { useState } from 'react'
import { faq } from './data/chinh-sach'
import img from '../images/gioi-thieu-2.png'
export default function Policy() {
  const [openFAQ, setOpenFAQ] = useState<string | null>(null)

  const toggleFAQ = (id: string) => {
    setOpenFAQ(openFAQ === id ? null : id)
  }

  return (
    <div className="min-h-screen bg-white">
      <Header logoText="NguyenDinhThinh" showMobileMenu={true} />
      <div className="px-4 pt-20 md:px-8 md:pt-32 lg:px-16">
        {/* Header Section */}
        <div className="mb-12 md:mb-16">
          <h1 className="mb-4 text-4xl leading-tight font-bold text-black md:text-6xl lg:text-7xl">
            CHÍNH SÁCH BẢO HÀNH & DỊCH VỤ
          </h1>
          <p className="text-lg font-medium text-gray-500 md:text-xl lg:text-2xl">Tinh tế • Tin cậy • Chuyên nghiệp</p>
        </div>

        <div className='relative aspect-[7/3] h-[70vh] mb-8 rounded-xl overflow-hidden mx-auto'>
          <Image src={img} alt="chinh-sach" fill className='object-cover object-[47%_20%] md:object-[10%_40%]'  priority/>
        </div>

        {/* Main Policy Cards Section */}
        <div className="mb-16 md:mb-20">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
            {/* Card 1: Hình ảnh */}
            <div className="space-y-4">
              <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-gray-100">
                <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-white">
                  <svg className="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-xl font-bold text-black">Hình ảnh.</h3>
                <p className="leading-relaxed text-gray-600">
                  Gửi qua Google Drive, gồm ảnh gốc đã lọc hoặc toàn bộ JPG.
                </p>
              </div>
            </div>

            {/* Card 2: Thời gian chính sửa */}
            <div className="space-y-4">
              <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-gray-100">
                <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-white">
                  <svg className="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-xl font-bold text-black">Thời gian chính sửa.</h3>
                <p className="leading-relaxed text-gray-600">
                  Ảnh cá nhân: 3–7 ngày.
                  <br />
                  Ảnh cưới: 3–30 ngày
                  <br />
                  (tùy ngày chọn file).
                </p>
              </div>
            </div>

            {/* Card 3: Chính sách fix lỗi */}
            <div className="space-y-4">
              <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-gray-100">
                <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-white">
                  <svg className="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-xl font-bold text-black">Chính sách fix lỗi.</h3>
                <p className="leading-relaxed text-gray-600">
                  Mỗi file bảo hành fix tối đa 3 lần trong thời gian chính sửa.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Section */}
        <div className="mb-16 md:mb-20">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-12">
            <div className="text-center">
              <div className="mb-2 text-5xl font-bold text-black md:text-6xl lg:text-7xl">3T</div>
              <p className="text-lg text-gray-600">Giữ bản gốc</p>
            </div>
            <div className="text-center">
              <div className="mb-2 text-5xl font-bold text-black md:text-6xl lg:text-7xl">6T</div>
              <p className="text-lg text-gray-600">Giữ file chính</p>
            </div>
            <div className="text-center">
              <div className="mb-2 text-5xl font-bold text-black md:text-6xl lg:text-7xl">3x</div>
              <p className="text-lg text-gray-600">Số lần bảo hành</p>
            </div>
          </div>
        </div>

        {/* Service Cards Section */}
        <div className="mb-16 md:mb-20">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {/* Chụp ngoại cảnh */}
            <div className="space-y-4">
              <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-gray-100">
                <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-white">
                  <svg className="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="mb-3 text-xl font-bold text-black">Chụp ngoại cảnh.</h3>
                <p className="text-sm leading-relaxed text-gray-600">
                  Chụp trưa: +10%. Resort/địa điểm tính phí: khách tự trả. Trên 10km: tính phụ phí đi lại. Trẻ: tối đa
                  30% phụ thu. Không hoàn cọc.
                </p>
              </div>
            </div>

            {/* Chụp studio */}
            <div className="space-y-4">
              <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-gray-100">
                <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-white">
                  <svg className="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="mb-3 text-xl font-bold text-black">Chụp studio.</h3>
                <p className="text-sm leading-relaxed text-gray-600">
                  Chi phí phát sinh: khách thành toán. Mặt phụ kiện: bởi thương gia mới. Trẻ: tối đa 30% phụ thu. Không
                  hoàn cọc.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mb-16 md:mb-20">
          <div className="mx-auto max-w-2xl space-y-4">
            {faq.map((item) => (
              <div key={item.id} className="rounded-xl bg-gray-50 overflow-hidden">
                <button
                  onClick={() => toggleFAQ(item.id)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-100 transition-colors"
                >
                  <span className="font-medium text-gray-700">{item.question}</span>
                  <svg 
                    className={`h-5 w-5 text-gray-400 transition-transform duration-300 ${
                      openFAQ === item.id ? 'rotate-45' : ''
                    }`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </button>
                <div className={`overflow-hidden transition-all duration-600 ${
                  openFAQ === item.id ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                }`}>
                  <div className="px-4 pb-4">
                    <div className="bg-white p-4 rounded-lg">
                      <p className="text-gray-600 leading-relaxed">{item.answer}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom spacing */}
        <div className="h-20 md:h-32"></div>
      </div>
      <Footer />
    </div>
  )
}
