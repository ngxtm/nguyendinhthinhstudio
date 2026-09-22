import Link from 'next/link'
import type { ReactNode, FC } from 'react'
import { FaFacebookF, FaInstagram, FaTiktok, FaPhoneAlt } from 'react-icons/fa'
import { SiZalo } from 'react-icons/si'

interface SocialItem {
  href: string
  icon: ReactNode
  label: string
  bgColor?: string
}

interface SocialLinksProps {
  items?: SocialItem[]
  className?: string
  iconSize?: 'sm' | 'md' | 'lg' | 'responsive'
  variant?: 'circle' | 'square' | 'rounded'
}

const SocialLinks: FC<SocialLinksProps> = ({
  items = [
    {
      href: 'tel:+84123456789',
      icon: <FaPhoneAlt />,
      label: 'Phone',
      bgColor: 'bg-[#057611]'
    },
    {
      href: 'https://www.facebook.com/nguyendinhthinhstudio',
      icon: <FaFacebookF />,
      label: 'Facebook',
      bgColor: 'bg-[#3a558e]'
    },
    {
      href: 'https://www.instagram.com/nguyendinhthinh.foto',
      icon: <FaInstagram />,
      label: 'Instagram',
      bgColor: 'bg-gradient-to-r from-[#5b2c87] via-[#8b1538] to-[#a91b60]'
    },
    {
      href: 'https://www.tiktok.com/@nguyendinhthinhstudio',
      icon: <FaTiktok />,
      label: 'TikTok',
      bgColor: 'bg-black opacity-[0.82]'
    },
    {
      href: 'https://zalo.me/0899990497',
      icon: <SiZalo />,
      label: 'Zalo',
      bgColor: 'bg-[#0157da] opacity-[0.85]'
    }
  ],
  className = '',
  iconSize = 'md',
  variant = 'circle'
}) => {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    responsive: 'w-4 h-4 md:w-5 md:h-5 lg:w-7 lg:h-7'
  }

  const iconSizeClasses = {
    sm: 'text-xs',
    md: 'text-xs',
    lg: 'text-lg',
    responsive: 'text-[8px] sm:text-[8px] md:text-[10px] lg:text-xs'
  }

  const variantClasses = {
    circle: 'rounded-full',
    square: 'rounded-none',
    rounded: 'rounded-lg'
  }

  return (
    <div className={`flex items-center gap-1 md:gap-2 lg:gap-3 ${className}`}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          target={item.href.startsWith('http') ? '_blank' : undefined}
          rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined}
          className={` ${sizeClasses[iconSize]} ${variantClasses[variant]} ${item.bgColor ?? 'bg-gray-500'} group flex cursor-pointer items-center justify-center text-white transition-all duration-300 hover:scale-110 hover:shadow-lg`}
          title={item.label}
        >
          <span className={`transition-transform duration-200 group-hover:scale-110 ${iconSizeClasses[iconSize]}`}>{item.icon}</span>
        </Link>
      ))}
    </div>
  )
}

export default SocialLinks
