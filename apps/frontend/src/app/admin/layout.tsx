/**
 * Admin Layout
 * Layout cho toàn bộ admin panel với sidebar navigation
 */

import Link from 'next/link';
import { LayoutDashboard, Image, Tag, Settings } from 'lucide-react';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-gray-900">
            NDT Studio Admin
          </h1>
        </div>

        <nav className="px-4 space-y-1">
          <NavLink
            href="/admin"
            icon={<LayoutDashboard size={20} />}
            label="Dashboard"
          />
          <NavLink
            href="/admin/albums"
            icon={<Image size={20} />}
            label="Albums"
          />
          <NavLink
            href="/admin/tags"
            icon={<Tag size={20} />}
            label="Tags"
          />
          <NavLink
            href="/admin/settings"
            icon={<Settings size={20} />}
            label="Settings"
          />
        </nav>

        <div className="absolute bottom-0 w-64 p-4 border-t border-gray-200">
          <Link
            href="/"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            ← Về trang chính
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-8">{children}</div>
      </main>
    </div>
  );
}

function NavLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  // TODO: Add active state detection using usePathname()
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 text-gray-700 hover:text-gray-900 transition-colors"
    >
      {icon}
      <span className="font-medium">{label}</span>
    </Link>
  );
}

