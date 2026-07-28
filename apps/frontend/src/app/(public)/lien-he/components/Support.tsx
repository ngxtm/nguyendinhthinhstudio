import { BsTiktok } from 'react-icons/bs'
import { FaFacebookF, FaPhoneAlt, FaTiktok } from 'react-icons/fa'
import { MdEmail } from 'react-icons/md'

export default function Support() {
  return (
    <div className="flex flex-col gap-6 mt-6">
      <div className="flex md:flex-row flex-col justify-center gap-4">
        <div className="flex flex-col justify-center items-center gap-4 p-6 border-[#888888] border-2 rounded-3xl md:w-[65vh] md:h-[32vh]">
          <a
            href="tel:+84983885473"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex justify-center items-center bg-white hover:bg-green-600 hover:shadow-lg border-[#585858] border-2 hover:border-0 rounded-full w-16 h-16 text-[#585858] hover:text-white hover:scale-110 transition-all duration-300 cursor-pointer"
            title="HOTLINE"
          >
            <span className="text-3xl group-hover:scale-110 transition-transform duration-200">
              <FaPhoneAlt />
            </span>
          </a>
          <div className="text-center">
            <h3 className="mb-2 font-bold text-[#585858] text-2xl">Tổng Đài CSKH</h3>
            <p className="mb-2 text-gray-600">Thời gian trực tuyến: 07:00 – 24:00</p>
            <p className="text-gray-600">
              Hoặc bạn muốn{' '}
              <a href="https://zalo.me/0983885473" className="text-blue-500 hover:underline">
                CHAT ZALO
              </a>
            </p>
          </div>
        </div>
        <div className="flex flex-col justify-center items-center gap-4 p-6 border-[#888888] border-2 rounded-3xl md:w-[65vh] md:h-[32vh]">
          <a
            href="https://www.tiktok.com/@nguyendinhthinhstudio"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex justify-center items-center bg-white hover:bg-black hover:shadow-lg border-[#585858] border-2 hover:border-0 rounded-full w-16 h-16 text-[#585858] hover:text-white hover:scale-110 transition-all duration-300 cursor-pointer"
            title="HOTLINE"
          >
            <span className="text-3xl group-hover:scale-110 transition-transform duration-200">
              <FaTiktok />
            </span>
          </a>
          <div className="text-center">
            <h3 className="mb-2 font-bold text-[#585858] text-2xl">Tiktok Channel</h3>
            <p className="mb-2 text-gray-600">Thời gian trực tuyến: 24/7</p>
          </div>
        </div>
      </div>
      <div className="flex md:flex-row flex-col justify-center gap-4">
        <div className="flex flex-col justify-center items-center gap-4 p-6 border-[#888888] border-2 rounded-3xl md:w-[65vh] md:h-[32vh]">
          <div className="flex flex-col justify-center items-center gap-4">
            <a
              href="https://www.facebook.com/nguyendinhthinh.foto"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex justify-center items-center bg-white hover:bg-[#0866ff] hover:shadow-lg border-[#585858] border-2 hover:border-0 rounded-full w-16 h-16 text-[#585858] hover:text-white hover:scale-110 transition-all duration-300 cursor-pointer"
              title="HOTLINE"
            >
              <span className="text-3xl group-hover:scale-110 transition-transform duration-200">
                <FaFacebookF />
              </span>
            </a>
            <h3 className="mb-2 font-bold text-[#585858] text-2xl">Facebook Fanpage</h3>
            <p className="mb-2 text-gray-600">Thời gian trực tuyến: 24/7</p>
          </div>
        </div>
        <div className="flex flex-col justify-center items-center gap-4 p-6 border-[#888888] border-2 rounded-3xl md:w-[65vh] md:h-[32vh]">
          <div className="flex flex-col justify-center items-center gap-1">
            <a
              href="mailto:nguyendinhthinhstudio.com"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex justify-center items-center bg-white hover:bg-[#ea4335] hover:shadow-lg border-[#585858] border-2 hover:border-0 rounded-full w-16 h-16 text-[#585858] hover:text-white hover:scale-110 transition-all duration-300 cursor-pointer"
              title="Gmail"
            >
              <span className="text-3xl group-hover:scale-110 transition-transform duration-200">
                <MdEmail />
              </span>
            </a>
            <h3 className="mb-2 font-bold text-[#585858] text-2xl">Gmail</h3>
            <p className="mb-2 text-gray-600">Thời gian trực tuyến: 24/7</p>
          </div>
        </div>
      </div>
    </div>
  )
}
