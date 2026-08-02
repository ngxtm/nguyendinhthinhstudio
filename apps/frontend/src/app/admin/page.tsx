/**
 * Admin Dashboard
 * Overview và quick stats với dữ liệu thực
 */

'use client'

import { useState } from 'react'
import { Plus, FolderOpen, Image, Eye, Tag, Folder, TrendingUp } from 'lucide-react'
import { listAlbums, getAlbumDashboardStats, type Album, type AlbumDashboardStats } from '@/lib/api/albums'
import { formatFullCount } from '@/lib/format'
import { useAbortableEffect } from './hooks'

export default function AdminDashboard() {
  const [stats, setStats] = useState<AlbumDashboardStats>({
    totalAlbums: 0,
    publishedAlbums: 0,
    draftAlbums: 0,
    totalImages: 0,
    totalViews: 0
  })
  const [loading, setLoading] = useState(true)
  const [recentAlbums, setRecentAlbums] = useState<Album[]>([])

  useAbortableEffect(signal => {
    async function loadDashboardData() {
      try {
        setLoading(true)

        const [statsResponse, recentResponse] = await Promise.all([
          getAlbumDashboardStats(),
          listAlbums({ sortBy: 'newest', limit: 5 }, { signal, admin: true })
        ])

        // Only update state if not aborted
        if (signal.aborted) return

        setStats(statsResponse)

        // Lấy 5 albums mới nhất
        setRecentAlbums(recentResponse.data)
      } catch (error) {
        if (signal.aborted) {
          return
        }

        const abortError =
          (error instanceof DOMException && error.name === 'AbortError') || (error as any)?.name === 'AbortError'

        if (abortError) {
          return
        }

        console.error('Failed to load dashboard data:', error)
      } finally {
        if (!signal.aborted) {
          setLoading(false)
        }
      }
    }

    loadDashboardData()
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Đang tải bảng điều khiển...</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-2 text-3xl font-bold text-gray-900">Bảng điều khiển</h1>
      <p className="mb-8 text-gray-600">Tổng quan hoạt động của trang web</p>

      {/* Quick Stats Grid */}
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Tổng số bộ ảnh"
          value={stats.totalAlbums.toString()}
          description={`${stats.publishedAlbums} đã xuất bản, ${stats.draftAlbums} nháp`}
          icon={<FolderOpen className="h-6 w-6" />}
          color="blue"
        />
        <StatCard
          title="Bộ ảnh đã xuất bản"
          value={stats.publishedAlbums.toString()}
          description="Đang hiển thị công khai"
          icon={<Folder className="h-6 w-6" />}
          color="green"
        />
        <StatCard
          title="Tổng Hình Ảnh"
          value={stats.totalImages.toString()}
          description="Đã tải lên thành công"
          icon={<Image className="h-6 w-6" />}
          color="purple"
        />
        <StatCard
          title="Tổng Lượt Xem"
          value={formatFullCount(stats.totalViews)}
          description="Lượt xem của tất cả bộ ảnh"
          icon={<TrendingUp className="h-6 w-6" />}
          color="orange"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Quick Actions */}
        <div className="lg:col-span-1">
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
              <Plus className="h-5 w-5" />
              Thao Tác Nhanh
            </h2>
            <div className="space-y-3">
              <a
                href="/admin/albums/new"
                className="flex items-center gap-3 rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700"
              >
                <Plus size={18} />
                <span>Tạo bộ ảnh mới</span>
              </a>
              <a
                href="/admin/albums"
                className="flex items-center gap-3 rounded-lg border-2 border-gray-200 px-4 py-3 font-medium transition-colors hover:border-blue-400 hover:bg-blue-50"
              >
                <FolderOpen size={18} />
                <span>Quản lý bộ ảnh</span>
              </a>
              <a
                href="/admin/tags"
                className="flex items-center gap-3 rounded-lg border-2 border-gray-200 px-4 py-3 font-medium transition-colors hover:border-purple-400 hover:bg-purple-50"
              >
                <Tag size={18} />
                <span>Quản lý thẻ</span>
              </a>
              <a
                href="/admin/categories"
                className="flex items-center gap-3 rounded-lg border-2 border-gray-200 px-4 py-3 font-medium transition-colors hover:border-green-400 hover:bg-green-50"
              >
                <Folder size={18} />
                <span>Quản lý danh mục</span>
              </a>
              <a
                href="/thu-vien"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-lg border-2 border-gray-200 px-4 py-3 font-medium transition-colors hover:border-orange-400 hover:bg-orange-50"
              >
                <Eye size={18} />
                <span>Xem trang web</span>
              </a>
            </div>
          </div>
        </div>

        {/* Recent Albums */}
        <div className="lg:col-span-2">
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold">Bộ ảnh gần đây</h2>
            {recentAlbums.length === 0 ? (
              <p className="py-8 text-center text-gray-500">Chưa có bộ ảnh nào</p>
            ) : (
              <div className="space-y-3">
                {recentAlbums.map(album => (
                  <a
                    key={album.id}
                    href={`/admin/albums/${album.slug}`}
                    className="flex items-center gap-4 rounded-lg border border-gray-100 p-3 transition-colors hover:bg-gray-50"
                  >
                    {album.coverImage?.thumbnailUrl ? (
                      <img
                        src={album.coverImage.thumbnailUrl}
                        alt={album.title}
                        className="h-16 w-16 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded bg-gray-200">
                        <Image className="h-6 w-6 text-gray-400" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-medium text-gray-900">{album.title}</h3>
                      <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Image size={14} />
                          {album.imageCount} ảnh
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye size={14} />
                          {formatFullCount(album.viewCount)} lượt xem
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            album.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {album.status === 'published' ? 'Đã xuất bản' : 'Nháp'}
                        </span>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  title,
  value,
  description,
  icon,
  color
}: {
  title: string
  value: string
  description: string
  icon: React.ReactNode
  color: 'blue' | 'green' | 'purple' | 'orange'
}) {
  const colorClasses = {
    blue: {
      bg: 'bg-blue-50',
      text: 'text-blue-600',
      iconBg: 'bg-blue-100'
    },
    green: {
      bg: 'bg-green-50',
      text: 'text-green-600',
      iconBg: 'bg-green-100'
    },
    purple: {
      bg: 'bg-purple-50',
      text: 'text-purple-600',
      iconBg: 'bg-purple-100'
    },
    orange: {
      bg: 'bg-orange-50',
      text: 'text-orange-600',
      iconBg: 'bg-orange-100'
    }
  }

  const colors = colorClasses[color]

  return (
    <div className={`${colors.bg} rounded-lg border border-gray-100 p-6`}>
      <div className="mb-3 flex items-start justify-between">
        <h3 className="text-sm font-medium text-gray-600">{title}</h3>
        <div className={`${colors.iconBg} rounded-lg p-2 ${colors.text}`}>{icon}</div>
      </div>
      <p className={`text-3xl font-bold ${colors.text} mb-1`}>{value}</p>
      <p className="text-sm text-gray-500">{description}</p>
    </div>
  )
}
