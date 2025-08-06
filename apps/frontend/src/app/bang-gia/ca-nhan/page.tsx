import Footer from '@/app/components/common/Footer'
import Header from '@/app/components/layout/Header'

export default function IndividualPrice() {
  return (
    <>
      <div className="px-6 md:px-16">
        <Header logoText="NguyenDinhThinh" showMobileMenu={true} />
        <div className="space-y-6 pt-16 sm:pt-16 md:space-y-4">
          <h1 className="mt-8 text-center text-xl font-bold md:text-4xl">BẢNG GIÁ CÁ NHÂN</h1>
          <div>
            <p className="text-center text-[#888888]">
              Bảng báo giá chụp ảnh cá nhân áp dụng cho Nữ, Nam, Mẹ Bầu, Baby
            </p>
            <p className="text-center text-[#888888] italic">
              (Baby và Trẻ em dưới 12 tuổi được tặng thêm 2 ảnh PTS/bộ hình)
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}
