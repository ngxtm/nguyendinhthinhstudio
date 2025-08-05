import { House, Clock, Phone } from 'lucide-react'
import DividerWithText from '../components/common/DividerWithText'
import Footer from '../components/common/Footer'
import Header from '../components/layout/Header'
import Image from 'next/image'
import googleMapsIcon from '../images/icons/google-maps-icon.png'
import googleIcon from '../images/icons/google-icon.png'
import Support from './components/Support'
import SeeMore from './components/SeeMore'
import AnimatedContent from '../components/common/AnimatedContent'

export default function Contact() {
  return (
    <>
      <div className="px-6 md:px-16">
        <Header logoText="NguyenDinhThinh" showMobileMenu={true} />
        <div className="space-y-6 pt-16 sm:pt-16 md:space-y-4">
          <h1 className="mt-8 text-center text-xl font-bold md:text-4xl">LIÊN HỆ VỚI NGUYỄN ĐÌNH THỊNH STUDIO</h1>
          <DividerWithText text="NGUYỄN ĐÌNH THỊNH STUDIO" textClassName="text-[#888888] text-sm" />
          <div className="flex w-full flex-col gap-10 md:flex-row">
            {/* Bản đồ Google Maps */}
            <div className="w-full lg:w-2/3">
              <div className="h-64 w-full overflow-hidden rounded-lg shadow-lg md:h-80 lg:h-96">
                <iframe
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3898.946853268119!2d109.18676147543009!3d12.251875888001273!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x317067006f0cee6b%3A0xf5972a38ccf94667!2zTmd1eeG7hW4gxJDDrG5oIFRo4buLbmggU3R1ZGlv!5e0!3m2!1svi!2s!4v1754279632948!5m2!1svi!2s"
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
            <div className="mt-6 w-full space-y-6 lg:mt-0 lg:w-3/8">
              <div className="bg-white p-6 shadow-lg">
                <h2 className="font-kapakana mb-4 text-center text-3xl text-[#727070] md:text-4xl">
                  Nguyen Dinh Thinh Studio
                </h2>

                <div className="space-y-3 text-gray-600">
                  <div className="flex items-start gap-2 text-sm md:text-base">
                    <House size={20} />
                    <div>
                      <p className="font-bold">Địa chỉ:</p>
                      <p>111/1 Thống Nhất, Phường Nha Trang, Tỉnh Khánh Hoà</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 text-sm md:text-base">
                    <Clock size={20} />
                    <div>
                      <p className="font-bold">Giờ hoạt động:</p>
                      <p>07:00 - 17:00 (Thứ 2 - Chủ nhật)</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 text-sm md:text-base">
                    <Phone size={20} />
                    <div>
                      <p className="font-bold">Hotline:</p>
                      <a href="tel:+84899990497" className="text-gray-600 hover:underline">
                        0899 990 497
                      </a>
                    </div>
                  </div>
                </div>

                <div className="mt-6 border-t border-gray-200 pt-4">
                  <p className="mb-3 gap-2 text-sm text-gray-500">
                    <strong>Lưu ý:</strong> Trong các ứng dụng (Google Maps, Apple Maps), có thể gõ &quot;Nguyễn Đình
                    Thịnh Studio&quot; để tìm đúng địa điểm.
                  </p>

                  <div className="flex flex-col justify-between gap-4 md:flex-row md:text-sm">
                    <a
                      href="https://maps.app.goo.gl/aQKTojhw51Bo8LMW6"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-fit items-center gap-2 rounded-lg bg-[#888888] px-4 py-2 text-sm text-white shadow-md duration-200 hover:bg-gradient-to-r hover:from-yellow-300 hover:to-yellow-500 hover:text-black"
                    >
                      <Image src={googleMapsIcon} alt="Google Maps" width={20} height={20} className="h-5 w-5" />
                      Mở trong Google Maps
                    </a>
                    <a
                      href="https://g.page/nguyendinhthinhstudio?share"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-fit items-center gap-2 rounded-lg bg-[#888888] px-4 py-2 text-sm text-white transition-colors duration-200 hover:bg-gradient-to-r hover:from-yellow-300 hover:to-yellow-500 hover:text-black"
                    >
                      <Image src={googleIcon} alt="Google" width={20} height={20} className="h-5 w-5" />
                      Tìm kiếm trên Google
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <DividerWithText text="LIÊN HỆ NHANH" textClassName="text-[#888888] text-sm" className="mt-4" />
        <Support />
        <DividerWithText textClassName="text-[#888888] text-sm" className="mt-6" />
        <AnimatedContent direction="vertical" duration={1.5}>
          <SeeMore className="mt-12" />
        </AnimatedContent>
        <DividerWithText textClassName="text-[#888888] text-sm" className="my-12" />
      </div>
      <Footer />
    </>
  )
}
