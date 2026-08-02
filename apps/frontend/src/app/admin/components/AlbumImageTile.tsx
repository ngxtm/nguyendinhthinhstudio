'use client'

import { Check, GripVertical } from 'lucide-react'
import type { DragEvent } from 'react'
import type { Image } from '@/lib/api'
import ImageActionMenu from './ImageActionMenu'

interface AlbumImageTileProps {
  image: Image
  index: number
  dimensions: { width: number; height: number }
  coverImageId?: string
  selectionMode: boolean
  selected: boolean
  onToggleSelection: (imageId: string) => void
  onSetCover: (id: string) => Promise<boolean>
  onDeleteRequest: (image: Image) => void
  onDragStart: (event: DragEvent<HTMLDivElement>, index: number) => void
  onDragOver: (event: DragEvent<HTMLDivElement>) => void
  onDrop: (event: DragEvent<HTMLDivElement>, index: number) => void
}

export default function AlbumImageTile({
  image,
  index,
  dimensions,
  coverImageId,
  selectionMode,
  selected,
  onToggleSelection,
  onSetCover,
  onDeleteRequest,
  onDragStart,
  onDragOver,
  onDrop
}: AlbumImageTileProps) {
  const lightboxUrl = image.xlargeUrl || image.largeUrl || image.mediumUrl || image.smallUrl || image.thumbnailUrl

  const imageFrame = (
    <div
      className={`relative overflow-hidden rounded-md bg-gray-100 shadow-md transition-all md:rounded-lg ${
        selected ? 'ring-4 ring-blue-500 ring-offset-2' : 'hover:shadow-lg'
      }`}
    >
      <img
        src={image.largeUrl || image.mediumUrl || image.smallUrl || image.thumbnailUrl}
        alt={image.altText || image.filename}
        className="h-auto w-full object-cover"
        loading="lazy"
      />

      {image.id === coverImageId && (
        <div className="absolute top-2 left-2 z-10 rounded bg-yellow-500 px-2 py-1 text-xs font-medium text-white">
          Ảnh bìa
        </div>
      )}

      {selectionMode ? (
        <>
          <div
            className={`pointer-events-none absolute inset-0 transition-colors ${
              selected ? 'bg-blue-600/15' : 'bg-black/5'
            }`}
            aria-hidden="true"
          />
          <span
            className={`pointer-events-none absolute top-2 right-2 z-20 flex h-8 w-8 items-center justify-center rounded-full border-2 shadow-sm transition-colors ${
              selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-white bg-white/90 text-transparent'
            }`}
            aria-hidden="true"
          >
            <Check size={18} strokeWidth={3} />
          </span>
        </>
      ) : (
        <div className="pointer-events-none absolute top-2 right-2 z-10 rounded bg-black/60 p-1 opacity-0 transition-opacity group-hover:opacity-100">
          <GripVertical size={16} className="text-white" aria-hidden="true" />
        </div>
      )}
    </div>
  )

  return (
    <div
      className="group relative mb-4 touch-pan-y md:mb-6"
      onDragOver={event => {
        if (!selectionMode) onDragOver(event)
      }}
      onDrop={event => {
        if (!selectionMode) onDrop(event, index)
      }}
    >
      <div className="relative" style={{ animation: `fadeInUp 0.6s ease-out ${index * 0.04}s both` }}>
        <div
          className={selectionMode ? 'relative' : 'relative cursor-move'}
          draggable={!selectionMode}
          onDragStart={event => {
            if (!selectionMode) onDragStart(event, index)
          }}
        >
          {selectionMode ? (
            <button
              type="button"
              role="checkbox"
              aria-checked={selected}
              aria-label={`${selected ? 'Bỏ chọn' : 'Chọn'} ảnh ${image.filename}`}
              onClick={() => onToggleSelection(image.id)}
              className="block w-full rounded-lg text-left focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-4 focus-visible:outline-none"
            >
              {imageFrame}
            </button>
          ) : (
            <a
              href={lightboxUrl}
              data-pswp-src={lightboxUrl}
              data-pswp-width={dimensions.width}
              data-pswp-height={dimensions.height}
              className="block"
            >
              {imageFrame}
            </a>
          )}
        </div>
      </div>

      <div className="mt-1 flex min-h-11 items-start justify-between gap-2">
        <div className="min-w-0 pt-1">
          <p className="truncate text-xs text-gray-500">{image.filename}</p>
          <p className="text-xs text-gray-400">Thứ tự: {image.orderIndex}</p>
        </div>

        {!selectionMode && (
          <ImageActionMenu
            filename={image.filename}
            isCover={image.id === coverImageId}
            onSetCover={() => onSetCover(image.id)}
            onDeleteRequest={() => onDeleteRequest(image)}
          />
        )}
      </div>
    </div>
  )
}
