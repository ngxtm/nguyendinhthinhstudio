import Image from 'next/image'
import gioiThieuImg from './images/gioi-thieu-1.png'
import gioiThieuImg2 from './images/gioi-thieu-2.png'
import Link from 'next/link'

export default function About() {
  return (
    <div className="space-y-20">
      <div className="relative h-[50vh]">
        <Image src={gioiThieuImg} alt="gioi-thieu" fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <h1 className="mx-auto max-w-[92vw] text-center text-2xl leading-tight font-medium text-balance break-words text-white sm:max-w-3xl sm:text-4xl md:max-w-4xl md:text-5xl lg:text-6xl">
            Chào mừng bạn đến với thế giới nhiếp ảnh của <span className="font-bold">Nguyễn Đình Thịnh Studio</span>
          </h1>
        </div>
      </div>
      <div className="mx-auto flex max-h-[4000px] max-w-[3200px] flex-col items-center gap-10 px-4 md:flex-row md:items-start md:gap-16">
        <div className="order-2 w-full md:order-1 md:w-[55%]">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[24px] md:aspect-[16/12]">
            <Image
              src={gioiThieuImg2}
              alt="gioi-thieu"
              fill
              sizes="(min-width: 768px) 55vw, 100vw"
              className="object-cover"
            />
          </div>
        </div>
        <div className="order-1 my-auto w-full md:order-2 md:w-[45%]">
          <h3 className="text-2xl tracking-tight md:text-5xl">About</h3>
          <h2 className="mt-2 text-2xl leading-tight font-bold text-balance md:text-5xl">Nguyễn Đình Thịnh Studio</h2>
          <p className="mt-6 text-xs leading-relaxed text-neutral-700 md:text-sm">
            Nhằm đáp ứng nhu cầu ngày một đa dạng và nâng cao trải nghiệm sử dụng dịch vụ của khách hàng. Nguyễn Đình
            Thịnh Studio đã phát triển mạnh mẽ hơn qua Website và MXH. Hình thành quy trình với các quy chuẩn chuyên
            nghiệp về sản xuất hình ảnh, trở thành một trong những hệ sinh thái lớn mạnh hơn bao giờ hết. Bao gồm các
            mảng liên đới, hỗ trợ lẫn nhau trong việc sản xuất hình ảnh, truyền thông và đa phương tiện.
          </p>
          <p className="mt-4 text-xs leading-relaxed text-neutral-700 md:text-sm">
            Với đội ngũ nhân sự dày dặn kinh nghiệm từ 5–10 năm, quy tụ đầy đủ các vị trí từ nhiếp ảnh gia, quay phim,
            kỹ thuật ánh sáng, stylist đến hậu kỳ, chúng tôi đáp ứng trọn vẹn mọi nhu cầu từ gói cơ bản đến các giải
            pháp sản xuất hình ảnh cao cấp. Mỗi dự án được vận hành theo quy trình chuẩn mực, phong cách phục vụ tinh
            tế, bảo chứng chất lượng của một studio tầm cỡ.
          </p>

          <Link href="/gioi-thieu/thu-vien">
            <button
              className="group mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-neutral-300 bg-white/90 px-4 py-3 text-sm font-medium text-neutral-900 shadow-sm backdrop-blur transition-all duration-200 active:scale-[.98] hover:bg-neutral-900 hover:text-white focus:outline-none focus:ring-2 focus:ring-neutral-400 min-h-[44px] sm:w-auto"
            >
              THAM KHẢO THÊM HÌNH ẢNH{' '}
              <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
            </button>
          </Link>
        </div>
      </div>
    </div>
  )
}
