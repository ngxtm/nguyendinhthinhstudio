'use client'
import Image from 'next/image'
import Link from 'next/link'
import SocialLinks from '../common/SocialLinks'
import { useState } from 'react'
import { ChevronDown, Menu, X } from 'lucide-react'
import { MdArrowDropDown } from 'react-icons/md'

interface SubMenuItem {
  href: string
  label: string
  children?: Array<{
    href: string
    label: string
  }>
}

interface NavigationItem {
  href: string
  label: string
  children?: SubMenuItem[]
}

interface HeaderProps {
  logoSrc?: string
  logoText?: string
  logoAlt?: string
  className?: string
  showMobileMenu?: boolean
  showSocialLinks?: boolean
  navigationItems?: NavigationItem[]
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
      label: 'Trang Chủ'
    },
    {
      href: '/gioi-thieu',
      label: 'Giới Thiệu',
      children: [
        {
          href: '/gioi-thieu/chinh-sach',
          label: 'Chính Sách'
        },
        {
          href: '/gioi-thieu/dich-vu',
          label: 'Dịch Vụ'
        },
        {
          href: '/gioi-thieu/quy-trinh',
          label: 'Quy Trình'
        }
      ]
    },
    {
      href: '/thu-vien',
      label: 'Thư Viện Ảnh',
      children: [
        {
          href: '/thu-vien/collection',
          label: 'Collection'
        },
        {
          href: '/thu-vien/nu',
          label: 'Nữ',
          children: [
            {
              href: '/thu-vien/nu/beauty',
              label: 'Beauty'
            },
            {
              href: '/thu-vien/nu/cong-chua',
              label: 'Công Chúa – Nàng Thơ'
            },
            {
              href: '/thu-vien/nu/birthday',
              label: 'Birthday'
            },
            {
              href: '/thu-vien/nu/thoi-trang',
              label: 'Thời Trang'
            },
            {
              href: '/thu-vien/nu/tet-trung-thu',
              label: 'Tết – Trung Thu – Cổ Trang'
            },
            {
              href: '/thu-vien/nu/noel-mua-dong',
              label: 'Noel – Mùa Đông'
            },
            {
              href: '/thu-vien/nu/cosplay',
              label: 'Cosplay'
            },
            {
              href: '/thu-vien/nu/quyen-ru',
              label: 'Quyến Rũ – Sexy'
            }
          ]
        },
        {
          href: '/thu-vien/nam',
          label: 'Nam'
        },
        {
          href: '/thu-vien/standard',
          label: 'Standard'
        },
        {
          href: '/thu-vien/bts',
          label: 'BTS Hậu Trường'
        },
        {
          href: '/thu-vien/couple',
          label: 'Couple'
        },
        {
          href: '/thu-vien/gia-dinh',
          label: 'Gia Đình – Mẹ & Bé'
        },
        {
          href: '/thu-vien/wedding',
          label: 'Wedding'
        },
        {
          href: '/thu-vien/me-bau',
          label: 'Mẹ Bầu'
        },
        {
          href: '/thu-vien/quang-cao',
          label: 'Quảng Cáo'
        }
      ]
    },
    {
      href: '/video',
      label: 'Video'
    },
    {
      href: '/bang-gia',
      label: 'Bảng Giá',
      children: [
        {
          href: '/bang-gia/ca-nhan',
          label: 'Bảng Giá Cá Nhân'
        },
        {
          href: '/bang-gia/couple',
          label: 'Bảng Giá Couple'
        },
        {
          href: '/bang-gia/wedding',
          label: 'Bảng Giá Wedding'
        },
        {
          href: '/bang-gia/team',
          label: 'Bảng Giá Team'
        },
        {
          href: '/bang-gia/gia-dinh',
          label: 'Bảng Giá Gia Đình'
        },
        {
          href: '/bang-gia/quang-cao',
          label: 'Bảng Giá Quảng Cáo'
        },
        {
          href: '/bang-gia/video',
          label: 'Bảng Giá Video'
        },
        {
          href: '/bang-gia/dich-vu-khac',
          label: 'Bảng Giá Dịch Vụ Khác'
        }
      ]
    },
    {
      href: '/lien-he',
      label: 'Liên Hệ'
    }
  ]
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)
  const [activeSubDropdown, setActiveSubDropdown] = useState<string | null>(null)

  const handleDropdownToggle = (label: string) => {
    setActiveDropdown(activeDropdown === label ? null : label)
    setActiveSubDropdown(null)
  }

  const handleSubDropdownToggle = (label: string) => {
    setActiveSubDropdown(activeSubDropdown === label ? null : label)
  }

  const closeDropdowns = () => {
    setActiveDropdown(null)
    setActiveSubDropdown(null)
  }

  const closeMobileMenu = () => {
    setMobileMenuOpen(false)
  }

  return (
    <header
      className={`fixed top-0 right-0 left-0 z-50 flex items-center justify-between border-b border-gray-600/20 px-4 backdrop-blur-sm sm:px-6 sm:py-3 md:px-8 lg:px-12 ${className}`}
    >
      {/* Logo */}
      <div className="flex-shrink-0">
        <Link href="/" onClick={closeDropdowns}>
          {logoSrc ? (
            <Image src={logoSrc} alt={logoAlt} width={150} height={50} className="h-auto max-h-12 w-auto" priority />
          ) : (
            <span className="font-kapakana text-lg sm:text-xl md:text-2xl">{logoText}</span>
          )}
        </Link>
      </div>

      {/* Desktop Navigation Menu */}
      <nav className="hidden items-center gap-4 md:flex md:gap-6 lg:gap-8">
        {navigationItems.map(item => (
          <div key={item.href} className="group relative">
            {item.children ? (
              <div className="relative">
                <button
                  onClick={() => handleDropdownToggle(item.label)}
                  className="flex items-center gap-1 text-xs font-medium transition-colors hover:text-[#c8c8c8] md:text-sm"
                >
                  {item.label}
                  <div className="text-2xl">
                    <MdArrowDropDown />
                  </div>
                </button>

                {/* Main Dropdown Menu */}
                <div
                  className={`invisible absolute top-full -left-2.5 mt-2 w-auto min-w-max bg-[#585858] opacity-0 transition-all duration-200 group-hover:visible group-hover:opacity-100 ${activeDropdown === item.label ? 'visible opacity-100' : ''}`}
                >
                  {item.children.map(child => (
                    <div key={child.href} className="group/sub relative">
                      {child.children ? (
                        <div className="relative">
                          <button
                            onClick={() => handleSubDropdownToggle(child.label)}
                            className="flex w-full items-center justify-between px-4 py-3 text-left text-white transition-colors hover:bg-[#ededed] hover:text-[#585858]"
                          >
                            <div className="text-sm font-medium">{child.label}</div>
                            <div className="-rotate-90 text-2xl">
                              <MdArrowDropDown />
                            </div>
                          </button>

                          {/* Sub-dropdown Menu */}
                          <div
                            className={`invisible absolute top-0 left-full w-auto min-w-max bg-[#585858] opacity-0 transition-all duration-200 group-hover/sub:visible group-hover/sub:opacity-100 ${activeSubDropdown === child.label ? 'visible opacity-100' : ''}`}
                          >
                            {child.children.map(subChild => (
                              <Link
                                key={subChild.href}
                                href={subChild.href}
                                className="block px-4 py-3 text-white transition-colors hover:bg-[#ededed] hover:text-[#585858]"
                                onClick={closeDropdowns}
                              >
                                <div className="text-sm font-medium">{subChild.label}</div>
                              </Link>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <Link
                          href={child.href}
                          className="block px-4 py-3 text-white transition-colors hover:bg-[#ededed] hover:text-[#585858]"
                          onClick={closeDropdowns}
                        >
                          <div className="text-sm font-medium">{child.label}</div>
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Link
                href={item.href}
                className="text-xs font-medium transition-colors hover:text-[#c8c8c8] md:text-sm"
                onClick={closeDropdowns}
              >
                {item.label}
              </Link>
            )}
          </div>
        ))}
      </nav>

      {/* Social Links */}
      {showSocialLinks && (
        <div className="hidden md:flex">
          <SocialLinks iconSize="responsive" variant="circle" />
        </div>
      )}

      {/* Mobile Menu Button */}
      {showMobileMenu && (
        <div className="md:hidden">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded p-2 text-white transition-colors hover:bg-gray-600 flex items-center justify-center"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      )}

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="absolute top-full right-0 left-0 max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-gray-600/20 bg-[#313132] md:hidden">
          <div className="space-y-2 px-4 py-4">
            {navigationItems.map(item => (
              <div key={item.href}>
                {item.children ? (
                  <div>
                    <button
                      onClick={() => handleDropdownToggle(item.label)}
                      className="flex w-full items-center justify-between py-2 text-left text-sm font-medium"
                    >
                      {item.label}
                      <ChevronDown
                        className={`h-4 w-4 transition-transform duration-200 ${activeDropdown === item.label ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {activeDropdown === item.label && (
                      <div className="mt-2 ml-4 space-y-1">
                        {item.children.map(child => (
                          <div key={child.href}>
                            {child.children ? (
                              <div>
                                <button
                                  onClick={() => handleSubDropdownToggle(child.label)}
                                  className="flex w-full items-center justify-between py-2 text-left text-sm text-gray-300 transition-colors hover:text-white"
                                >
                                  {child.label}
                                  <ChevronDown
                                    className={`h-4 w-4 transition-transform duration-200 ${activeSubDropdown === child.label ? 'rotate-180' : ''}`}
                                  />
                                </button>
                                {activeSubDropdown === child.label && (
                                  <div className="mt-2 ml-4 space-y-1">
                                    {child.children.map(subChild => (
                                      <Link
                                        key={subChild.href}
                                        href={subChild.href}
                                        className="block py-2 text-sm text-gray-400 transition-colors hover:text-white"
                                        onClick={closeMobileMenu}
                                      >
                                        {subChild.label}
                                      </Link>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <Link
                                href={child.href}
                                className="block py-2 text-sm text-gray-300 transition-colors hover:text-white"
                                onClick={closeMobileMenu}
                              >
                                {child.label}
                              </Link>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <Link
                    href={item.href}
                    className="block py-2 text-sm font-medium transition-colors hover:text-gray-300"
                    onClick={closeMobileMenu}
                  >
                    {item.label}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </header>
  )
}

export default Header
