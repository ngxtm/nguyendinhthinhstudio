/**
 * Public Gallery Page
 * Hiển thị tất cả albums với infinite scroll
 */

'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Eye } from 'lucide-react';
import { listAlbums, type Album } from '@/app/lib/api';

export default function GalleryPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadAlbums(true);
  }, []);

  useEffect(() => {
    // Setup Intersection Observer cho infinite scroll
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadAlbums(false);
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, loadingMore, cursor]);

  async function loadAlbums(initial: boolean) {
    try {
      if (initial) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const response = await listAlbums({
        status: 'published',
        limit: 20,
        cursor: initial ? undefined : cursor || undefined,
        sortBy: 'newest',
      });

      if (initial) {
        setAlbums(response.data);
      } else {
        setAlbums((prev) => [...prev, ...response.data]);
      }

      setHasMore(response.pagination.hasMore);
      setCursor(response.pagination.nextCursor);
    } catch (error) {
      console.error('Failed to load albums:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Đang tải...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Thư Viện Ảnh</h1>
          <p className="text-gray-600">
            Khám phá những bộ ảnh đẹp của NDT Studio
          </p>
        </div>

        {/* Albums Grid */}
        {albums.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Chưa có album nào</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {albums.map((album) => (
                <AlbumCard key={album.id} album={album} />
              ))}
            </div>

            {/* Load More Trigger */}
            <div ref={loadMoreRef} className="h-20 flex items-center justify-center">
              {loadingMore && (
                <p className="text-gray-500">Đang tải thêm...</p>
              )}
              {!hasMore && albums.length > 0 && (
                <p className="text-gray-400">Đã hiển thị tất cả albums</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AlbumCard({ album }: { album: Album }) {
  return (
    <Link href={`/thu-vien/${album.slug}`} className="group">
      <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow">
        {/* Cover Image */}
        <div className="aspect-[4/3] bg-gray-200 overflow-hidden">
          {album.coverImage ? (
            <img
              src={album.coverImage.mediumUrl}
              alt={album.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Eye size={48} className="text-gray-400" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
            {album.title}
          </h3>

          {album.description && (
            <p className="text-gray-600 text-sm mb-4 line-clamp-2">
              {album.description}
            </p>
          )}

          {/* Tags */}
          {album.tags && album.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {album.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag.id}
                  className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full"
                >
                  {tag.name}
                </span>
              ))}
              {album.tags.length > 3 && (
                <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                  +{album.tags.length - 3}
                </span>
              )}
            </div>
          )}

          {/* Stats */}
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>{album.imageCount} ảnh</span>
            <span>{album.viewCount} lượt xem</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
