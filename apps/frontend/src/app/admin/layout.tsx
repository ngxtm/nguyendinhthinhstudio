import type { Metadata } from 'next'
import AdminShell from './AdminShell'

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  }
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 [color-scheme:light]">
      <AdminShell>{children}</AdminShell>
    </div>
  )
}
