import DividerWithText from '../components/common/DividerWithText'
import Footer from '../components/common/Footer'
import Header from '../components/layout/Header'
import Support from './components/Support'
import SeeMore from './components/SeeMore'
import AnimatedContent from '../components/common/AnimatedContent'

export default function Contact() {
  return (
    <>
      <div className="px-6 md:px-16">
        <Header logoText="NguyenDinhThinh" showMobileMenu={true} />
        <div className="space-y-6 pt-16 sm:pt-16 md:space-y-4">
          <h1 className="mt-8 text-center text-xl font-bold md:text-4xl">
            LIÊN HỆ VỚI <br className="md:hidden" />
            NGUYỄN ĐÌNH THỊNH STUDIO
          </h1>
          <DividerWithText text="THÔNG TIN LIÊN HỆ" textClassName="text-[#888888] text-sm" />
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
            <div className="w-full space-y-8 lg:w-3/8">
              <div className="space-y-6">
                <h2 className="font-kapakana text-center text-2xl text-gray-800 md:text-3xl">
                  Nguyen Dinh Thinh Studio
                </h2>

                <div className="space-y-4 text-sm text-gray-600">
                  <div className="border-b border-gray-100 pb-4">
                    <p className="mb-2 text-xs tracking-wider text-gray-400 uppercase">Địa chỉ</p>
                    <p className="leading-relaxed">111/1 Thống Nhất, Phường Nha Trang, Tỉnh Khánh Hoà</p>
                  </div>

                  <div className="border-b border-gray-100 pb-4">
                    <p className="mb-2 text-xs tracking-wider text-gray-400 uppercase">Giờ hoạt động</p>
                    <p className="leading-relaxed">07:00 - 17:00 (Thứ 2 - Chủ nhật)</p>
                  </div>

                  <div className="border-b border-gray-100 pb-4">
                    <p className="mb-2 text-xs tracking-wider text-gray-400 uppercase">Hotline</p>
                    <a href="tel:+84899990497" className="text-gray-600 transition-colors hover:text-gray-800">
                      0899 990 497
                    </a>
                  </div>
                </div>

                <div id="ho-tro-nhanh">
                  <p className="mb-4 text-xs text-gray-400">
                    Lưu ý: Trong các ứng dụng (Google Maps, Apple Maps), có thể gõ &quot;Nguyễn Đình Thịnh Studio&quot;
                    để tìm đúng địa điểm.
                  </p>

                  <div className="flex flex-col gap-3 md:flex-row">
                    <a
                      href="https://maps.app.goo.gl/aQKTojhw51Bo8LMW6"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center rounded border border-gray-200 px-4 py-2 text-sm text-gray-600 transition-all hover:border-gray-300 hover:bg-gray-50 md:w-fit"
                    >
                      Mở trong Google Maps
                    </a>

                    <a
                      href="https://g.page/nguyendinhthinhstudio?share"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center rounded border border-gray-200 px-4 py-2 text-sm text-gray-600 transition-all hover:border-gray-300 hover:bg-gray-50 md:w-fit"
                    >
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
