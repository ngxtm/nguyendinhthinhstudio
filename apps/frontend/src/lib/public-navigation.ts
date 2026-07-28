import type { PublicCategory } from './api/categories'

export interface PublicSubMenuItem {
  href: string
  label: string
  children?: PublicSubMenuItem[]
}

export interface PublicNavigationItem {
  href: string
  label: string
  children?: PublicSubMenuItem[]
}

function categoryMenuItem(category: PublicCategory): PublicSubMenuItem {
  const children = category.children?.map(categoryMenuItem)
  return {
    href: `/thu-vien/danh-muc/${category.slug}`,
    label: category.name,
    ...(children?.length ? { children } : {})
  }
}

export function buildPublicNavigation(categories: PublicCategory[]): PublicNavigationItem[] {
  const galleryChildren = categories.map(categoryMenuItem)
  return [
    { href: '/', label: 'Trang Chủ' },
    {
      href: '/gioi-thieu',
      label: 'Giới Thiệu',
      children: [
        { href: '/gioi-thieu/chinh-sach', label: 'Chính Sách' },
        { href: '/gioi-thieu/dich-vu', label: 'Dịch Vụ' },
        { href: '/gioi-thieu/quy-trinh', label: 'Quy Trình' }
      ]
    },
    {
      href: '/thu-vien',
      label: 'Thư Viện Ảnh',
      ...(galleryChildren.length ? { children: galleryChildren } : {})
    },
    { href: '/video', label: 'Video' },
    {
      href: '/bang-gia',
      label: 'Bảng Giá',
      children: [
        { href: '/bang-gia/ca-nhan', label: 'Bảng Giá Cá Nhân' },
        { href: '/bang-gia/couple', label: 'Bảng Giá Couple' },
        { href: '/bang-gia/wedding', label: 'Bảng Giá Wedding' },
        { href: '/bang-gia/team', label: 'Bảng Giá Team' },
        { href: '/bang-gia/gia-dinh', label: 'Bảng Giá Gia Đình' },
        { href: '/bang-gia/video', label: 'Bảng Giá Video' }
      ]
    },
    { href: '/lien-he', label: 'Liên Hệ' }
  ]
}

export function categoryHref(slug: string, publicSlugs: ReadonlySet<string>): string {
  return publicSlugs.has(slug) ? `/thu-vien/danh-muc/${slug}` : '/thu-vien'
}
