import Image from 'next/image'
import img from '../images/svp.jpg'
import AnimatedContent from '@/app/components/common/AnimatedContent'

export default function ServiceProcessComponnent() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10 sm:px-6 sm:py-0 md:px-8 lg:px-12">
      <div className="grid w-full max-w-7xl grid-cols-1 gap-10 sm:auto-rows-fr sm:grid-cols-3">
        <AnimatedContent
          direction="horizontal"
          reverse={true}
          duration={1.5}
          distance={250}
          threshold={0.1}
          className="h-fit sm:h-full"
        >
          <div className="flex h-full flex-col gap-8 sm:justify-around">
            <div className="text-center">
              <p className="text-3xl font-bold">1. LIÊN LẠC</p>
              <p className="text-base text-[#888888] dark:text-neutral-400">
                Liên hệ với Studio để nhận được tư vấn các gói từ chuyên viên CSKH
              </p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold">2. TƯ VẤN</p>
              <p className="text-base text-[#888888] dark:text-neutral-400">
                Nếu có nhu cầu tư vấn chuyên sâu, khách hàng sẽ được tư vấn bởi các chuyên gia trong lĩnh vực (Stylist,
                CD, Makeup,...)
              </p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold">3. ĐẶT LỊCH</p>
              <p className="text-base text-[#888888] dark:text-neutral-400">
                Khi chọn được các dịch vụ phù hợp, khách hàng tự do chọn ngày giờ chụp và thanh toán trước
              </p>
            </div>
          </div>
        </AnimatedContent>
        <AnimatedContent direction="vertical" duration={1.5} distance={250} threshold={0.1}>
          <div className="relative flex aspect-[18/24] flex-shrink-0 justify-center">
            <Image src={img} alt="svp" fill className="rounded-2xl object-cover" />
          </div>
        </AnimatedContent>
        <AnimatedContent
          direction="horizontal"
          duration={1.5}
          distance={250}
          threshold={0.1}
          className="h-fit sm:h-full"
        >
          <div className="flex h-full flex-col gap-8 sm:justify-around">
            <div className="text-center">
              <p className="text-3xl font-bold">4. &quot;ONSET&quot;</p>
              <p className="text-base text-[#888888] dark:text-neutral-400">
                Đến Studio theo hướng dẫn của CSKH và trải nghiệm tiền kỳ dịch vụ đã chọn
              </p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold">5. HẬU KỲ</p>
              <p className="text-base text-[#888888] dark:text-neutral-400">
                Nhận sự tư vấn và làm việc với các chuyên gia hậu kỳ về hình ảnh, video
              </p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold">6. &quot;FINISH&quot;</p>
              <p className="text-base text-[#888888] dark:text-neutral-400">
                Nhận thành phẩm cuối cùng tại Studio hoặc theo hình thức Online
              </p>
            </div>
          </div>
        </AnimatedContent>
      </div>
    </div>
  )
}
