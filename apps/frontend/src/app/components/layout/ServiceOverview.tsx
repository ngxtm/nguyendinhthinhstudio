import Link from 'next/link'

interface ServiceOverviewProps {
  readonly title1?: string
  readonly content1?: string
  readonly title1Button?: string
  readonly title1ButtonLink?: string
  readonly title1ClassName?: string
  readonly content1ClassName?: string
  readonly button1ClassName?: string
  readonly title2?: string
  readonly content2?: string
  readonly title2Button?: string
  readonly title2ButtonLink?: string
  readonly title2ClassName?: string
  readonly content2ClassName?: string
  readonly button2ClassName?: string
  readonly title3?: string
  readonly content3?: string
  readonly title3Button?: string
  readonly title3ButtonLink?: string
  readonly title3ClassName?: string
  readonly content3ClassName?: string
  readonly button3ClassName?: string
}

export default function ServiceOverview({
  title1 = 'TRIỂN LÃM ẢNH',
  content1 = 'Chúng tôi có hơn 1000 ý tưởng có sẵn cho ảnh. với đầy đủ tất cả: setup, trang phục, phụ kiện, trang điểm, kiểu tóc, ánh sáng, không gian và trình diễn của các chuyên gia',
  title1Button = 'ĐẾN THƯ VIỆN',
  title1ButtonLink = '#',
  title1ClassName = 'text-xl font-bold text-center',
  content1ClassName = 'text-gray-500 text-center text-sm',
  button1ClassName = 'text-white text-[12px] bg-black px-4 py-2 rounded-xs text-center',
  title2 = 'CHĂM SÓC KHÁCH HÀNG',
  content2 = 'Bạn có câu hỏi nào không? Chúng tôi đang ở đây để giúp bạn. Bạn có thể liên hệ với nhóm chăm sóc khách hàng của chúng tôi bằng tin nhắn xã hội hoặc qua điện thoại.',
  title2Button = 'LIÊN LẠC NGAY',
  title2ButtonLink = '#',
  title2ClassName = 'text-xl font-bold text-center',
  content2ClassName = 'text-gray-500 text-center text-sm',
  button2ClassName = 'text-white text-[12px] bg-black px-4 py-2 rounded-xs text-center',
  title3 = 'VỀ CHÚNG TÔI',
  content3 = 'Chúng tôi là Studio chuyên về hình ảnh và video với phong cách nghệ thuật thời thượng và hợp xu hướng. Phục vụ hơn 1000 khách hàng cao cấp mỗi năm, chúng tôi hướng tới sự hoàn hảo trong sản phẩm.',
  title3Button = 'TÌM HIỂU THÊM',
  title3ButtonLink = '#',
  title3ClassName = 'text-xl font-bold text-center',
  content3ClassName = 'text-gray-500 text-center text-sm',
  button3ClassName = 'text-white text-[12px] bg-black px-4 py-2 rounded-xs text-center'
}: ServiceOverviewProps) {
  return (
    <div className="flex flex-col gap-6 md:flex-row md:px-28">
      <div className="flex flex-col items-center justify-center gap-6 bg-[#d8d8d8] p-12 md:h-[370px] md:w-[1350px]">
        <h1 className={title1ClassName}>{title1}</h1>
        <p className={content1ClassName}>{content1}</p>
        <Link href={title1ButtonLink} className={button1ClassName}>
          {title1Button}
        </Link>
      </div>
      <div className="flex flex-col items-center justify-center gap-6 bg-[#d8d8d8] p-12 md:h-[370px] md:w-[1350px]">
        <h1 className={title2ClassName}>{title2}</h1>
        <p className={content2ClassName}>{content2}</p>
        <Link href={title2ButtonLink} className={button2ClassName}>
          {title2Button}
        </Link>
      </div>
      <div className="flex flex-col items-center justify-center gap-6 bg-[#d8d8d8] p-12 md:h-[370px] md:w-[1350px]">
        <h1 className={title3ClassName}>{title3}</h1>
        <p className={content3ClassName}>{content3}</p>
        <Link href={title3ButtonLink} className={button3ClassName}>
          {title3Button}
        </Link>
      </div>
    </div>
  )
}
