/**
 * Albums List Page
 * Hiển thị danh sách albums với actions
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Edit, Trash2, Eye, Star } from 'lucide-react';
import { listAlbums, deleteAlbum, toggleFeatured, type Album } from '@/app/lib/api';

export default function AlbumsPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all');

  useEffect(() => {
    loadAlbums();
  }, [filter]);

  async function loadAlbums() {
    try {
      setLoading(true);
      const response = await listAlbums({
        status: filter === 'all' ? undefined : filter,
        limit: 50,
      });
      setAlbums(response.data);
    } catch (error) {
      console.error('Failed to load albums:', error);
      alert('Không thể tải danh sách albums');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Bạn có chắc muốn xóa album này?')) return;

    try {
      await deleteAlbum(id);
      setAlbums(albums.filter((a) => a.id !== id));
      alert('Đã xóa album!');
    } catch (error) {
      console.error('Failed to delete album:', error);
      alert('Không thể xóa album');
    }
  }

  async function handleToggleFeatured(album: Album) {
    try {
      const updated = await toggleFeatured(album.id);
      setAlbums(albums.map((a) => (a.id === album.id ? updated : a)));
    } catch (error) {
      console.error('Failed to toggle featured:', error);
      alert('Không thể cập nhật featured status');
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Albums</h1>
        <Link
          href="/admin/albums/new"
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          <Plus size={20} />
          Tạo Album Mới
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <FilterButton
          label="Tất cả"
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        <FilterButton
          label="Published"
          active={filter === 'published'}
          onClick={() => setFilter('published')}
        />
        <FilterButton
          label="Draft"
          active={filter === 'draft'}
          onClick={() => setFilter('draft')}
        />
      </div>

      {/* Albums List */}
      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Đang tải...</p>
        </div>
      ) : albums.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-gray-500 mb-4">Chưa có album nào</p>
          <Link
            href="/admin/albums/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            Tạo Album Đầu Tiên
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Album
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Images
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Views
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {albums.map((album) => (
                <tr key={album.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {album.coverImage ? (
                        <img
                          src={album.coverImage.thumbnailUrl}
                          alt={album.title}
                          className="w-12 h-12 rounded object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded bg-gray-200 flex items-center justify-center">
                          <Eye size={20} className="text-gray-400" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-gray-900">{album.title}</p>
                        <p className="text-sm text-gray-500">/{album.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-600">{album.category}</span>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={album.status} />
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900">{album.imageCount}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900">{album.viewCount}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleToggleFeatured(album)}
                        className={`p-2 rounded hover:bg-gray-100 ${
                          album.isFeatured ? 'text-yellow-500' : 'text-gray-400'
                        }`}
                        title={album.isFeatured ? 'Featured' : 'Not featured'}
                      >
                        <Star size={18} fill={album.isFeatured ? 'currentColor' : 'none'} />
                      </button>
                      <Link
                        href={`/admin/albums/${album.slug}`}
                        className="p-2 rounded hover:bg-gray-100 text-blue-600"
                      >
                        <Edit size={18} />
                      </Link>
                      <button
                        onClick={() => handleDelete(album.id)}
                        className="p-2 rounded hover:bg-gray-100 text-red-600"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
      }`}
    >
      {label}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors = {
    published: 'bg-green-100 text-green-800',
    draft: 'bg-gray-100 text-gray-800',
    scheduled: 'bg-blue-100 text-blue-800',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        colors[status as keyof typeof colors] || colors.draft
      }`}
    >
      {status}
    </span>
  );
}
