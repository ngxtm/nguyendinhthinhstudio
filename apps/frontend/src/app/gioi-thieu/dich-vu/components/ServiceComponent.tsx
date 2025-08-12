import Image from 'next/image'
import Link from 'next/link'
import img1 from '../images/dv.jpg'
import img2 from '../../images/gioi-thieu-1.png'
import AnimatedContent from '@/app/components/common/AnimatedContent'
import { FaCameraRetro, FaLightbulb } from 'react-icons/fa'
import { FaArrowsRotate, FaShop } from 'react-icons/fa6'

export default function ServiceComponent() {
  return (
    <div className="space-y-12 bg-[#424242] pt-20 text-white px-4 sm:px-8 md:px-16 lg:px-32 md:space-y-20 md:pt-28 overflow-y-hidden">
      <div className="text-center">
        <AnimatedContent direction="vertical" reverse duration={1} distance={50}>
          <h1 className="mb-4 text-2xl font-bold sm:text-3xl md:mb-6 lg:text-4xl">DỊCH VỤ NGUYỄN ĐÌNH THỊNH STUDIO</h1>
        </AnimatedContent>
        <AnimatedContent direction="vertical" reverse duration={1.2} distance={50}>
          <p className="mx-auto max-w-7xl text-sm text-[#bdbdbd] sm:text-base md:text-lg">
            Được thành lập năm 2020. Nguyễn Đình Thịnh Studio được sinh ra với sứ mệnh mang những trải nghiệm dịch vụ
            hình ảnh hoàn hảo nhất đến với tất cả mọi người. Không chỉ là xu huớng của thế giới mà còn là giá trị cốt
            lõi trường tồn theo thời gian.
          </p>
        </AnimatedContent>
      </div>

      {/* Section 1 - SIDE BY SIDE LAYOUT */}
      <div className="flex flex-col items-center lg:flex-row lg:gap-0">
        {/* Image */}
        <div className="w-full lg:flex-1">
          <AnimatedContent direction="horizontal" reverse={true} duration={1.5} distance={200} threshold={0.1}>
            <div className="relative h-[50vh] w-full overflow-hidden rounded-[16px] sm:h-[60vh] md:h-[70vh] lg:h-[80vh] xl:h-[90vh] lg:rounded-[24px]">
              <Image
                src={img1}
                alt="studio-experience"
                fill
                className="object-cover"
                priority
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 50vw"
              />
            </div>
          </AnimatedContent>
        </div>

        {/* Text Box */}
        <div className="w-full lg:flex-1 lg:max-w-md lg:-ml-12 xl:-ml-16">
          <AnimatedContent direction="horizontal" duration={1.5} distance={200} threshold={0.1}>
            <div className="flex md:min-h-[400px] flex-col items-center lg:items-start justify-center gap-6 rounded-lg bg-[#212121] p-6 pt-10 sm:gap-8 sm:p-8 lg:h-[70vh] xl:h-[78vh]">
              <div className="flex flex-col gap-4 sm:gap-6 text-center lg:text-left">
                <h2 className="text-xl font-bold text-white sm:text-2xl lg:text-3xl">TRẢI NGHIỆM HOÀN HẢO</h2>
                <hr className="sm:w-[calc(100%+1rem)] border-t-2 border-white sm:ml-12 lg:ml-14" />
                <p className="text-sm leading-relaxed text-[#bdbdbd] sm:text-base">
                  Được đầu tư quy mô cà về vật chất và chất xám để khách hàng có trải nghiệm hoàn hảo và sản phẩm chất
                  lượng
                </p>
              </div>
              <Link
                href="/gioi-thieu"
                className="flex w-fit items-center mx-auto sm:mx-0 rounded-sm bg-[#585858] px-4 py-2 text-center text-xs text-white transition-colors hover:bg-white hover:text-black sm:px-6 sm:text-sm"
              >
                Khám Phá
              </Link>
            </div>
          </AnimatedContent>
        </div>
      </div>

      {/* Section 2 - SIDE BY SIDE LAYOUT */}
      <div className="flex flex-col items-center lg:flex-row-reverse lg:gap-0">
        {/* Image */}
        <div className="w-full lg:flex-1">
          <AnimatedContent direction="horizontal" reverse={true} duration={1.5} distance={200} threshold={0.1}>
            <div className="relative h-[50vh] w-full overflow-hidden rounded-[16px] sm:h-[60vh] md:h-[70vh] lg:h-[80vh] xl:h-[90vh] lg:rounded-[24px]">
              <Image
                src={img2}
                alt="studio-experience"
                fill
                className="object-cover"
                priority
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 50vw"
              />
            </div>
          </AnimatedContent>
        </div>

        {/* Text Box */}
        <div className="w-full lg:flex-1 lg:max-w-md lg:-mr-12 xl:-mr-16">
          <AnimatedContent direction="horizontal" duration={1.5} distance={200} threshold={0.1}>
            <div className="flex min-h-[400px] flex-col items-center justify-center gap-6 rounded-lg bg-[#212121] p-6 sm:gap-8 sm:p-8 lg:items-end lg:h-[70vh] xl:h-[78vh]">
              <div className="flex flex-col gap-4 text-center sm:gap-6 lg:text-right">
                <h2 className="text-xl font-bold text-white sm:text-2xl lg:text-3xl">LỰA CHỌN HÀNG ĐẦU</h2>
                <hr className="sm:w-[calc(100%+1rem)] border-t-2 border-white sm:-ml-12 lg:-ml-16" />
                <p className="text-sm leading-relaxed text-[#bdbdbd] sm:text-base">
                  Là sự lựa chọn hàng đầu của người nổi tiếng và những thương hiệu về làm đẹp, hướng đến cái đẹp
                </p>
              </div>
              <Link
                href="/bang-gia"
                className="flex w-fit items-center mx-auto sm:mx-0 rounded-sm bg-[#585858] px-4 py-2 text-center text-xs text-white transition-colors hover:bg-white hover:text-black sm:px-6 sm:text-sm"
              >
                Bảng Giá
              </Link>
            </div>
          </AnimatedContent>
        </div>
      </div>

      {/* 4 Section */}
      <div className="grid grid-cols-1 gap-8 py-16 text-center sm:grid-cols-2 sm:gap-12 md:gap-16 lg:gap-20 md:py-24 lg:py-32">
        <AnimatedContent direction="horizontal" reverse={true} duration={1.5} distance={200}>
          <div className="px-4">
            <FaCameraRetro size={32} className="mx-auto mb-3 text-black sm:mb-4 md:mb-6 lg:mb-8" />
            <h2 className="mb-2 text-lg font-bold text-black sm:text-xl md:text-2xl sm:mb-3 md:mb-4">THIẾT BỊ TỐT</h2>
            <p className="text-sm text-[#bfbfbf] sm:text-base leading-relaxed">
              Sử dụng những công nghệ - thiết bị của những thương hiệu hàng đầu - tốt nhất: Apple, Profoto, Hasselblad,
              Canon,...
            </p>
          </div>
        </AnimatedContent>
        <AnimatedContent direction="horizontal" duration={1.5} distance={200}>
          <div className="px-4">
            <FaShop size={32} className="mx-auto mb-3 text-black sm:mb-4 md:mb-6 lg:mb-8" />
            <h2 className="mb-2 text-lg font-bold text-black sm:text-xl md:text-2xl sm:mb-3 md:mb-4">KHÔNG GIAN LỚN</h2>
            <p className="text-sm text-[#bfbfbf] sm:text-base leading-relaxed">
              Studio được thiết kế chuyên dụng cho sản xuất hình ảnh theo chuẩn quốc tế đồng thời tạo cảm giác thoải
              mái, gần gũi cho khách hàng
            </p>
          </div>
        </AnimatedContent>
        <AnimatedContent direction="horizontal" reverse={true} duration={1.5} distance={200}>
          <div className="px-4">
            <FaLightbulb size={32} className="mx-auto mb-3 text-black sm:mb-4 md:mb-6 lg:mb-8" />
            <h2 className="mb-2 text-lg font-bold text-black sm:text-xl md:text-2xl sm:mb-3 md:mb-4">CHẤT XÁM CAO</h2>
            <p className="text-sm text-[#bfbfbf] sm:text-base leading-relaxed">
              Đội ngũ nhân sự chuyên gia có kinh nghiệm và kiến thức cao. Luôn cập nhật và sáng tạo theo xu hướng thế
              giới mang đến sản phẩm chất lượng
            </p>
          </div>
        </AnimatedContent>
        <AnimatedContent direction="horizontal" duration={1.5} distance={200}>
          <div className="px-4">
            <FaArrowsRotate size={32} className="mx-auto mb-3 text-black sm:mb-4 md:mb-6 lg:mb-8" />
            <h2 className="mb-2 text-lg font-bold text-black sm:text-xl md:text-2xl sm:mb-3 md:mb-4">QUY TRÌNH CHUẨN</h2>
            <p className="text-sm text-[#bfbfbf] sm:text-base leading-relaxed">
              Với quy trình được chuẩn hóa, sản phẩm nhanh chóng đến tay khách hàng với chất lượng luôn được đảm bảo và
              đồng bộ hóa mọi giai đoạn - hình thức
            </p>
          </div>
        </AnimatedContent>
      </div>
    </div>
  )
}
