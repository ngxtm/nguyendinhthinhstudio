'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  House,
  Image as ImageIcon,
  Tag,
  FolderOpen,
  LibraryBig,
  Users,
  Menu,
  X,
  ChevronDown
} from 'lucide-react'
import { Toaster } from 'sonner'
import { getBrowserSupabase } from '@/lib/auth/supabase'
import { getAccessTokenRole, signOutAndReturnToAdminLogin } from '@/lib/auth/session'
import { AdminAccessDenied } from './access-denied'

type NavItem = { href: string; label: string; icon: React.ReactNode }
type NavGroup = { group: string; icon: React.ReactNode; items: NavItem[] }
type NavEntry = NavItem | NavGroup

const NAV_ENTRIES: NavEntry[] = [
  { href: '/admin', label: 'Bảng điều khiển', icon: <LayoutDashboard size={18} /> },
  { href: '/admin/homepage', label: 'Trang chủ', icon: <House size={18} /> },
  {
    group: 'Quản lý thư viện',
    icon: <LibraryBig size={18} />,
    items: [
      { href: '/admin/albums', label: 'Bộ ảnh', icon: <ImageIcon size={18} /> },
      { href: '/admin/categories', label: 'Danh mục', icon: <FolderOpen size={18} /> },
      { href: '/admin/tags', label: 'Thẻ', icon: <Tag size={18} /> },
      { href: '/admin/library', label: 'Cấu hình thư viện', icon: <LibraryBig size={18} /> }
    ]
  },
  { href: '/admin/staff', label: 'Quản lý nhân viên', icon: <Users size={18} /> }
]

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [authState, setAuthState] = useState<'checking' | 'admin' | 'denied'>('checking')
  const [signingOut, setSigningOut] = useState(false)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (pathname === '/admin/login') return
    const client = getBrowserSupabase()
    client.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token
      const role = getAccessTokenRole(token)
      if (role === 'admin') setAuthState('admin')
      else if (data.session) setAuthState('denied')
      else router.replace('/admin/login?next=' + encodeURIComponent(pathname || '/admin'))
    })
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace('/admin/login?next=' + encodeURIComponent(pathname || '/admin'))
    })
    return () => listener.subscription.unsubscribe()
  }, [pathname, router])

  const activePath = useMemo(() => pathname ?? '/admin', [pathname])
  const closeSidebar = () => setSidebarOpen(false)

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await signOutAndReturnToAdminLogin(getBrowserSupabase(), router)
    } finally {
      setSigningOut(false)
    }
  }

  if (pathname === '/admin/login') return <>{children}</>
  if (authState === 'checking') {
    return <div className="flex min-h-screen items-center justify-center">Đang kiểm tra phiên đăng nhập…</div>
  }
  if (authState === 'denied') {
    return <AdminAccessDenied onSignOut={handleSignOut} signingOut={signingOut} />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex min-h-screen">
        {sidebarOpen && (
          <button
            type="button"
            aria-label="Đóng thanh bên"
            className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm lg:hidden"
            onClick={closeSidebar}
          />
        )}

        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-64 transform flex-col overflow-hidden border-r border-gray-200 bg-white transition-transform duration-300 ease-in-out lg:z-30 lg:translate-x-0 lg:border-r lg:shadow-none ${
            sidebarOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full lg:translate-x-0'
          }`}
          aria-label="Điều hướng thanh bên"
        >
          <div className="flex shrink-0 items-center justify-between px-6 py-5 lg:py-6">
            <Link href="/admin" className="text-2xl font-bold text-gray-900" onClick={closeSidebar}>
              NDT Studio <span className="text-amber-400">Quản trị</span>
            </Link>
            <button
              type="button"
              aria-label="Ẩn thanh bên"
              className="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 lg:hidden"
              onClick={closeSidebar}
            >
              <X size={20} />
            </button>
          </div>

          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 py-2">
            {NAV_ENTRIES.map(entry => {
              if ('group' in entry) {
                const groupActive = entry.items.some(item =>
                  item.href === '/admin' ? activePath === '/admin' : activePath.startsWith(item.href)
                )
                const isOpen = openGroups[entry.group] ?? groupActive
                return (
                  <NavGroup
                    key={entry.group}
                    label={entry.group}
                    icon={entry.icon}
                    items={entry.items}
                    activePath={activePath}
                    isOpen={isOpen}
                    onToggle={() => setOpenGroups(current => ({ ...current, [entry.group]: !isOpen }))}
                    onNavigate={closeSidebar}
                  />
                )
              }

              const active = entry.href === '/admin' ? activePath === '/admin' : activePath.startsWith(entry.href)
              return (
                <NavLink
                  key={entry.href}
                  href={entry.href}
                  label={entry.label}
                  icon={entry.icon}
                  active={active}
                  onNavigate={closeSidebar}
                />
              )
            })}
          </nav>

          <div className="mt-auto shrink-0 space-y-3 border-t border-gray-200 px-6 py-4">
            <button
              type="button"
              disabled={signingOut}
              className="block text-sm font-medium text-gray-600 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleSignOut}
            >
              {signingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}
            </button>
            <Link
              href="/"
              className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
              onClick={closeSidebar}
            >
              ← Về trang chính
            </Link>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shadow-sm lg:hidden">
            <button
              type="button"
              aria-label="Mở thanh bên"
              className="rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={22} />
            </button>
            <Link href="/admin" className="text-lg font-semibold text-gray-900">
              NDT Studio Quản trị
            </Link>
            <span className="w-9" aria-hidden="true" />
          </header>

          <main className="flex-1 overflow-auto">
            <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
          </main>
        </div>
      </div>

      <Toaster position="top-right" richColors closeButton duration={3000} />
    </div>
  )
}

function NavLink({
  href,
  icon,
  label,
  active,
  onNavigate
}: {
  href: string
  icon: React.ReactNode
  label: string
  active: boolean
  onNavigate: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
        active ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      <span className={active ? 'text-blue-600' : 'text-gray-500'}>{icon}</span>
      <span>{label}</span>
    </Link>
  )
}

function NavGroup({
  label,
  icon,
  items,
  activePath,
  isOpen,
  onToggle,
  onNavigate
}: {
  label: string
  icon: React.ReactNode
  items: NavItem[]
  activePath: string
  isOpen: boolean
  onToggle: () => void
  onNavigate: () => void
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900"
      >
        <span className="text-gray-500">{icon}</span>
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown size={16} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="mt-1 ml-4 space-y-1 border-l border-gray-200 pl-3">
          {items.map(item => {
            const active = item.href === '/admin' ? activePath === '/admin' : activePath.startsWith(item.href)
            return (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={active}
                onNavigate={onNavigate}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
