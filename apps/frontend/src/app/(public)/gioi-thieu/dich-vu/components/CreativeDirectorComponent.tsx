import Image from 'next/image'
import img from '../images/cd.jpg'
import AnimatedContent from '@/app/components/common/AnimatedContent'

export default function CreativeDirectorComponent() {
  return (
    <div className="grid h-fit place-items-center px-4 py-10 sm:min-h-screen sm:px-6 md:px-8 lg:px-12">
      <div className="grid auto-rows-auto grid-cols-1 gap-10 sm:grid-cols-2">
        <AnimatedContent direction="horizontal" reverse={true} duration={1.5} distance={250} threshold={0.1}>
          <div className="relative order-2 aspect-[9/8] flex-shrink-0 sm:order-1">
            <Image src={img} alt="cd-1" fill className="rounded-2xl object-cover" />
          </div>
        </AnimatedContent>
        <AnimatedContent direction="horizontal" duration={1.5} distance={250} threshold={0.1} className='sm:my-auto'>
          <div className="order-1 h-fit space-y-4 text-center sm:order-2 sm:text-left">
            <p className="text-sm tracking-wide text-[#888888] dark:text-neutral-400">QUẢN LÝ NGHỆ THUẬT - SÁNG TẠO</p>
            <h2 className="text-4xl leading-tight font-bold sm:text-5xl lg:text-6xl xl:text-7xl">Creative Director</h2>
            <p className="text-sm leading-relaxed text-[#888888] dark:text-neutral-400 sm:text-base">
              Hay còn gọi là CD hoặc Giám Đốc Sáng Tạo. Được ví như nhạc trưởng của một dự án hình ảnh, video. Là người
              phối hợp, dung hòa tất cả các bộ phận, giai đoạn với nhau cũng như chịu trách nhiệm rất lớn về mặt nghệ
              thuật, xu hướng thịnh hành của sản phẩm cuối cùng. Trên thế giới, CD rất quan trọng trong các dự án hình
              ảnh.
            </p>
          </div>
        </AnimatedContent>
      </div>
    </div>
  )
}
