/**
 * Albums List Page
 * Hiển thị danh sách albums với actions
 */

'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Plus, Edit, Trash2, Eye, Star, Search } from 'lucide-react';
import { toast } from 'sonner';
import { listAlbums, deleteAlbum, toggleFeatured, type Album } from '../../lib/api';
import { useAbortableEffect, useDebouncedValue } from '../hooks';

type AlbumFilter = 'all' | 'published' | 'draft';

export default function AlbumsPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AlbumFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const debouncedSearch = useDebouncedValue(searchTerm, 300);
  const trimmedSearch = debouncedSearch.trim();

  useAbortableEffect((signal) => {
    async function loadAlbums() {
      try {
        setLoading(true);
        const response = await listAlbums(
          {
            status: filter === 'all' ? undefined : filter,
            limit: 50,
            search: trimmedSearch ? trimmedSearch : undefined,
          },
          { signal }
        );

        if (!signal.aborted) {
          setAlbums(response.data);
        }
      } catch (error: any) {
        if (signal.aborted) {
          return;
        }

        const isAbortError = error?.name === 'AbortError' || error instanceof DOMException && error.name === 'AbortError';
        if (isAbortError) {
          return;
        }

        console.error('Failed to load albums:', error);
        toast.error('Không thể tải danh sách albums');
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadAlbums();
  }, [filter, trimmedSearch]);

  const isSearching = trimmedSearch.length > 0;

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc muốn xóa album này?')) return;

    try {
      await deleteAlbum(id);
      setAlbums((previous) => previous.filter((album) => album.id !== id));
      toast.success('Đã xóa album!');
    } catch (error) {
      console.error('Failed to delete album:', error);
      toast.error('Không thể xóa album');
    }
  };

  const handleToggleFeatured = async (album: Album) => {
    try {
      const updated = await toggleFeatured(album.id);
      setAlbums((previous) =>
        previous.map((item) => (item.id === album.id ? updated : item)),
      );
    } catch (error) {
      console.error('Failed to toggle featured:', error);
      toast.error('Không thể cập nhật featured status');
    }
  };

  return (
    <div>
      <AlbumsHeader />
      <AlbumsToolbar
        filter={filter}
        onFilterChange={setFilter}
        search={searchTerm}
        onSearchChange={setSearchTerm}
      />
      <AlbumsContent
        albums={albums}
        loading={loading}
        onToggleFeatured={handleToggleFeatured}
        onDelete={handleDelete}
        isSearching={isSearching}
      />
    </div>
  );
}

function AlbumsHeader() {
  return (
    <div className="flex flex-col gap-3 mb-8 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Albums</h1>
        <p className="text-gray-600">Quản lý danh sách albums và trạng thái hiển thị</p>
      </div>
      <Link
        href="/admin/albums/new"
        className="flex items-center gap-2 self-start rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-blue-700"
      >
        <Plus size={18} />
        Tạo Album Mới
      </Link>
    </div>
  );
}

function AlbumsToolbar({
  filter,
  onFilterChange,
  search,
  onSearchChange,
}: {
  filter: AlbumFilter;
  onFilterChange: (filter: AlbumFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const filters = useMemo(
    () => [
      { label: 'Tất cả', value: 'all' as AlbumFilter },
      { label: 'Published', value: 'published' as AlbumFilter },
      { label: 'Draft', value: 'draft' as AlbumFilter },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <FilterPill
            key={item.value}
            label={item.label}
            active={filter === item.value}
            onClick={() => onFilterChange(item.value)}
          />
        ))}
      </div>
      <div className="relative w-full md:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Tìm kiếm album..."
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>
    </div>
  );
}

function AlbumsContent({
  albums,
  loading,
  onToggleFeatured,
  onDelete,
  isSearching,
}: {
  albums: Album[];
  loading: boolean;
  onToggleFeatured: (album: Album) => void;
  onDelete: (id: string) => void;
  isSearching: boolean;
}) {
  if (loading) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500">Đang tải danh sách albums...</p>
      </div>
    );
  }

  if (albums.length === 0) {
    return <EmptyState isSearching={isSearching} />;
  }

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow">
      <AlbumsTable
        albums={albums}
        onToggleFeatured={onToggleFeatured}
        onDelete={onDelete}
      />
    </div>
  );
}

function AlbumsTable({
  albums,
  onToggleFeatured,
  onDelete,
}: {
  albums: Album[];
  onToggleFeatured: (album: Album) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <table className="w-full">
      <thead className="border-b border-gray-200 bg-gray-50">
        <tr>
          <TableHeader>Album</TableHeader>
          <TableHeader>Category</TableHeader>
          <TableHeader>Status</TableHeader>
          <TableHeader>Images</TableHeader>
          <TableHeader>Views</TableHeader>
          <TableHeader align="right">Actions</TableHeader>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200">
        {albums.map((album) => (
          <AlbumRow
            key={album.id}
            album={album}
            onToggleFeatured={onToggleFeatured}
            onDelete={onDelete}
          />
        ))}
      </tbody>
    </table>
  );
}

function AlbumRow({
  album,
  onToggleFeatured,
  onDelete,
}: {
  album: Album;
  onToggleFeatured: (album: Album) => void;
  onDelete: (id: string) => void;
}) {
  const manualCategories = album.categories?.filter((cat) => cat.source === 'manual') ?? [];

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          {album.coverImage ? (
            <img
              src={album.coverImage.thumbnailUrl}
              alt={album.title}
              className="h-12 w-12 rounded object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded bg-gray-200">
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
        <span className="text-sm text-gray-600">
          {manualCategories.length > 0
            ? manualCategories.map((cat) => cat.name).join(', ')
            : '-'}
        </span>
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
            onClick={() => onToggleFeatured(album)}
            className={`rounded p-2 transition-colors hover:bg-gray-100 ${
              album.isFeatured ? 'text-yellow-500' : 'text-gray-400'
            }`}
            title={album.isFeatured ? 'Đang featured' : 'Chưa featured'}
          >
            <Star size={18} fill={album.isFeatured ? 'currentColor' : 'none'} />
          </button>
          <Link
            href={`/admin/albums/${album.slug}`}
            className="rounded p-2 text-blue-600 transition-colors hover:bg-gray-100"
          >
            <Edit size={18} />
          </Link>
          <button
            onClick={() => onDelete(album.id)}
            className="rounded p-2 text-red-600 transition-colors hover:bg-gray-100"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function EmptyState({ isSearching }: { isSearching: boolean }) {
  return (
    <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white py-12 text-center">
      <p className="mb-4 text-gray-500">
        {isSearching ? 'Không tìm thấy album nào khớp với từ khóa.' : 'Chưa có album nào.'}
      </p>
      {!isSearching && (
        <Link
          href="/admin/albums/new"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
        >
          <Plus size={16} />
          Tạo Album Đầu Tiên
        </Link>
      )}
    </div>
  );
}

function TableHeader({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) {
  const alignment = align === 'right' ? 'text-right' : 'text-left';
  return (
    <th className={`px-6 py-3 text-xs font-medium uppercase tracking-wide text-gray-500 ${alignment}`}>
      {children}
    </th>
  );
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'bg-blue-600 text-white shadow-sm'
          : 'border border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:text-blue-600'
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
  } as const;

  const colorClass = colors[status as keyof typeof colors] ?? colors.draft;

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}>
      {status}
    </span>
  );
}
