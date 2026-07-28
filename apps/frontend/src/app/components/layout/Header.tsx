'use client'
import Image from 'next/image'
import Link from 'next/link'
import SocialLinks from '../common/SocialLinks'
import { useState } from 'react'
import { ChevronDown, Menu, X } from 'lucide-react'
import { MdArrowDropDown } from 'react-icons/md'
import { buildPublicNavigation, type PublicNavigationItem } from '@/lib/public-navigation'

interface SubMenuItem {
  href: string
  label: string
  children?: Array<{
    href: string
    label: string
  }>
}

interface NavigationItem extends PublicNavigationItem {
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
  navigationItems = buildPublicNavigation([])
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)
  const [activeSubDropdown, setActiveSubDropdown] = useState<string | null>(null)

  const handleMouseEnter = (label: string) => {
    setActiveDropdown(label)
  }

  const handleSubDropdownMouseEnter = (label: string) => {
    setActiveSubDropdown(label)
  }

  const handleMouseLeave = () => {
    setActiveDropdown(null)
    setActiveSubDropdown(null)
  }

  const closeDropdowns = () => {
    setActiveDropdown(null)
    setActiveSubDropdown(null)
  }

  const handleDropdownToggle = (label: string) => {
    setActiveDropdown(activeDropdown === label ? null : label)
    setActiveSubDropdown(null)
  }

  const handleSubDropdownToggle = (label: string) => {
    setActiveSubDropdown(activeSubDropdown === label ? null : label)
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
            <span className="font-montserrat text-base sm:text-lg md:text-xl">{logoText}</span>
          )}
        </Link>
      </div>

      {/* Desktop Navigation Menu */}
      <nav className="hidden items-center gap-4 md:flex md:gap-6 lg:gap-8">
        {navigationItems.map(item => (
          <div
            key={item.href}
            className="group relative"
            onMouseEnter={() => handleMouseEnter(item.label)}
            onMouseLeave={handleMouseLeave}
          >
            {item.children ? (
              <div className="relative">
                <Link
                  href={item.href}
                  className="flex items-center gap-1 text-xs font-medium transition-colors hover:text-[#c8c8c8] md:text-sm"
                >
                  {item.label}
                  <div className="text-2xl">
                    <MdArrowDropDown />
                  </div>
                </Link>

                {/* Main Dropdown Menu */}
                <div
                  className={`absolute top-full -left-2.5 mt-2 w-auto min-w-max bg-[#585858] opacity-0 transition-all duration-200 ${activeDropdown === item.label ? 'visible opacity-100' : 'invisible'}`}
                  onMouseEnter={() => handleMouseEnter(item.label)}
                  onMouseLeave={handleMouseLeave}
                >
                  {item.children.map(child => (
                    <div
                      key={child.href}
                      className="group/sub relative"
                      onMouseEnter={() => handleSubDropdownMouseEnter(child.label)}
                      onMouseLeave={() => {
                        // Only close sub-dropdown if we're leaving the entire dropdown area
                        if (!activeDropdown) {
                          setActiveSubDropdown(null)
                        }
                      }}
                    >
                      {child.children ? (
                        <div className="relative">
                          <div className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left text-white transition-colors hover:bg-[#ededed] hover:text-[#585858]">
                            <div className="text-sm font-medium">{child.label}</div>
                            <div className="-rotate-90 text-2xl">
                              <MdArrowDropDown />
                            </div>
                          </div>

                          {/* Sub-dropdown Menu */}
                          <div
                            className={`absolute top-0 left-full w-auto min-w-max bg-[#585858] opacity-0 transition-all duration-200 ${activeSubDropdown === child.label ? 'visible opacity-100' : 'invisible'}`}
                            onMouseEnter={() => handleSubDropdownMouseEnter(child.label)}
                            onMouseLeave={() => setActiveSubDropdown(null)}
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
            className="flex items-center justify-center rounded p-2 text-white transition-all duration-300 ease-in-out hover:bg-gray-600"
          >
            <div className="transition-transform duration-300 ease-in-out">
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </div>
          </button>
        </div>
      )}

      {/* Mobile Menu */}
      <div
        className={`absolute top-full right-0 left-0 max-h-[calc(100vh-4rem)] transform overflow-y-auto border-t border-gray-600/20 bg-[#313132]/95 backdrop-blur-md transition-all duration-300 ease-in-out md:hidden ${
          mobileMenuOpen
            ? 'max-h-[calc(100vh-4rem)] translate-y-0 opacity-100 shadow-2xl'
            : 'pointer-events-none max-h-0 -translate-y-4 opacity-0'
        }`}
      >
        <div className="space-y-1 px-4 py-4">
          {navigationItems.map(item => (
            <div key={item.href}>
              {item.children ? (
                <div>
                  <div className="flex items-center justify-between">
                    <Link
                      href={item.href}
                      className="py-2 text-sm font-medium transition-colors hover:text-gray-300"
                      onClick={closeMobileMenu}
                    >
                      {item.label}
                    </Link>
                    <button
                      onClick={() => handleDropdownToggle(item.label)}
                      className="flex max-h-fit items-center justify-center text-white transition-colors hover:text-gray-300"
                      aria-label={`Toggle ${item.label} submenu`}
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform duration-300 ease-in-out ${activeDropdown === item.label ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </div>
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      activeDropdown === item.label
                        ? 'mt-2 ml-4 max-h-[1000px] space-y-1 opacity-100'
                        : 'ml-4 max-h-0 opacity-0'
                    }`}
                  >
                    {item.children.map(child => (
                      <div key={child.href}>
                        {child.children ? (
                          <div>
                            <div className="flex items-center justify-between">
                              <Link
                                href={child.href}
                                className="py-2 text-sm text-gray-300 transition-colors hover:text-white"
                                onClick={closeMobileMenu}
                              >
                                {child.label}
                              </Link>
                              <button
                                onClick={() => handleSubDropdownToggle(child.label)}
                                className="p-1 text-gray-300 transition-colors hover:text-white"
                                aria-label={`Toggle ${child.label} submenu`}
                              >
                                <ChevronDown
                                  className={`h-4 w-4 transition-transform duration-300 ease-in-out ${activeSubDropdown === child.label ? 'rotate-180' : ''}`}
                                />
                              </button>
                            </div>
                            <div
                              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                                activeSubDropdown === child.label
                                  ? 'mt-2 ml-4 max-h-[500px] space-y-1 opacity-100'
                                  : 'ml-4 max-h-0 opacity-0'
                              }`}
                            >
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
    </header>
  )
}

export default Header
