import { FaFacebookF, FaPhoneAlt } from 'react-icons/fa'
import { MdEmail } from 'react-icons/md'

export default function Support() {
  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="flex flex-col justify-center gap-4 md:flex-row">
        <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-[#888888] p-6 md:h-[32vh] md:w-[65vh]">
          <a
            href="tel:+84899990497"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex h-16 w-16 cursor-pointer items-center justify-center rounded-full border-2 border-[#585858] bg-white text-[#585858] transition-all duration-300 hover:scale-110 hover:border-0 hover:bg-green-600 hover:text-white hover:shadow-lg"
            title="HOTLINE"
          >
            <span className="text-3xl transition-transform duration-200 group-hover:scale-110">
              <FaPhoneAlt />
            </span>
          </a>
          <div className="text-center">
            <h3 className="mb-2 text-2xl font-bold text-[#585858]">Tổng Đài CSKH 1</h3>
            <p className="mb-2 text-gray-600">Thời gian trực tuyến: 07:00 – 24:00</p>
            <p className="text-gray-600">
              Hoặc bạn muốn{' '}
              <a href="https://zalo.me/0899990497" className="text-blue-500 hover:underline">
                CHAT ZALO
              </a>
            </p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-[#888888] p-6 md:h-[32vh] md:w-[65vh]">
          <a
            href="tel:+84899990497"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex h-16 w-16 cursor-pointer items-center justify-center rounded-full border-2 border-[#585858] bg-white text-[#585858] transition-all duration-300 hover:scale-110 hover:border-0 hover:bg-green-600 hover:text-white hover:shadow-lg"
            title="HOTLINE"
          >
            <span className="text-3xl transition-transform duration-200 group-hover:scale-110">
              <FaPhoneAlt />
            </span>
          </a>
          <div className="text-center">
            <h3 className="mb-2 text-2xl font-bold text-[#585858]">Tổng Đài CSKH 2</h3>
            <p className="mb-2 text-gray-600">Thời gian trực tuyến: 07:00 – 24:00</p>
            <p className="text-gray-600">
              Hoặc bạn muốn{' '}
              <a href="https://zalo.me/0899990497" className="text-blue-500 hover:underline">
                CHAT ZALO
              </a>
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-col justify-center gap-4 md:flex-row">
        <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-[#888888] p-6 md:h-[32vh] md:w-[65vh]">
          <div className="flex flex-col items-center justify-center gap-4">
            <a
              href="https://www.facebook.com/nguyendinhthinh.foto"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex h-16 w-16 cursor-pointer items-center justify-center rounded-full border-2 border-[#585858] bg-white text-[#585858] transition-all duration-300 hover:scale-110 hover:border-0 hover:bg-[#0866ff] hover:text-white hover:shadow-lg"
              title="HOTLINE"
            >
              <span className="text-3xl transition-transform duration-200 group-hover:scale-110">
                <FaFacebookF />
              </span>
            </a>
            <h3 className="mb-2 text-2xl font-bold text-[#585858]">Facebook Fanpage</h3>
            <p className="mb-2 text-gray-600">Thời gian trực tuyến: 24/7</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-[#888888] p-6 md:h-[32vh] md:w-[65vh]">
          <div className="flex flex-col items-center justify-center gap-1">
            <a
              href="mailto:nguyendinhthinhstudio.com"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex h-16 w-16 cursor-pointer items-center justify-center rounded-full border-2 border-[#585858] bg-white text-[#585858] transition-all duration-300 hover:scale-110 hover:border-0 hover:bg-[#ea4335] hover:text-white hover:shadow-lg"
              title="Gmail"
            >
              <span className="text-3xl transition-transform duration-200 group-hover:scale-110">
                <MdEmail />
              </span>
            </a>
            <h3 className="mb-2 text-2xl font-bold text-[#585858]">Gmail</h3>
            <p className="mb-2 text-gray-600">Thời gian trực tuyến: 24/7</p>
          </div>
        </div>
      </div>
    </div>
  )
}
