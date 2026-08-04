/**
 * Album Detail & Upload Page
 * Chi tiết album + Upload ảnh + Quản lý images
 */

'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Upload, Edit, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import {
  getAlbum,
  setCoverImage,
  publishAlbum,
  type Album,
} from '@/lib/api';
import { formatFullCount } from '@/lib/format';
import ImageUploadZone from '../../components/ImageUploadZone';
import ImageGrid from '../../components/ImageGrid';
import { getAdminAlbumListHref, parseAdminAlbumListContext } from '../list-context';

export default function AlbumDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.id as string; // This is actually a slug, not an ID
  const albumListHref = getAdminAlbumListHref(parseAdminAlbumListContext(searchParams));

  const [album, setAlbum] = useState<Album | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);

  useEffect(() => {
    if (slug) {
      loadAlbum();
    }
  }, [slug]);

  async function loadAlbum(
    { showLoading = true }: { showLoading?: boolean } = {},
  ): Promise<void> {
    try {
      if (showLoading) setLoading(true);
      const data = await getAlbum(slug, true); // Use authenticated read for draft albums
      setAlbum(data);
    } catch (error) {
      console.error('Failed to load album:', error);
      toast.error('Không thể tải bộ ảnh');
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  async function handleSetCover(imageId: string): Promise<boolean> {
    if (!album) return false;

    try {
      const updated = await setCoverImage(album.id, imageId);
      setAlbum(updated);
      toast.success('Đã đặt ảnh bìa!');
      return true;
    } catch (error) {
      console.error('Failed to set cover:', error);
      toast.error('Không thể đặt ảnh bìa');
      return false;
    }
  }

  async function handlePublish() {
    if (!album || isPublishing) return;

    if (!album.images || album.images.length === 0) {
      toast.error('Vui lòng tải lên ít nhất 1 ảnh trước khi xuất bản');
      return;
    }

    if (!album.coverImage) {
      toast.error('Vui lòng chọn ảnh bìa trước khi xuất bản');
      return;
    }

    setIsPublishing(true);
    try {
      const updated = await publishAlbum(album.id);
      setAlbum(updated);
      await loadAlbum({ showLoading: false });
      toast.success('Đã xuất bản bộ ảnh!');
    } catch (error) {
      console.error('Failed to publish album:', error);
      toast.error('Không thể xuất bản bộ ảnh');
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleUploadComplete(): Promise<void> {
    await loadAlbum({ showLoading: false });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Đang tải...</p>
      </div>
    );
  }

  if (!album) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">Không tìm thấy bộ ảnh</p>
        <Link href={albumListHref} className="text-blue-600 hover:underline">
          Quay lại danh sách bộ ảnh
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link
          href={albumListHref}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft size={20} />
          Quay lại
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{album.title}</h1>
            <p className="text-gray-500">/{album.slug}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/admin/albums/${album.slug}/edit`}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Edit size={18} />
              Chỉnh sửa
            </Link>
            {album.status !== 'published' && (
              <button
                onClick={handlePublish}
                disabled={isPublishing}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPublishing ? 'Đang xuất bản...' : 'Xuất bản'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Album Info */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-4 gap-6">
          <div>
            <p className="text-sm text-gray-500">Trạng thái</p>
            <p className="font-medium">
              <StatusBadge status={album.status} />
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Danh mục</p>
            <p className="font-medium">
              {album.categories && album.categories.length > 0
                ? album.categories
                    .filter(cat => cat.source === 'manual')
                    .map(cat => cat.name)
                    .join(', ') || '-'
                : '-'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Hình ảnh</p>
            <p className="font-medium">{album.imageCount} ảnh</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Lượt xem</p>
            <p className="font-medium">{formatFullCount(album.viewCount)}</p>
          </div>
        </div>
      </div>

      {/* Upload Section */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Tải ảnh lên</h2>
        <ImageUploadZone
          albumId={album.id}
          disabled={selectionMode}
          onUploadingChange={setUploading}
          onUploadComplete={handleUploadComplete}
        />
        <p className="text-sm text-gray-500 mt-2">
          * Tối đa 50 ảnh/bộ ảnh, 100MB/ảnh. Hỗ trợ JPG, PNG, WebP, GIF
        </p>
      </div>

      {/* Images Grid */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold">
            Ảnh trong bộ ảnh ({album.images?.length || 0})
          </h2>
          {!selectionMode && album.images && album.images.length > 0 && (
            <button
              type="button"
              disabled={uploading}
              onClick={() => setSelectionMode(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              title={uploading ? 'Hoàn tất tải ảnh lên trước khi chọn ảnh' : undefined}
            >
              <ListChecks size={18} aria-hidden="true" />
              Chọn ảnh
            </button>
          )}
        </div>
        {album.images && album.images.length > 0 ? (
          <ImageGrid
            albumId={album.id}
            images={album.images}
            coverImageId={album.coverImage?.id}
            selectionMode={selectionMode}
            selectionDisabled={uploading}
            onSelectionModeChange={setSelectionMode}
            onAlbumUpdated={setAlbum}
            onSetCover={handleSetCover}
            onDelete={loadAlbum}
            onReorder={loadAlbum}
          />
        ) : (
          <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed border-gray-300">
            <Upload size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500 mb-2">Chưa có ảnh nào</p>
            <p className="text-sm text-gray-400">
              Kéo thả hoặc nhấp vào khu vực bên trên để tải ảnh lên
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors = {
    published: 'bg-green-100 text-green-800',
    draft: 'bg-gray-100 text-gray-800',
    scheduled: 'bg-blue-100 text-blue-800',
  };
  const labels = {
    published: 'Đã xuất bản',
    draft: 'Nháp',
    scheduled: 'Đã lên lịch',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        colors[status as keyof typeof colors] || colors.draft
      }`}
    >
      {labels[status as keyof typeof labels] || 'Không xác định'}
    </span>
  );
}
