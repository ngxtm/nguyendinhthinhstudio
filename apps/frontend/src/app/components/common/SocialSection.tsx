'use client'

import Link from 'next/link'
import { FaFacebook, FaInstagram, FaTiktok } from 'react-icons/fa'

export default function SocialSection() {
  // Keep these links unchanged until the business account set is confirmed.
  const socialLinks = [
    {
      href: 'https://www.facebook.com/nguyendinhthinhstudio',
      icon: <FaFacebook size={24} />
    },
    {
      href: 'https://www.instagram.com/nguyendinhthinh.foto',
      icon: <FaInstagram size={24} />
    },
    {
      href: 'https://www.tiktok.com/@nguyendinhthinhstudio',
      icon: <FaTiktok size={24} />
    }
  ]

  return (
    <div className="pb-10">
      <p className="font-semibold text-lg md:text-2xl text-center">Theo dõi chúng tôi thêm tại mạng xã hội</p>
      <div className="flex justify-center items-center gap-4 mt-4">
        {socialLinks.map(link => (
          <Link
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex justify-center items-center bg-black hover:shadow-lg rounded-lg w-12 sm:w-14 md:w-12 h-12 sm:h-14 md:h-12 text-white text-base text-center hover:scale-110 transition-all duration-300 cursor-pointer"
          >
            <span className="group-hover:scale-110 transition-transform duration-200">{link.icon}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
