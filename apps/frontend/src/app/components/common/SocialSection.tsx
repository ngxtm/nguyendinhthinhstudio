'use client'

import Link from 'next/link'
import { FaFacebook, FaInstagram, FaTiktok } from 'react-icons/fa'

export default function SocialSection() {
  const socialLinks = [
    {
      href: 'https://www.facebook.com/nguyendinhthinh.foto',
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
    <div>
      <p className="text-center text-lg md:text-2xl font-semibold">Theo dõi chúng tôi thêm tại mạng xã hội</p>
      <div className="mt-4 flex items-center justify-center gap-4">
        {socialLinks.map(link => (
          <Link
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex h-12 w-12 sm:h-14 sm:w-14 md:h-12 md:w-12 cursor-pointer items-center justify-center rounded-lg bg-black text-center text-base text-white transition-all duration-300 hover:scale-110 hover:shadow-lg"
          >
            <span className="transition-transform duration-200 group-hover:scale-110">{link.icon}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
