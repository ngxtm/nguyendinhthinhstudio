'use client';

import { GripVertical } from 'lucide-react';
import type { DragEvent } from 'react';
import type { Image } from '@/lib/api';
import ImageActionMenu from './ImageActionMenu';

interface AlbumImageTileProps {
  image: Image;
  index: number;
  dimensions: { width: number; height: number };
  coverImageId?: string;
  onSetCover: (id: string) => Promise<boolean>;
  onDeleteRequest: (image: Image) => void;
  onDragStart: (event: DragEvent<HTMLDivElement>, index: number) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>, index: number) => void;
}

export default function AlbumImageTile({
  image,
  index,
  dimensions,
  coverImageId,
  onSetCover,
  onDeleteRequest,
  onDragStart,
  onDragOver,
  onDrop,
}: AlbumImageTileProps) {
  const lightboxUrl =
    image.xlargeUrl ||
    image.largeUrl ||
    image.mediumUrl ||
    image.smallUrl ||
    image.thumbnailUrl;

  return (
    <div
      className="group relative mb-4 touch-pan-y md:mb-6"
      onDragOver={onDragOver}
      onDrop={(event) => onDrop(event, index)}
    >
      <div className="relative" style={{ animation: `fadeInUp 0.6s ease-out ${index * 0.04}s both` }}>
        <div
          className="relative cursor-move"
          draggable
          onDragStart={(event) => onDragStart(event, index)}
        >
          <a
            href={lightboxUrl}
            data-pswp-src={lightboxUrl}
            data-pswp-width={dimensions.width}
            data-pswp-height={dimensions.height}
            className="block"
          >
            <div className="relative overflow-hidden rounded-md bg-gray-100 shadow-md transition-shadow hover:shadow-lg md:rounded-lg">
              <img
                src={image.largeUrl || image.mediumUrl || image.smallUrl || image.thumbnailUrl}
                alt={image.altText || image.filename}
                className="h-auto w-full object-cover"
                loading="lazy"
              />

              {image.id === coverImageId && (
                <div className="absolute top-2 left-2 z-10 rounded bg-yellow-500 px-2 py-1 text-xs font-medium text-white">
                  Cover
                </div>
              )}

              <div className="pointer-events-none absolute top-2 right-2 z-10 rounded bg-black/60 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                <GripVertical size={16} className="text-white" aria-hidden="true" />
              </div>
            </div>
          </a>
        </div>
      </div>

      <div className="mt-1 flex min-h-11 items-start justify-between gap-2">
        <div className="min-w-0 pt-1">
          <p className="truncate text-xs text-gray-500">{image.filename}</p>
          <p className="text-xs text-gray-400">Order: {image.orderIndex}</p>
        </div>

        <ImageActionMenu
          filename={image.filename}
          isCover={image.id === coverImageId}
          onSetCover={() => onSetCover(image.id)}
          onDeleteRequest={() => onDeleteRequest(image)}
        />
      </div>
    </div>
  );
}
