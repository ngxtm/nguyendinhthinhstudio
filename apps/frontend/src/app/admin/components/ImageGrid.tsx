/**
 * Image Grid Component
 * Hiển thị và quản lý images (set cover, delete, bulk delete, reorder)
 */

'use client'

import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { ArrowRightLeft, Trash2 } from 'lucide-react'
import Masonry from 'react-masonry-css'
import {
  ApiError,
  bulkDeleteAlbumImages,
  deleteImage,
  moveAlbumImages,
  reorderImages,
  type Album,
  type Image
} from '@/lib/api'
import { toast } from 'sonner'
import { usePhotoSwipe } from '@/lib/photoswipe'
import AlbumImageTile from './AlbumImageTile'
import ConfirmDialog from './ConfirmDialog'
import MoveImagesDialog from './MoveImagesDialog'
import 'photoswipe/style.css'

interface Props {
  albumId: string
  images: Image[]
  coverImageId?: string
  selectionMode: boolean
  selectionDisabled?: boolean
  onSelectionModeChange: (active: boolean) => void
  onAlbumUpdated: (album: Album) => void
  onSetCover: (imageId: string) => Promise<boolean>
  onDelete: () => Promise<void>
  onReorder: () => Promise<void>
}

export default function ImageGrid({
  albumId,
  images,
  coverImageId,
  selectionMode,
  selectionDisabled = false,
  onSelectionModeChange,
  onAlbumUpdated,
  onSetCover,
  onDelete,
  onReorder
}: Props) {
  const [localImages, setLocalImages] = useState(images)
  const [dimensions, setDimensions] = useState<Record<string, { width: number; height: number }>>({})
  const [deleteCandidate, setDeleteCandidate] = useState<Image | null>(null)
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set())
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)
  const [isDeletePending, setIsDeletePending] = useState(false)
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const [isMovePending, setIsMovePending] = useState(false)
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
    const currentIds = new Set(images.map(image => image.id))
    setSelectedImageIds(current => new Set([...current].filter(id => currentIds.has(id))))
  }, [images])

  useEffect(() => {
    if (!selectionMode) {
      setSelectedImageIds(new Set())
      setBulkConfirmOpen(false)
      setMoveDialogOpen(false)
    }
  }, [selectionMode])

  useEffect(() => {
    if (selectionDisabled && selectionMode) {
      setSelectedImageIds(new Set())
      onSelectionModeChange(false)
    }
  }, [onSelectionModeChange, selectionDisabled, selectionMode])

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
    dependencies: [galleryKey, selectionMode]
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

  const allSelected = localImages.length > 0 && selectedImageIds.size === localImages.length
  const selectionIncludesCover = coverImageId ? selectedImageIds.has(coverImageId) : false
  const isSelectionPending = isDeletePending || isMovePending

  function leaveSelectionMode() {
    if (isSelectionPending) return
    setSelectedImageIds(new Set())
    setBulkConfirmOpen(false)
    onSelectionModeChange(false)
  }

  function toggleImageSelection(imageId: string) {
    if (!selectionMode || isSelectionPending) return

    setSelectedImageIds(current => {
      const next = new Set(current)
      if (next.has(imageId)) {
        next.delete(imageId)
      } else {
        next.add(imageId)
      }
      return next
    })
  }

  function toggleSelectAll() {
    if (isSelectionPending) return
    setSelectedImageIds(allSelected ? new Set() : new Set(localImages.map(image => image.id)))
  }

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

  async function handleConfirmBulkDelete(): Promise<void> {
    if (selectedImageIds.size === 0 || isDeletePending) return

    const deletedCount = selectedImageIds.size
    setIsDeletePending(true)
    try {
      const updated = await bulkDeleteAlbumImages(albumId, Array.from(selectedImageIds))
      setLocalImages(updated.images ?? [])
      setBulkConfirmOpen(false)
      setSelectedImageIds(new Set())
      onSelectionModeChange(false)
      onAlbumUpdated(updated)
      toast.success(`Đã xóa ${deletedCount} ảnh!`)
      await onDelete()
    } catch (error) {
      console.error('Failed to bulk delete images:', error)
      setBulkConfirmOpen(false)
      toast.error('Không thể xóa các ảnh đã chọn')
    } finally {
      setIsDeletePending(false)
    }
  }

  async function handleConfirmMove(targetAlbum: Album): Promise<void> {
    if (selectedImageIds.size === 0 || isSelectionPending) return

    const movedCount = selectedImageIds.size
    setIsMovePending(true)
    try {
      const updated = await moveAlbumImages(albumId, Array.from(selectedImageIds), targetAlbum.id)
      setLocalImages(updated.images ?? [])
      setSelectedImageIds(new Set())
      setMoveDialogOpen(false)
      onSelectionModeChange(false)
      onAlbumUpdated(updated)
      toast.success(`Đã chuyển ${movedCount} ảnh sang album "${targetAlbum.title}"!`)
      await onDelete()
    } catch (error) {
      console.error('Failed to move images:', error)
      const message =
        error instanceof ApiError &&
        typeof error.data === 'object' &&
        error.data !== null &&
        typeof (error.data as { message?: unknown }).message === 'string'
          ? (error.data as { message: string }).message
          : 'Không thể chuyển các ảnh đã chọn'
      toast.error(message)
    } finally {
      setIsMovePending(false)
    }
  }

  function handleDragStart(event: DragEvent, index: number) {
    if (selectionMode) return
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }

  function handleDragOver(event: DragEvent) {
    if (selectionMode) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  async function handleDrop(event: DragEvent, dropIndex: number) {
    if (selectionMode) return
    event.preventDefault()
    const dragIndex = Number(event.dataTransfer.getData('text/plain'))

    if (dragIndex === dropIndex) return

    const newImages = [...localImages]
    const [removed] = newImages.splice(dragIndex, 1)
    newImages.splice(dropIndex, 0, removed)
    setLocalImages(newImages)

    try {
      const imageIds = newImages.map(img => img.id)
      await reorderImages(albumId, imageIds)
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
      {selectionMode && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-sm font-medium text-blue-950">
            Đã chọn <span className="font-bold">{selectedImageIds.size}</span>/{localImages.length} ảnh
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={isSelectionPending}
              onClick={toggleSelectAll}
              className="min-h-11 rounded-lg border border-blue-300 bg-white px-3 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
            </button>
            <button
              type="button"
              disabled={isSelectionPending}
              onClick={leaveSelectionMode}
              className="min-h-11 rounded-lg px-3 text-sm font-medium text-gray-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={selectedImageIds.size === 0 || isSelectionPending}
              onClick={() => setMoveDialogOpen(true)}
              className="hidden min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 md:inline-flex"
            >
              <ArrowRightLeft size={17} aria-hidden="true" />
              Chuyển album
            </button>
            <button
              type="button"
              disabled={selectedImageIds.size === 0 || isSelectionPending}
              onClick={() => setBulkConfirmOpen(true)}
              className="hidden min-h-11 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 md:inline-flex"
            >
              <Trash2 size={17} aria-hidden="true" />
              Xóa {selectedImageIds.size} ảnh
            </button>
          </div>
        </div>
      )}

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
                selectionMode={selectionMode}
                selected={selectedImageIds.has(image.id)}
                onToggleSelection={toggleImageSelection}
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

      {selectionMode && (
        <>
          <div className="h-24 md:hidden" aria-hidden="true" />
          <div
            className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 pt-3 shadow-[0_-12px_30px_rgba(15,23,42,0.12)] backdrop-blur md:hidden"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}
          >
            <div className="mx-auto flex max-w-lg items-center gap-3">
              <p className="min-w-0 flex-1 text-sm font-medium text-gray-700">
                {selectedImageIds.size > 0 ? `Đã chọn ${selectedImageIds.size} ảnh` : 'Chọn ảnh để xóa'}
              </p>
              <button
                type="button"
                disabled={selectedImageIds.size === 0 || isSelectionPending}
                onClick={() => setBulkConfirmOpen(true)}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 size={18} aria-hidden="true" />
                Xóa {selectedImageIds.size} ảnh
              </button>
              <button
                type="button"
                disabled={selectedImageIds.size === 0 || isSelectionPending}
                onClick={() => setMoveDialogOpen(true)}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowRightLeft size={18} aria-hidden="true" />
                Chuyển
              </button>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={deleteCandidate !== null}
        title="Xóa ảnh?"
        description={
          <>
            Bạn có chắc chắn muốn xóa ảnh{' '}
            <strong className="font-semibold text-gray-900">“{deleteCandidate?.filename}”</strong>? Hành động này không
            thể hoàn tác.
            {deleteCandidate?.id === coverImageId && (
              <span className="mt-2 block font-medium text-amber-700">
                Đây là ảnh cover. Album sẽ mất cover và chuyển về Draft.
              </span>
            )}
          </>
        }
        isPending={isDeletePending}
        onClose={() => setDeleteCandidate(null)}
        onConfirm={handleConfirmDelete}
      />

      <ConfirmDialog
        open={bulkConfirmOpen}
        title={allSelected ? 'Xóa toàn bộ ảnh?' : `Xóa ${selectedImageIds.size} ảnh?`}
        description={
          <>
            <span>
              Bạn sắp xóa vĩnh viễn <strong className="font-semibold text-gray-900">{selectedImageIds.size} ảnh</strong>{' '}
              khỏi album.
            </span>
            {allSelected ? (
              <span className="mt-2 block font-medium text-amber-700">
                Album sẽ không còn ảnh, cover bị bỏ và trạng thái chuyển về Draft.
              </span>
            ) : (
              selectionIncludesCover && (
                <span className="mt-2 block font-medium text-amber-700">
                  Lựa chọn có ảnh cover. Album sẽ mất cover và chuyển về Draft.
                </span>
              )
            )}
            <span className="mt-2 block">Hành động này không thể hoàn tác.</span>
          </>
        }
        confirmLabel={allSelected ? `Xóa toàn bộ ${selectedImageIds.size} ảnh` : `Xóa ${selectedImageIds.size} ảnh`}
        isPending={isDeletePending}
        onClose={() => setBulkConfirmOpen(false)}
        onConfirm={handleConfirmBulkDelete}
      />

      <MoveImagesDialog
        open={moveDialogOpen}
        sourceAlbumId={albumId}
        selectedCount={selectedImageIds.size}
        isPending={isMovePending}
        onClose={() => setMoveDialogOpen(false)}
        onConfirm={handleConfirmMove}
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
