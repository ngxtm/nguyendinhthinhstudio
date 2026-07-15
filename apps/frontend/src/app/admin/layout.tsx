"use client";

/**
 * Admin Layout
 * Responsive layout với sidebar ẩn/hiện trên mobile
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Image as ImageIcon,
  Tag,
  FolderOpen,
  Settings,
  Menu,
  X,
} from 'lucide-react';
import { Toaster } from 'sonner';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/auth/supabase';
import { getAccessTokenRole, signOutAndReturnToAdminLogin } from '@/lib/auth/session';
import { AdminAccessDenied } from './access-denied';

const NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { href: '/admin/albums', label: 'Albums', icon: <ImageIcon size={18} /> },
  { href: '/admin/categories', label: 'Categories', icon: <FolderOpen size={18} /> },
  { href: '/admin/tags', label: 'Tags', icon: <Tag size={18} /> },
  { href: '/admin/settings', label: 'Settings', icon: <Settings size={18} /> },
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authState, setAuthState] = useState<'checking' | 'admin' | 'denied'>('checking');
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (pathname === '/admin/login') return;
    const client = getBrowserSupabase();
    client.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      const role = getAccessTokenRole(token);
      if (role === 'admin') setAuthState('admin');
      else if (data.session) setAuthState('denied');
      else router.replace('/admin/login?next=' + encodeURIComponent(pathname || '/admin'));
    });
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace('/admin/login?next=' + encodeURIComponent(pathname || '/admin'));
    });
    return () => listener.subscription.unsubscribe();
  }, [pathname, router]);

  const activePath = useMemo(() => pathname ?? '/admin', [pathname]);

  const closeSidebar = () => setSidebarOpen(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOutAndReturnToAdminLogin(getBrowserSupabase(), router);
    } finally {
      setSigningOut(false);
    }
  };

  if (pathname === '/admin/login') return <>{children}</>;
  if (authState === 'checking') return <div className="flex min-h-screen items-center justify-center">Đang kiểm tra phiên đăng nhập…</div>;
  if (authState === 'denied') return <AdminAccessDenied onSignOut={handleSignOut} signingOut={signingOut} />;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex min-h-screen">
        {/* Mobile Overlay */}
        {sidebarOpen && (
          <button
            type="button"
            aria-label="Close sidebar"
            className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm lg:hidden"
            onClick={closeSidebar}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-64 transform flex-col border-r border-gray-200 bg-white transition-transform duration-300 ease-in-out lg:static lg:z-0 lg:translate-x-0 lg:border-r lg:shadow-none ${
            sidebarOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full lg:translate-x-0'
          }`}
          aria-label="Sidebar navigation"
        >
          <div className="flex items-center justify-between px-6 py-5 lg:py-6">
            <Link href="/admin" className="text-2xl font-bold text-gray-900" onClick={closeSidebar}>
              NDT Studio <span className="text-amber-400">Admin</span>
            </Link>
            <button
              type="button"
              aria-label="Hide sidebar"
              className="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 lg:hidden"
              onClick={closeSidebar}
            >
              <X size={20} />
            </button>
          </div>

          <nav className="flex-1 space-y-1 px-4 py-2">
            {NAV_ITEMS.map((item) => {
              const active = item.href === '/admin'
                ? activePath === '/admin'
                : activePath.startsWith(item.href);

              return (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  active={active}
                  onNavigate={closeSidebar}
                />
              );
            })}
          </nav>

          <div className="mt-auto border-t border-gray-200 px-6 py-4 space-y-3">
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

        {/* Main Content */}
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shadow-sm lg:hidden">
            <button
              type="button"
              aria-label="Open sidebar"
              className="rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={22} />
            </button>
            <Link href="/admin" className="text-lg font-semibold text-gray-900">
              NDT Studio Admin
            </Link>
            <span className="w-9" aria-hidden="true" />
          </header>

          <main className="flex-1 overflow-auto">
            <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
              {children}
            </div>
          </main>
        </div>
      </div>

      <Toaster position="top-right" richColors closeButton duration={3000} />
    </div>
  );
}

function NavLink({
  href,
  icon,
  label,
  active,
  onNavigate,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
        active
          ? 'bg-blue-50 text-blue-600'
          : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      <span className={active ? 'text-blue-600' : 'text-gray-500'}>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

