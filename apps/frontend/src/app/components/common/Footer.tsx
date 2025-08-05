import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="w-full bg-[#54595f] pt-16 pb-8">
      {/* Logo */}
      <div className="text-center mb-16">
        <h1 className="font-kapakana text-4xl md:text-5xl lg:text-7xl text-white">NguyenDinhThinh</h1>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-24">
          
          {/* Left Column - Contact Info */}
          <div>
            <h2 className="text-white text-sm md:text-md lg:text-lg font-semibold mb-8 tracking-wider">LIÊN HỆ CHÚNG TÔI</h2>
            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <div className="w-5 h-5 flex-shrink-0 mt-0.5">
                  <svg className="w-full h-full fill-white" viewBox="0 0 24 24">
                    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                  </svg>
                </div>
                <a href="mailto:contact@nguyendinhthinhstudio.com" className="text-gray-300 hover:text-white transition-colors leading-relaxed text-sm md:text-md lg:text-lg">
                  Liên hệ email
                </a>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="w-5 h-5 flex-shrink-0 mt-0.5">
                  <svg className="w-full h-full fill-white" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </div>
                <a href="https://facebook.com/nguyendinhthinhstudio" target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-white transition-colors leading-relaxed text-sm md:text-md lg:text-lg">
                  Facebook Fanpage
                </a>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="w-5 h-5 flex-shrink-0 mt-0.5">
                  <svg className="w-full h-full fill-white" viewBox="0 0 24 24">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                  </svg>
                </div>
                <Link href="/showroom" className="text-gray-300 hover:text-white transition-colors leading-relaxed text-sm md:text-md lg:text-lg">
                  Showroom ở Việt Nam
                </Link>
              </div>
            </div>
          </div>

          {/* Right Column - Terms & Privacy */}
          <div>
            <h2 className="text-white text-sm md:text-md lg:text-lg font-semibold mb-8 tracking-wider">ĐIỀU KHOẢN & CHÍNH SÁCH</h2>
            <div className="space-y-4">
              <Link href="/dieu-khoan-dich-vu" className="block text-gray-300 hover:text-white transition-colors text-sm md:text-md lg:text-lg">
                Điều khoản dịch vụ
              </Link>
              <Link href="/chinh-sach-bao-hanh" className="block text-gray-300 hover:text-white transition-colors text-sm md:text-md lg:text-lg">
                Chính sách bảo hành
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="max-w-6xl mx-auto px-8 mt-16 pt-8 border-t border-gray-600">
        <div className="flex flex-col md:flex-row justify-between items-center">
          
          {/* Copyright */}
          <p className="text-gray-400 text-sm mb-4 md:mb-0">
            Copyright © 2024 NguyenDinhThinh Studio. All right reserved.
          </p>

          {/* Social Icons */}
          <div className="flex space-x-4">
            <a href="https://facebook.com/nguyendinhthinhstudio" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </a>
            
            <a href="tel:+84123456789" className="text-gray-400 hover:text-white transition-colors">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
              </svg>
            </a>
            
            <a href="https://instagram.com/nguyendinhthinhstudio" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
            </a>
            
            <a href="https://youtube.com/@nguyendinhthinhstudio" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
            </a>
            
            <a href="https://tiktok.com/@nguyendinhthinhstudio" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
