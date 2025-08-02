import Link from 'next/link'
import { FaFacebookF, FaInstagram, FaTiktok, FaPhoneAlt } from 'react-icons/fa'
import { SiZalo } from 'react-icons/si'

interface SocialItem {
  href: string
  icon: React.ReactNode
  label: string
  bgColor?: string
}

interface SocialLinksProps {
  items?: SocialItem[]
  className?: string
  iconSize?: 'sm' | 'md' | 'lg'
  variant?: 'circle' | 'square' | 'rounded'
}

const SocialLinks: React.FC<SocialLinksProps> = ({
  items = [
    {
      href: 'tel:+84123456789',
      icon: <FaPhoneAlt />,
      label: 'Phone',
      bgColor: 'bg-[#057611]'
    },
    {
      href: 'https://www.facebook.com/nguyendinhthinh.foto',
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
      bgColor: 'bg-black opacity-82'
    },
    {
      href: 'https://zalo.me/0899990497',
      icon: <SiZalo />,
      label: 'Zalo',
      bgColor: 'bg-[#0157da] opacity-85'
    }
  ],
  className = '',
  iconSize = 'md',
  variant = 'circle'
}) => {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-2xl'
  }

  const variantClasses = {
    circle: 'rounded-full',
    square: 'rounded-none',
    rounded: 'rounded-lg'
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {items.map((item, index) => (
        <Link
          key={index}
          href={item.href}
          target={item.href.startsWith('http') ? '_blank' : undefined}
          rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined}
          className={` ${sizeClasses[iconSize]} ${variantClasses[variant]} ${item.bgColor || 'bg-gray-500'} group flex cursor-pointer items-center justify-center text-white transition-all duration-300 hover:scale-110 hover:shadow-lg`}
          title={item.label}
        >
          <span className="transition-transform duration-200 group-hover:scale-110">{item.icon}</span>
        </Link>
      ))}
    </div>
  )
}

export default SocialLinks
