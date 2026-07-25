/**
 * Album Detail & Upload Page
 * Chi tiết album + Upload ảnh + Quản lý images
 */

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Upload, Edit, Trash2, Star } from 'lucide-react';
import { toast } from 'sonner';
import {
  getAlbum,
  setCoverImage,
  publishAlbum,
  type Album,
  type Image,
} from '@/lib/api';
import { formatFullCount } from '@/lib/format';
import ImageUploadZone from '../../components/ImageUploadZone';
import ImageGrid from '../../components/ImageGrid';

export default function AlbumDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.id as string; // This is actually a slug, not an ID

  const [album, setAlbum] = useState<Album | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

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
      toast.error('Không thể tải album');
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  async function handleSetCover(imageId: string): Promise<boolean> {
    if (!album) return false;

    try {
      const updated = await setCoverImage(album.id, imageId);
      setAlbum(updated);
      toast.success('Đã đặt ảnh cover!');
      return true;
    } catch (error) {
      console.error('Failed to set cover:', error);
      toast.error('Không thể đặt ảnh cover');
      return false;
    }
  }

  async function handlePublish() {
    if (!album) return;

    if (!album.images || album.images.length === 0) {
      toast.error('Vui lòng upload ít nhất 1 ảnh trước khi publish');
      return;
    }

    if (!album.coverImage) {
      toast.error('Vui lòng chọn ảnh cover trước khi publish');
      return;
    }

    try {
      const updated = await publishAlbum(album.id);
      setAlbum(updated);
      toast.success('Đã publish album!');
    } catch (error) {
      console.error('Failed to publish album:', error);
      toast.error('Không thể publish album');
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
        <p className="text-gray-500 mb-4">Không tìm thấy album</p>
        <Link href="/admin/albums" className="text-blue-600 hover:underline">
          Quay lại danh sách albums
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/admin/albums"
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
              Edit
            </Link>
            {album.status !== 'published' && (
              <button
                onClick={handlePublish}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Publish
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Album Info */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-4 gap-6">
          <div>
            <p className="text-sm text-gray-500">Status</p>
            <p className="font-medium">
              <StatusBadge status={album.status} />
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Category</p>
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
            <p className="text-sm text-gray-500">Images</p>
            <p className="font-medium">{album.imageCount} ảnh</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Views</p>
            <p className="font-medium">{formatFullCount(album.viewCount)}</p>
          </div>
        </div>
      </div>

      {/* Upload Section */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Upload Ảnh</h2>
        <ImageUploadZone
          albumId={album.id}
          onUploadComplete={handleUploadComplete}
        />
        <p className="text-sm text-gray-500 mt-2">
          * Tối đa 50 ảnh/album, 100MB/ảnh. Hỗ trợ JPG, PNG, WebP, GIF
        </p>
      </div>

      {/* Images Grid */}
      <div>
        <h2 className="text-xl font-semibold mb-4">
          Ảnh trong album ({album.images?.length || 0})
        </h2>
        {album.images && album.images.length > 0 ? (
          <ImageGrid
            images={album.images}
            coverImageId={album.coverImage?.id}
            onSetCover={handleSetCover}
            onDelete={loadAlbum}
            onReorder={loadAlbum}
          />
        ) : (
          <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed border-gray-300">
            <Upload size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500 mb-2">Chưa có ảnh nào</p>
            <p className="text-sm text-gray-400">
              Kéo thả hoặc click vào khu vực bên trên để upload
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
