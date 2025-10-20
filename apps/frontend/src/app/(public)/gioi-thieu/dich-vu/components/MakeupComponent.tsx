import Image from 'next/image'
import img from '../images/makeup-1.jpg'
import img2 from '../images/makeup-2.jpg'
import AnimatedContent from '@/app/components/common/AnimatedContent'

export default function MakeupComponent() {
  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <div className="grid min-h-[80vh] grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-16">
          {/* Header Section */}
          <AnimatedContent direction="horizontal" reverse={true} duration={1.5} distance={250} threshold={0.1}>
            <div className="space-y-4 text-center lg:text-left">
              <p className="text-sm tracking-wide text-[#888888]">ĐỘI HOÁ TRANG NHÂN VẬT</p>
              <h1 className="text-4xl leading-tight font-bold sm:text-5xl lg:text-6xl xl:text-7xl">
                Makeup & <br /> HairStylist
              </h1>
              <hr className="mx-auto w-1/5 border-b-2 border-[#585858] lg:mx-0" />
            </div>
          </AnimatedContent>

          {/* Content Cards Section */}
          <div className="grid auto-rows-fr grid-cols-1 gap-8 sm:grid-cols-2">
            <AnimatedContent direction="vertical" reverse={true} duration={1.5} distance={250} threshold={0.1}>
              <div className="flex h-full flex-col gap-6">
                <div className="relative order-1 aspect-[3/4] sm:aspect-[3/5] flex-shrink-0 overflow-hidden rounded-2xl transition-all duration-300 hover:scale-105">
                  <Image src={img} alt="makeup" fill className="object-cover" />
                </div>
                <p className="order-2 flex-grow text-sm leading-relaxed text-[#888888]">
                  <span className="font-bold">Makeup (Trang Điểm):</span> người làm cho khuôn mặt của nhân vật trở nên
                  đẹp và phù hợp phong cách thời trang của bộ ảnh. Với kinh nghiệm và sự đa dạng phong cách, Makeup của
                  Nguyễn Đình Thịnh Studio có thể &ldquo;biến hình&rdquo; theo bất cứ &ldquo;concept&rdquo; nào.
                </p>
              </div>
            </AnimatedContent>

            <AnimatedContent direction="vertical" duration={1.5} distance={250} threshold={0.1}>
              <div className="flex h-full flex-col gap-6">
                <p className="order-2 flex-grow text-sm leading-relaxed text-[#888888] sm:order-1">
                  <span className="font-bold">HairStylist (Nhà Tạo Mẫu):</span> Mái tóc là cái khá quan trọng trong bức
                  ảnh và là nhân tố cân đối lại tất cả. Luôn tìm tòi những mẫu tóc mới và thiết kế lại dựa trên đặc điểm
                  khách hàng từ đó cho ra đời những layout vừa đẹp lại phù hợp, đó là tiêu chí của Nguyễn Đình Thịnh
                  Studio.
                </p>
                <div className="relative order-1 aspect-[3/4] sm:aspect-[3/5] flex-shrink-0 overflow-hidden rounded-2xl transition-all duration-300 hover:scale-105 sm:order-2">
                  <Image src={img2} alt="makeup-2" fill className="object-cover" />
                </div>
              </div>
            </AnimatedContent>
          </div>
        </div>
      </div>
    </div>
  )
}
