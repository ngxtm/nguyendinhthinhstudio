/**
 * Album Detail Page (Public)
 * Hiển thị tất cả ảnh trong album + Related albums
 */

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Eye } from 'lucide-react';
import { getAlbum, getRelatedAlbums, type Album } from '@/app/lib/api';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen';
import Counter from 'yet-another-react-lightbox/plugins/counter';
import 'yet-another-react-lightbox/styles.css';
import 'yet-another-react-lightbox/plugins/counter.css';

export default function AlbumDetailPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [album, setAlbum] = useState<Album | null>(null);
  const [relatedAlbums, setRelatedAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState(-1);

  // Convert images to lightbox slides format
  const slides = album?.images?.map((img) => ({
    src: img.largeUrl,
    alt: img.altText || album.title,
    width: img.width || 1920,
    height: img.height || 1080,
  })) || [];

  useEffect(() => {
    if (slug) {
      loadAlbum();
      loadRelatedAlbums();
    }
  }, [slug]);

  async function loadAlbum() {
    try {
      setLoading(true);
      const data = await getAlbum(slug);
      setAlbum(data);
    } catch (error) {
      console.error('Failed to load album:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadRelatedAlbums() {
    try {
      const data = await getRelatedAlbums(slug);
      setRelatedAlbums(data);
    } catch (error) {
      console.error('Failed to load related albums:', error);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Đang tải...</p>
      </div>
    );
  }

  if (!album) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Không tìm thấy album</p>
          <Link href="/thu-vien" className="text-blue-600 hover:underline">
            Quay lại thư viện
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-7xl mx-auto">
          {/* Back Button */}
          <Link
            href="/thu-vien"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
          >
            <ArrowLeft size={20} />
            Quay lại thư viện
          </Link>

          {/* Album Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">{album.title}</h1>
            {album.description && (
              <p className="text-gray-600 max-w-2xl mx-auto">{album.description}</p>
            )}

            {/* Tags */}
            {album.tags && album.tags.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 mt-6">
                {album.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="px-3 py-1 bg-white text-gray-700 text-sm rounded-full border border-gray-200"
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            )}

            {/* Stats */}
            <div className="flex items-center justify-center gap-6 mt-6 text-sm text-gray-500">
              <span>{album.imageCount} ảnh</span>
              <span>•</span>
              <span>{album.viewCount} lượt xem</span>
            </div>
          </div>

          {/* Images Grid */}
          {album.images && album.images.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-16">
              {album.images.map((image, index) => (
                <div
                  key={image.id}
                  onClick={() => setLightboxIndex(index)}
                  className="aspect-square bg-gray-200 rounded-lg overflow-hidden cursor-pointer group"
                >
                  <img
                    src={image.mediumUrl}
                    alt={image.altText || `${album.title} - ${index + 1}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500">Album này chưa có ảnh</p>
            </div>
          )}

          {/* Related Albums */}
          {relatedAlbums.length > 0 && (
            <div className="mt-16">
              <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">
                Album Liên Quan
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {relatedAlbums.slice(0, 8).map((related) => (
                  <Link
                    key={related.id}
                    href={`/thu-vien/${related.slug}`}
                    className="group"
                  >
                    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow">
                      <div className="aspect-square bg-gray-200 overflow-hidden">
                        {related.coverImage ? (
                          <img
                            src={related.coverImage.thumbnailUrl}
                            alt={related.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Eye size={32} className="text-gray-400" />
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                          {related.title}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                          {related.imageCount} ảnh
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Professional Lightbox with Zoom & Fullscreen */}
      <Lightbox
        open={lightboxIndex >= 0}
        close={() => setLightboxIndex(-1)}
        index={lightboxIndex}
        slides={slides}
        plugins={[Zoom, Fullscreen, Counter]}
        zoom={{
          maxZoomPixelRatio: 5,
          zoomInMultiplier: 2,
          doubleTapDelay: 300,
          doubleClickDelay: 300,
          doubleClickMaxStops: 2,
          keyboardMoveDistance: 50,
          wheelZoomDistanceFactor: 100,
          pinchZoomDistanceFactor: 100,
          scrollToZoom: true,
        }}
        carousel={{
          finite: false,
          preload: 2,
        }}
        animation={{
          fade: 250,
          swipe: 500,
        }}
        controller={{
          closeOnBackdropClick: true,
        }}
        styles={{
          container: {
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
          },
        }}
      />

      {/* Custom CSS for transparent background */}
      <style jsx global>{`
        .yarl__root {
          --yarl__color_backdrop: rgba(0, 0, 0, 0.7) !important;
        }
      `}</style>
    </>
  );
}
