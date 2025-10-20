import Image from 'next/image'
import img from '../images/dv-2.jpg'
import AnimatedContent from '@/app/components/common/AnimatedContent'
export default function StylistComponent() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[#2c2c2c] px-6 py-8 sm:gap-12 md:flex-row md:gap-16 lg:gap-28 lg:px-8">
      <AnimatedContent direction="horizontal" reverse={true} duration={1.5} distance={200} threshold={0.1} className='order-2 md:order-none'>
        <div className="relative aspect-[3/4] h-[50vh] w-[80vw] overflow-hidden rounded-2xl sm:aspect-[9/16] sm:h-[55vh] sm:w-[60vw] md:order-none md:h-[60vh] md:w-[35vw] lg:w-[22vw]">
          <Image src={img} alt="Stylist" fill className="object-cover" priority />
        </div>
      </AnimatedContent>
      <AnimatedContent direction="horizontal" duration={1.5} distance={200} threshold={0.1} className='order-1 md:order-none'>
        <div className="w-full max-w-3xl space-y-8 text-white sm:space-y-10 md:order-none lg:space-y-14">
          <p className="text-sm text-[#686868] sm:text-base">ĐỘI SÁNG TẠO PHONG CÁCH - TẠO HÌNH</p>
          <h2 className="text-2xl font-bold sm:text-3xl lg:text-4xl">Stylist (Nhà Tạo Mẫu)</h2>
          <div className="border-l-4 px-4 text-lg font-bold sm:px-6 sm:text-xl lg:px-8">
            Stylist là người tạo hình phong cách thời trang
          </div>
          <p className="text-sm leading-relaxed text-[#bdbdbd] sm:text-base">
            Một Stylist tốt là tối quan trọng trong buổi chụp ảnh. Bởi vì nhiệm vụ của Stylist là: phối trang phục, phụ
            kiện, thiết kế phông nền, lẫn các kiểu tạo dáng cho phù hợp với phong cách thời trang. Dựa trên yêu cầu và
            đặc điểm của khách hàng. Thẩm mĩ nghệ thuật Stylist càng tốt thì mức độ nghệ thuật của bộ ảnh sẽ càng cao.
          </p>
          <div className="flex flex-col gap-8 sm:gap-10 md:flex-row md:text-center lg:gap-12">
            <div className="space-y-3 sm:space-y-4">
              <hr className="w-1/3 border-white" />
              <h3 className="text-xl font-bold sm:text-2xl lg:text-[26px]">Stylist Tiêu Chuẩn</h3>
              <p className="text-sm leading-relaxed text-[#bdbdbd] sm:text-base">
                Với mức độ thẩm mĩ ở mức độ tốt. Stylist Tiêu Chuẩn sẽ phối trang phục, phụ kiện, phông nền theo các
                layout có sẵn của Studio hoặc phối lại ở mức độ vừa phải.
              </p>
            </div>
            <div className="space-y-3 sm:space-y-4">
              <hr className="w-1/3 border-white" />
              <h3 className="text-xl font-bold sm:text-2xl lg:text-[26px]">Stylist Cao Cấp</h3>
              <p className="text-sm leading-relaxed text-[#bdbdbd] sm:text-base">
                Thẩm mĩ thời trang rất cao, bắt kịp xu hướng thế giới, có cách nhìn nhận khuyết - ưu điểm, cá tính nhân
                vật chính để phát triển tạo hình phù hợp - hợp thời trang nhất.
              </p>
            </div>
          </div>
        </div>
      </AnimatedContent>
    </div>
  )
}
