import Image from 'next/image'
import Link from 'next/link'
import SocialLinks from '../common/SocialLinks'

interface HeaderProps {
  logoSrc?: string
  logoText?: string
  logoAlt?: string
  className?: string
  showMobileMenu?: boolean
  showSocialLinks?: boolean
  navigationItems?: Array<{
    href: string
    label: string
  }>
}

const Header: React.FC<HeaderProps> = ({
  logoSrc = '',
  logoText = '',
  logoAlt = 'logo',
  className = 'bg-[#313132] text-white',
  showMobileMenu = false,
  showSocialLinks = true,
  navigationItems = [
    {
      href: '/',
      label: 'Trang chủ'
    },
    {
      href: '/gioi-thieu',
      label: 'Giới thiệu'
    },
    {
      href: '/thu-vien',
      label: 'Thư viện ảnh'
    },
    {
      href: '/video',
      label: 'Video'
    },
    {
      href: '/bang-gia',
      label: 'Bảng giá'
    },
    {
      href: '/lien-he',
      label: 'Liên hệ'
    }
  ]
}) => {
  return (
    <header className={`flex items-center justify-between px-12 py-4 ${className}`}>
      {/* Logo */}
      <div className="flex-shrink-0">
        <Link href="/">
          {logoSrc ? (
            <Image src={logoSrc} alt={logoAlt} width={150} height={50} className="h-auto max-h-12 w-auto" priority />
          ) : (
            <span className="font-kapakana text-2xl">{logoText}</span>
          )}
        </Link>
      </div>

      {/* Navigation Menu */}
      <nav className="hidden items-center gap-8 md:flex">
        {navigationItems.map(item => (
          <Link key={item.href} href={item.href} className="font-medium hover:underline">
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Social Links */}
      {showSocialLinks && (
        <div className="hidden md:flex">
          <SocialLinks iconSize="sm" variant="circle" />
        </div>
      )}

      {/* Mobile Menu Button */}
      {showMobileMenu && (
        <div className="md:hidden">
          <button className="rounded p-2 text-white transition-colors hover:bg-gray-600">☰</button>
        </div>
      )}
    </header>
  )
}

export default Header
