import Link from 'next/link'

interface ServiceOverviewProps {
  title1?: string
  content1?: string
  title1Button?: string
  title1ButtonLink?: string
  title1ClassName?: string
  content1ClassName?: string
  button1ClassName?: string
  title2?: string
  content2?: string
  title2Button?: string
  title2ButtonLink?: string
  title2ClassName?: string
  content2ClassName?: string
  button2ClassName?: string
  title3?: string
  content3?: string
  title3Button?: string
  title3ButtonLink?: string
  title3ClassName?: string
  content3ClassName?: string
  button3ClassName?: string
}

export default function ServiceOverview({
  title1 = 'TRIỂN LÃM ẢNH',
  content1 = 'Chúng tôi có hơn 1000 ý tưởng có sẵn cho ảnh. với đầy đủ tất cả: setup, trang phục, phụ kiện, trang điểm, kiểu tóc, ánh sáng, không gian và trình diễn của các chuyên gia',
  title1Button = 'ĐẾN THƯ VIỆN',
  title1ButtonLink = '#',
  title1ClassName = 'text-lg sm:text-xl font-bold text-center',
  content1ClassName = 'text-gray-500 text-center text-xs sm:text-sm leading-relaxed',
  button1ClassName = 'text-white text-xs sm:text-[12px] bg-black px-5 py-2.5 sm:px-4 rounded-xs text-center transition-colors hover:bg-gray-800 flex items-center',
  title2 = 'CHĂM SÓC KHÁCH HÀNG',
  content2 = 'Bạn có câu hỏi nào không? Chúng tôi đang ở đây để giúp bạn. Bạn có thể liên hệ với nhóm chăm sóc khách hàng của chúng tôi bằng tin nhắn xã hội hoặc qua điện thoại.',
  title2Button = 'LIÊN LẠC NGAY',
  title2ButtonLink = '#',
  title2ClassName = 'text-lg sm:text-xl font-bold text-center',
  content2ClassName = 'text-gray-500 text-center text-xs sm:text-sm leading-relaxed',
  button2ClassName = 'text-white text-xs sm:text-[12px] bg-black px-5 py-2.5 sm:px-4 rounded-xs text-center transition-colors hover:bg-gray-800 flex items-center',
  title3 = 'VỀ CHÚNG TÔI',
  content3 = 'Chúng tôi là Studio chuyên về hình ảnh và video với phong cách nghệ thuật thời thượng và hợp xu hướng. Phục vụ hơn 1000 khách hàng cao cấp mỗi năm, chúng tôi hướng tới sự hoàn hảo trong sản phẩm.',
  title3Button = 'TÌM HIỂU THÊM',
  title3ButtonLink = '#',
  title3ClassName = 'text-lg sm:text-xl font-bold text-center',
  content3ClassName = 'text-gray-500 text-center text-xs sm:text-sm leading-relaxed',
  button3ClassName = 'text-white text-xs sm:text-[12px] bg-black px-5 py-2.5 sm:px-4 rounded-xs text-center transition-colors hover:bg-gray-800 flex items-center'
}: Readonly<ServiceOverviewProps>) {
  return (
    <div className="flex flex-col gap-4 px-4 sm:gap-6 sm:px-6 md:flex-row md:px-8 lg:px-28">
      <div className="flex flex-col items-center justify-center gap-7 bg-[#d8d8d8] p-14 sm:gap-6 sm:p-8 md:h-[370px] md:flex-1 md:p-6 lg:p-12">
        <h1 className={title1ClassName}>{title1}</h1>
        <p className={content1ClassName}>{content1}</p>
        <Link href={title1ButtonLink} className={button1ClassName}>
          {title1Button}
        </Link>
      </div>
      <div className="flex flex-col items-center justify-center gap-4 bg-[#d8d8d8] p-14 sm:gap-6 sm:p-8 md:h-[370px] md:flex-1 md:p-6 lg:p-12">
        <h1 className={title2ClassName}>{title2}</h1>
        <p className={content2ClassName}>{content2}</p>
        <Link href={title2ButtonLink} className={button2ClassName}>
          {title2Button}
        </Link>
      </div>
      <div className="flex flex-col items-center justify-center gap-4 bg-[#d8d8d8] p-14 sm:gap-6 sm:p-8 md:h-[370px] md:flex-1 md:p-6 lg:p-12">
        <h1 className={title3ClassName}>{title3}</h1>
        <p className={content3ClassName}>{content3}</p>
        <Link href={title3ButtonLink} className={button3ClassName}>
          {title3Button}
        </Link>
      </div>
    </div>
  )
}
