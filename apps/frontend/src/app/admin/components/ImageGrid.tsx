/**
 * Image Grid Component
 * Hiển thị và quản lý images (set cover, delete, reorder)
 */

'use client';

import { useState } from 'react';
import { Star, Trash2, GripVertical } from 'lucide-react';
import { deleteImage, reorderImages, type Image } from '@/app/lib/api';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen';
import Counter from 'yet-another-react-lightbox/plugins/counter';
import 'yet-another-react-lightbox/styles.css';
import 'yet-another-react-lightbox/plugins/counter.css';

interface Props {
  images: Image[];
  coverImageId?: string;
  onSetCover: (imageId: string) => void;
  onDelete: () => void;
  onReorder: () => void;
}

export default function ImageGrid({
  images,
  coverImageId,
  onSetCover,
  onDelete,
  onReorder,
}: Props) {
  const [localImages, setLocalImages] = useState(images);
  const [lightboxIndex, setLightboxIndex] = useState(-1);

  // Convert images to lightbox slides format
  const slides = localImages.map((img) => ({
    src: img.largeUrl,
    alt: img.altText || img.filename,
    width: img.width || 1920,
    height: img.height || 1080,
  }));

  async function handleDelete(image: Image) {
    if (!confirm(`Xóa ảnh "${image.filename}"?`)) return;

    try {
      await deleteImage(image.id);
      setLocalImages(localImages.filter((img) => img.id !== image.id));
      alert('Đã xóa ảnh!');
      onDelete();
    } catch (error) {
      console.error('Failed to delete image:', error);
      alert('Không thể xóa ảnh');
    }
  }

  // Drag and drop for reordering (basic implementation)
  function handleDragStart(e: React.DragEvent, index: number) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  async function handleDrop(e: React.DragEvent, dropIndex: number) {
    e.preventDefault();
    const dragIndex = Number(e.dataTransfer.getData('text/plain'));

    if (dragIndex === dropIndex) return;

    // Reorder local state
    const newImages = [...localImages];
    const [removed] = newImages.splice(dragIndex, 1);
    newImages.splice(dropIndex, 0, removed);
    setLocalImages(newImages);

    // Update backend
    try {
      const imageIds = newImages.map((img) => img.id);
      await reorderImages(images[0]?.albumId || '', imageIds);
      onReorder();
    } catch (error) {
      console.error('Failed to reorder images:', error);
      alert('Không thể sắp xếp lại ảnh');
      // Revert local state
      setLocalImages(images);
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {localImages.map((image, index) => (
          <div
            key={image.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, index)}
            className="relative group cursor-move"
          >
            <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 relative">
              <img
                src={image.thumbnailUrl}
                alt={image.altText || image.filename}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setLightboxIndex(index)}
              />

              {/* Cover Badge */}
              {image.id === coverImageId && (
                <div className="absolute top-2 left-2 px-2 py-1 bg-yellow-500 text-white text-xs font-medium rounded">
                  Cover
                </div>
              )}

              {/* Drag Handle */}
              <div className="absolute top-2 right-2 p-1 bg-black bg-opacity-50 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                <GripVertical size={16} className="text-white" />
              </div>

              {/* Actions Overlay */}
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetCover(image.id);
                  }}
                  className="p-2 bg-white rounded-full hover:bg-yellow-100 transition-colors"
                  title="Đặt làm cover"
                >
                  <Star
                    size={18}
                    className={image.id === coverImageId ? 'text-yellow-500 fill-yellow-500' : 'text-gray-700'}
                  />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(image);
                  }}
                  className="p-2 bg-white rounded-full hover:bg-red-100 transition-colors"
                  title="Xóa ảnh"
                >
                  <Trash2 size={18} className="text-red-600" />
                </button>
              </div>
            </div>

            <p className="mt-1 text-xs text-gray-500 truncate">{image.filename}</p>
            <p className="text-xs text-gray-400">Order: {image.orderIndex}</p>
          </div>
        ))}
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
          toolbar: {
            display: 'flex',
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
