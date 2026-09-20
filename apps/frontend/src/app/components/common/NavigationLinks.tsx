import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

interface NavigationLink {
  label: string
  href: string
}

interface NavigationLinksProps {
  links: NavigationLink[]
  className?: string
  separatorClassName?: string
  linkClassName?: string
  showArrows?: boolean
}

/**
 * NavigationLinks Component
 * Hiển thị danh sách các liên kết ngang với separator
 *
 * @example
 * <NavigationLinks
 *   links={[
 *     { label: 'Khám Phá', href: '/thu-vien' },
 *     { label: 'Liên Hệ', href: '/lien-he' },
 *     { label: 'Đặt Lịch', href: '/dat-lich' }
 *   ]}
 * />
 */
export default function NavigationLinks({
  links,
  className = '',
  separatorClassName = 'text-neutral-400',
  linkClassName = 'text-neutral-700 dark:text-neutral-200 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors',
  showArrows = true
}: NavigationLinksProps) {
  if (!links || links.length === 0) return null

  return (
    <div className={`flex flex-wrap items-center justify-center gap-2 sm:gap-3 ${className}`}>
      {links.map((link, index) => (
        <div key={link.href} className="flex items-center gap-2 sm:gap-3">
          <Link
            href={link.href}
            className={`inline-flex items-center text-sm font-medium leading-none tracking-wide transition-all duration-200 sm:text-base ${linkClassName}`}
          >
            {link.label}
          </Link>

          {/* Separator - hiển thị nếu không phải item cuối cùng */}
          {index < links.length - 1 && showArrows && (
            <ChevronRight
              size={16}
              className={`flex-shrink-0 ${separatorClassName}`}
              strokeWidth={2}
            />
          )}
        </div>
      ))}
    </div>
  )
}
