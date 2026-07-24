/**
 * Image Grid Component
 * Hiển thị và quản lý images (set cover, delete, reorder)
 */

'use client'

import { useEffect, useMemo, useState, type DragEvent } from 'react'
import Masonry from 'react-masonry-css'
import { deleteImage, reorderImages, type Image } from '@/lib/api'
import { toast } from 'sonner'
import { usePhotoSwipe } from '@/lib/photoswipe'
import AlbumImageTile from './AlbumImageTile'
import ConfirmDialog from './ConfirmDialog'
import 'photoswipe/style.css'

interface Props {
  images: Image[]
  coverImageId?: string
  onSetCover: (imageId: string) => Promise<boolean>
  onDelete: () => Promise<void>
  onReorder: () => Promise<void>
}

export default function ImageGrid({ images, coverImageId, onSetCover, onDelete, onReorder }: Props) {
  const [localImages, setLocalImages] = useState(images)
  const [dimensions, setDimensions] = useState<Record<string, { width: number; height: number }>>({})
  const [deleteCandidate, setDeleteCandidate] = useState<Image | null>(null)
  const [isDeletePending, setIsDeletePending] = useState(false)
  const masonryBreakpoints = useMemo(
    () => ({
      default: 4,
      1536: 4,
      1280: 3,
      1024: 3,
      768: 2,
      640: 2,
      480: 1
    }),
    []
  )

  useEffect(() => {
    setLocalImages(images)
  }, [images])

  const galleryId = 'admin-album-gallery'
  const galleryKey = useMemo(
    () =>
      localImages
        .map(img => {
          const dims = dimensions[img.id]
          const width = dims?.width ?? img.width ?? 'auto'
          const height = dims?.height ?? img.height ?? 'auto'
          return `${img.id}:${width}x${height}`
        })
        .join('|'),
    [localImages, dimensions]
  )

  usePhotoSwipe({
    options: {
      gallery: `#${galleryId}`,
      children: 'a[data-pswp-src]',
      pswpModule: () => import('photoswipe')
    },
    dependencies: [galleryKey]
  })

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    setDimensions(prev => {
      const next = { ...prev }
      localImages.forEach(img => {
        if (img.width && img.height && !next[img.id]) {
          next[img.id] = { width: img.width, height: img.height }
        }
      })
      return next
    })

    const missing = localImages.filter(img => !img.width || !img.height)
    if (missing.length === 0) {
      return
    }

    let cancelled = false

    missing.forEach(image => {
      const loader = new window.Image()
      loader.onload = () => {
        if (cancelled) return
        setDimensions(prev => ({
          ...prev,
          [image.id]: {
            width: loader.naturalWidth || image.width || 2048,
            height: loader.naturalHeight || image.height || 1365
          }
        }))
      }
      loader.onerror = () => {
        if (cancelled) return
        setDimensions(prev => ({
          ...prev,
          [image.id]: {
            width: image.width || 2048,
            height: image.height || 1365
          }
        }))
      }
      loader.src = image.xlargeUrl || image.largeUrl || image.mediumUrl || image.smallUrl || image.thumbnailUrl
    })

    return () => {
      cancelled = true
    }
  }, [localImages])

  async function handleConfirmDelete(): Promise<void> {
    if (!deleteCandidate || isDeletePending) return

    const image = deleteCandidate
    setIsDeletePending(true)
    try {
      await deleteImage(image.id)
      setLocalImages(current => current.filter(item => item.id !== image.id))
      setDeleteCandidate(null)
      toast.success('Đã xóa ảnh!')
      await onDelete()
    } catch (error) {
      console.error('Failed to delete image:', error)
      toast.error('Không thể xóa ảnh')
    } finally {
      setIsDeletePending(false)
    }
  }

  function handleDragStart(event: DragEvent, index: number) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  async function handleDrop(event: DragEvent, dropIndex: number) {
    event.preventDefault()
    const dragIndex = Number(event.dataTransfer.getData('text/plain'))

    if (dragIndex === dropIndex) return

    const newImages = [...localImages]
    const [removed] = newImages.splice(dragIndex, 1)
    newImages.splice(dropIndex, 0, removed)
    setLocalImages(newImages)

    try {
      const imageIds = newImages.map(img => img.id)
      await reorderImages(images[0]?.albumId || '', imageIds)
      toast.success('Đã sắp xếp lại ảnh!')
      await onReorder()
    } catch (error) {
      console.error('Failed to reorder images:', error)
      toast.error('Không thể sắp xếp lại ảnh')
      setLocalImages(images)
    }
  }

  return (
    <>
      <div id={galleryId}>
        <Masonry
          breakpointCols={masonryBreakpoints}
          className="-ml-4 flex w-auto md:-ml-6"
          columnClassName="bg-clip-padding pl-4 md:pl-6"
        >
          {localImages.map((image, index) => {
            const dims = dimensions[image.id] ?? {
              width: image.width || 2048,
              height: image.height || 1365
            }

            return (
              <AlbumImageTile
                key={image.id}
                image={image}
                index={index}
                dimensions={dims}
                coverImageId={coverImageId}
                onSetCover={onSetCover}
                onDeleteRequest={setDeleteCandidate}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />
            )
          })}
        </Masonry>
      </div>

      <ConfirmDialog
        open={deleteCandidate !== null}
        title="Xóa ảnh?"
        description={
          <>
            Bạn có chắc chắn muốn xóa ảnh{' '}
            <strong className="font-semibold text-gray-900">“{deleteCandidate?.filename}”</strong>? Hành động này không
            thể hoàn tác.
          </>
        }
        isPending={isDeletePending}
        onClose={() => setDeleteCandidate(null)}
        onConfirm={handleConfirmDelete}
      />

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
  )
}
