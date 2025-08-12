import DividerWithText from '@/app/components/common/DividerWithText'
import Image from 'next/image'
import img from '../images/svp.jpg'

export default function ServiceProcessComponnent() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 sm:px-6 md:px-8 lg:px-12">
      <div className="grid w-full max-w-7xl auto-rows-fr grid-cols-1 gap-10 sm:grid-cols-3">
        <div className="grid grid-cols-1 gap-0 sm:gap-10">
          <div className="my-auto text-center">
            <p className="text-3xl font-bold">1. LIÊN LẠC</p>
            <p className="text-base text-[#888888]">
              Liên hệ với Studio để nhận được tư vấn các gói từ chuyên viên CSKH
            </p>
          </div>
          <div className="my-auto text-center">
            <p className="text-3xl font-bold">2. TƯ VẤN</p>
            <p className="text-base text-[#888888]">
              Nếu có nhu cầu tư vấn chuyên sâu, khách hàng sẽ được tư vấn bởi các chuyên gia trong lĩnh vực (Stylist,
              CD, Makeup,...)
            </p>
          </div>
          <div className="my-auto text-center">
            <p className="text-3xl font-bold">3. ĐẶT LỊCH</p>
            <p className="text-base text-[#888888]">
              Khi chọn được các dịch vụ phù hợp, khách hàng tự do chọn ngày giờ chụp và thanh toán trước
            </p>
          </div>
        </div>
        <div className="relative flex aspect-[18/24] flex-shrink-0 justify-center">
          <Image src={img} alt="svp" fill className="rounded-2xl object-cover" />
        </div>
        <div className="grid grid-cols-1 gap-0 sm:gap-10">
          <div className="my-auto text-center">
            <p className="text-3xl font-bold">4. &quot;ONSET&quot;</p>
            <p className="text-base text-[#888888]">
              Đến Studio theo hướng dẫn của CSKH và trải nghiệm tiền kỳ dịch vụ đã chọn
            </p>
          </div>
          <div className="my-auto text-center">
            <p className="text-3xl font-bold">5. HẬU KỲ</p>
            <p className="text-base text-[#888888]">
              Nhận sự tư vấn và làm việc với các chuyên gia hậu kỳ về hình ảnh, video
            </p>
          </div>
          <div className="my-auto text-center">
            <p className="text-3xl font-bold">6. &quot;FINISH&quot;</p>
            <p className="text-base text-[#888888]">Nhận thành phẩm cuối cùng tại Studio hoặc theo hình thức Online</p>
          </div>
        </div>
      </div>
    </div>
  )
}
