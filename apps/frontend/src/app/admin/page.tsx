/**
 * Admin Dashboard
 * Overview và quick stats với dữ liệu thực
 */

'use client'

import { useState } from 'react'
import { Plus, FolderOpen, Image, Eye, Tag, Folder, TrendingUp } from 'lucide-react'
import { listAlbums, getAlbumDashboardStats, type Album, type AlbumDashboardStats } from '../lib/api/albums'
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

  useAbortableEffect((signal) => {
    async function loadDashboardData() {
      try {
        setLoading(true)

        const [statsResponse, recentResponse] = await Promise.all([
          getAlbumDashboardStats(),
          listAlbums({ sortBy: 'newest', limit: 5 }, { signal })
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
          (error instanceof DOMException && error.name === 'AbortError') ||
          ((error as any)?.name === 'AbortError')

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
        <p className="text-gray-500">Đang tải dashboard...</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
      <p className="text-gray-600 mb-8">Tổng quan hoạt động của website</p>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Tổng Albums"
          value={stats.totalAlbums.toString()}
          description={`${stats.publishedAlbums} đã xuất bản, ${stats.draftAlbums} nháp`}
          icon={<FolderOpen className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          title="Albums Published"
          value={stats.publishedAlbums.toString()}
          description="Đang hiển thị công khai"
          icon={<Folder className="w-6 h-6" />}
          color="green"
        />
        <StatCard
          title="Tổng Hình Ảnh"
          value={stats.totalImages.toString()}
          description="Đã upload thành công"
          icon={<Image className="w-6 h-6" />}
          color="purple"
        />
        <StatCard
          title="Tổng Lượt Xem"
          value={stats.totalViews.toLocaleString()}
          description="Views trên tất cả albums"
          icon={<TrendingUp className="w-6 h-6" />}
          color="orange"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Thao Tác Nhanh
            </h2>
            <div className="space-y-3">
              <a
                href="/admin/albums/new"
                className="flex items-center gap-3 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                <Plus size={18} />
                <span>Tạo Album Mới</span>
              </a>
              <a
                href="/admin/albums"
                className="flex items-center gap-3 px-4 py-3 border-2 border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors font-medium"
              >
                <FolderOpen size={18} />
                <span>Quản Lý Albums</span>
              </a>
              <a
                href="/admin/tags"
                className="flex items-center gap-3 px-4 py-3 border-2 border-gray-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-colors font-medium"
              >
                <Tag size={18} />
                <span>Quản Lý Tags</span>
              </a>
              <a
                href="/admin/categories"
                className="flex items-center gap-3 px-4 py-3 border-2 border-gray-200 rounded-lg hover:border-green-400 hover:bg-green-50 transition-colors font-medium"
              >
                <Folder size={18} />
                <span>Quản Lý Categories</span>
              </a>
              <a
                href="/thu-vien"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3 border-2 border-gray-200 rounded-lg hover:border-orange-400 hover:bg-orange-50 transition-colors font-medium"
              >
                <Eye size={18} />
                <span>Xem Website</span>
              </a>
            </div>
          </div>
        </div>

        {/* Recent Albums */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Albums Gần Đây</h2>
            {recentAlbums.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Chưa có album nào</p>
            ) : (
              <div className="space-y-3">
                {recentAlbums.map((album) => (
                  <a
                    key={album.id}
                    href={`/admin/albums/${album.slug}`}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50 transition-colors border border-gray-100"
                  >
                    {album.coverImage?.thumbnailUrl ? (
                      <img
                        src={album.coverImage.thumbnailUrl}
                        alt={album.title}
                        className="w-16 h-16 object-cover rounded"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center">
                        <Image className="w-6 h-6 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 truncate">{album.title}</h3>
                      <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                        <span className="flex items-center gap-1">
                          <Image size={14} />
                          {album.imageCount} ảnh
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye size={14} />
                          {album.viewCount} views
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          album.status === 'published'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {album.status === 'published' ? 'Published' : 'Draft'}
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
  );
}

function StatCard({
  title,
  value,
  description,
  icon,
  color,
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'purple' | 'orange';
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
  };

  const colors = colorClasses[color];

  return (
    <div className={`${colors.bg} rounded-lg p-6 border border-gray-100`}>
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-600">{title}</h3>
        <div className={`${colors.iconBg} p-2 rounded-lg ${colors.text}`}>
          {icon}
        </div>
      </div>
      <p className={`text-3xl font-bold ${colors.text} mb-1`}>{value}</p>
      <p className="text-sm text-gray-500">{description}</p>
    </div>
  );
}

