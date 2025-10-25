/**
 * Image Grid Component
 * Hiển thị và quản lý images (set cover, delete, reorder)
 */

'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import Masonry from 'react-masonry-css';
import { Star, Trash2, GripVertical } from 'lucide-react';
import { deleteImage, reorderImages, type Image } from '../../lib/api';
import { toast } from 'sonner';
import { usePhotoSwipe } from '../../lib/photoswipe';
import 'photoswipe/style.css';

const CLOUDFLARE_HASH = process.env.NEXT_PUBLIC_CLOUDFLARE_IMAGES_HASH;

function getHighQualityUrl(imageUrl?: string | null) {
  if (!imageUrl) {
    return null;
  }

  const match = imageUrl.match(/imagedelivery\.net\/[^/]+\/([^/]+)\//);
  if (match && match[1] && CLOUDFLARE_HASH) {
    const imageId = match[1];
    return `https://imagedelivery.net/${CLOUDFLARE_HASH}/${imageId}/xlarge?width=3840&quality=80&format=auto`;
  }

  return imageUrl;
}

interface Props {
  images: Image[];
  coverImageId?: string;
  onSetCover: (imageId: string) => Promise<boolean>;
  onDelete: () => Promise<void>;
  onReorder: () => Promise<void>;
}

export default function ImageGrid({
  images,
  coverImageId,
  onSetCover,
  onDelete,
  onReorder,
}: Props) {
  const [localImages, setLocalImages] = useState(images);
  const [dimensions, setDimensions] = useState<Record<string, { width: number; height: number }>>({});
  const [activeSwipeId, setActiveSwipeId] = useState<string | null>(null);
  const masonryBreakpoints = useMemo(
    () => ({
      default: 4,
      1536: 4,
      1280: 3,
      1024: 3,
      768: 2,
      640: 2,
      480: 1,
    }),
    [],
  );

  // Sync local state with props when images change
  useEffect(() => {
    setLocalImages(images);
  }, [images]);

  const galleryId = 'admin-album-gallery';
  const galleryKey = useMemo(
    () =>
      localImages
        .map((img) => {
          const dims = dimensions[img.id];
          const width = dims?.width ?? img.width ?? 'auto';
          const height = dims?.height ?? img.height ?? 'auto';
          return `${img.id}:${width}x${height}`;
        })
        .join('|'),
    [localImages, dimensions],
  );

  usePhotoSwipe({
    options: {
      gallery: `#${galleryId}`,
      children: 'a[data-pswp-src]',
      pswpModule: () => import('photoswipe'),
    },
    dependencies: [galleryKey],
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    // Seed known dimensions from database
    setDimensions((prev) => {
      const next = { ...prev };
      localImages.forEach((img) => {
        if (img.width && img.height && !next[img.id]) {
          next[img.id] = { width: img.width, height: img.height };
        }
      });
      return next;
    });

    const missing = localImages.filter((img) => !img.width || !img.height);
    if (missing.length === 0) {
      return;
    }

    let cancelled = false;

    missing.forEach((image) => {
      const loader = new window.Image();
      loader.onload = () => {
        if (cancelled) return;
        setDimensions((prev) => ({
          ...prev,
          [image.id]: {
            width: loader.naturalWidth || image.width || 2048,
            height: loader.naturalHeight || image.height || 1365,
          },
        }));
      };
      loader.onerror = () => {
        if (cancelled) return;
        setDimensions((prev) => ({
          ...prev,
          [image.id]: {
            width: image.width || 2048,
            height: image.height || 1365,
          },
        }));
      };
      loader.src = image.xlargeUrl || image.largeUrl || image.mediumUrl || image.smallUrl || image.thumbnailUrl;
    });

    return () => {
      cancelled = true;
    };
  }, [localImages]);

  async function handleDelete(image: Image): Promise<boolean> {
    if (!confirm(`Xóa ảnh "${image.filename}"?`)) return false;

    try {
      await deleteImage(image.id);
      setLocalImages((prev) => prev.filter((img) => img.id !== image.id));
      toast.success('Đã xóa ảnh!');
      await onDelete();
      return true;
    } catch (error) {
      console.error('Failed to delete image:', error);
      toast.error('Không thể xóa ảnh');
      return false;
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
      toast.success('Đã sắp xếp lại ảnh!');
      await onReorder();
    } catch (error) {
      console.error('Failed to reorder images:', error);
      toast.error('Không thể sắp xếp lại ảnh');
      // Revert local state
      setLocalImages(images);
    }
  }

  return (
    <>
      <div id={galleryId}>
        <Masonry
          breakpointCols={masonryBreakpoints}
          className="-ml-4 flex w-auto md:-ml-6"
          columnClassName="pl-4 md:pl-6 bg-clip-padding"
        >
          {localImages.map((image, index) => {
            const dims = dimensions[image.id] ?? {
              width: image.width || 2048,
              height: image.height || 1365,
            };

            return (
              <AlbumImageTile
                key={image.id}
                image={image}
                index={index}
                dimensions={dims}
                coverImageId={coverImageId}
                showActions={activeSwipeId === image.id}
                onOpenSwipe={setActiveSwipeId}
                onCloseSwipe={() => setActiveSwipeId(null)}
                onSetCover={onSetCover}
                onDelete={handleDelete}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />
            );
          })}
        </Masonry>
      </div>
      <style jsx global>{`
        .pswp {
          --pswp-bg: rgba(0, 0, 0, 0.92);
        }

        .pswp__bg {
          background: rgba(0, 0, 0, 0.92) !important;
        }

        .pswp__top-bar {
          background: rgba(17, 24, 39, 0.5);
        }

        .pswp__button {
          color: #f9fafb;
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}

interface AlbumImageTileProps {
  image: Image;
  index: number;
  dimensions: { width: number; height: number };
  coverImageId?: string;
  showActions: boolean;
  onOpenSwipe: (id: string) => void;
  onCloseSwipe: () => void;
  onSetCover: (id: string) => Promise<boolean>;
  onDelete: (image: Image) => Promise<boolean>;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, index: number) => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>, index: number) => void;
}

function AlbumImageTile({
  image,
  index,
  dimensions,
  coverImageId,
  showActions,
  onOpenSwipe,
  onCloseSwipe,
  onSetCover,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
}: AlbumImageTileProps) {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const [isActionPending, setIsActionPending] = useState(false);

  const resetTouch = () => {
    touchStartX.current = null;
    touchStartY.current = null;
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null || touchStartY.current === null) {
      return;
    }

    const touch = event.touches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = Math.abs(touch.clientY - touchStartY.current);

    if (deltaY > 25) {
      return;
    }

    if (deltaX <= -40) {
      onOpenSwipe(image.id);
    } else if (deltaX >= 40) {
      onCloseSwipe();
    }
  };

  const handleTouchEnd = () => {
    resetTouch();
  };

  const handleAnchorClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (showActions || isActionPending) {
      event.preventDefault();
      event.stopPropagation();
      if (showActions && !isActionPending) {
        onCloseSwipe();
      }
    }
  };

  const handleSetCover = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (isActionPending) return;

    setIsActionPending(true);
    try {
      const success = await onSetCover(image.id);
      if (success) {
        onCloseSwipe();
      }
    } finally {
      setIsActionPending(false);
    }
  };

  const handleDeleteImage = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (isActionPending) return;

    setIsActionPending(true);
    try {
      const deleted = await onDelete(image);
      if (deleted) {
        onCloseSwipe();
      }
    } finally {
      setIsActionPending(false);
    }
  };

  const overlayIsInteractive = showActions || isActionPending;

  return (
    <div
      className="relative group mb-4 cursor-move touch-pan-y md:mb-6"
      draggable
      onDragStart={(event) => onDragStart(event, index)}
      onDragOver={onDragOver}
      onDrop={(event) => onDrop(event, index)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div className="relative" style={{ animation: `fadeInUp 0.6s ease-out ${index * 0.04}s both` }}>
        <a
          href={getHighQualityUrl(image.xlargeUrl || image.largeUrl) || image.largeUrl || image.mediumUrl || image.smallUrl || image.thumbnailUrl}
          data-pswp-src={getHighQualityUrl(image.xlargeUrl || image.largeUrl) || image.largeUrl || image.mediumUrl || image.smallUrl || image.thumbnailUrl}
          data-pswp-width={dimensions.width}
          data-pswp-height={dimensions.height}
          className="block"
          onClick={handleAnchorClick}
        >
          <div className="relative overflow-hidden rounded-md bg-gray-100 shadow-md transition-shadow hover:shadow-lg md:rounded-lg">
            <img
              src={image.largeUrl || image.mediumUrl || image.smallUrl || image.thumbnailUrl}
              alt={image.altText || image.filename}
              className="h-auto w-full object-cover"
              loading="lazy"
            />

            {image.id === coverImageId && (
              <div className="absolute left-2 top-2 z-10 rounded bg-yellow-500 px-2 py-1 text-xs font-medium text-white">
                Cover
              </div>
            )}

            <div className="pointer-events-none absolute right-2 top-2 z-10 rounded bg-black/60 p-1 opacity-0 transition-opacity group-hover:opacity-100">
              <GripVertical size={16} className="text-white" />
            </div>
          </div>
        </a>

        <div
          aria-hidden={!overlayIsInteractive}
          className={`absolute inset-0 z-20 flex items-center justify-center gap-3 transition-all ${
            showActions
              ? 'bg-black/60 opacity-100 pointer-events-auto'
              : 'bg-black/0 opacity-0 pointer-events-none'
          } md:group-hover:bg-black/40 md:group-hover:opacity-100 md:group-hover:pointer-events-auto`}
        >
          <button
            type="button"
            onClick={handleSetCover}
            disabled={isActionPending}
            className={`${
              overlayIsInteractive
                ? 'pointer-events-auto'
                : 'pointer-events-none md:group-hover:pointer-events-auto'
            } inline-flex h-12 w-12 items-center justify-center rounded-full bg-white text-gray-700 transition-colors hover:bg-yellow-100 disabled:cursor-not-allowed disabled:opacity-70`}
            title="Đặt làm cover"
          >
            <Star
              size={20}
              className={image.id === coverImageId ? 'text-yellow-500 fill-yellow-500' : 'text-gray-700'}
            />
          </button>
          <button
            type="button"
            onClick={handleDeleteImage}
            disabled={isActionPending}
            className={`${
              overlayIsInteractive
                ? 'pointer-events-auto'
                : 'pointer-events-none md:group-hover:pointer-events-auto'
            } inline-flex h-12 w-12 items-center justify-center rounded-full bg-white text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-70`}
            title="Xóa ảnh"
          >
            <Trash2 size={20} />
          </button>
        </div>
      </div>

      <p className="mt-1 truncate text-xs text-gray-500">{image.filename}</p>
      <p className="text-xs text-gray-400">Order: {image.orderIndex}</p>
    </div>
  );
}
