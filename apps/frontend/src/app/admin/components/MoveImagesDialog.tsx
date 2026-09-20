'use client'

import { Fragment, useEffect, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { ArrowRight, LoaderCircle, Search, X } from 'lucide-react'
import { listAlbums, type Album } from '@/lib/api'
import { useAbortableEffect, useDebouncedValue } from '../hooks'

interface Props {
  open: boolean
  sourceAlbumId: string
  selectedCount: number
  isPending?: boolean
  onClose: () => void
  onConfirm: (targetAlbum: Album) => void
}

export default function MoveImagesDialog({
  open,
  sourceAlbumId,
  selectedCount,
  isPending = false,
  onClose,
  onConfirm
}: Props) {
  const [searchTerm, setSearchTerm] = useState('')
  const [albums, setAlbums] = useState<Album[]>([])
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const debouncedSearch = useDebouncedValue(searchTerm, 300)
  const trimmedSearch = debouncedSearch.trim()

  useEffect(() => {
    if (!open) {
      setSearchTerm('')
      setAlbums([])
      setSelectedAlbum(null)
      setLoadError(null)
    }
  }, [open])

  useAbortableEffect(
    signal => {
      if (!open) return

      async function loadDestinationAlbums() {
        try {
          setLoading(true)
          setLoadError(null)
          const response = await listAlbums(
            {
              limit: 50,
              page: 1,
              search: trimmedSearch || undefined
            },
            { signal, admin: true }
          )

          if (!signal.aborted) {
            setAlbums(response.data.filter(album => album.id !== sourceAlbumId))
          }
        } catch (error) {
          if (!signal.aborted && (error as Error)?.name !== 'AbortError') {
            console.error('Failed to load destination albums:', error)
            setLoadError('Không thể tải danh sách bộ ảnh đích')
          }
        } finally {
          if (!signal.aborted) setLoading(false)
        }
      }

      void loadDestinationAlbums()
    },
    [open, sourceAlbumId, trimmedSearch]
  )

  const closeIfIdle = () => {
    if (!isPending) onClose()
  }

  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={closeIfIdle}>
        <Transition.Child
          as={Fragment}
          enter="motion-safe:transition-opacity motion-safe:duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="motion-safe:transition-opacity motion-safe:duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 sm:items-center">
            <Transition.Child
              as={Fragment}
              enter="motion-safe:transition motion-safe:duration-200 motion-safe:ease-out"
              enterFrom="translate-y-4 opacity-0 sm:translate-y-0 sm:scale-95"
              enterTo="translate-y-0 opacity-100 sm:scale-100"
              leave="motion-safe:transition motion-safe:duration-150 motion-safe:ease-in"
              leaveFrom="translate-y-0 opacity-100 sm:scale-100"
              leaveTo="translate-y-4 opacity-0 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="w-full max-w-lg rounded-2xl bg-white p-5 text-left shadow-xl motion-reduce:transition-none sm:p-6 text-gray-900 [color-scheme:light]">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Dialog.Title className="text-lg font-semibold text-gray-900">Chuyển ảnh sang bộ ảnh</Dialog.Title>
                    <Dialog.Description className="mt-1 text-sm leading-6 text-gray-600">
                      Chọn bộ ảnh đích cho {selectedCount} ảnh đã chọn.
                    </Dialog.Description>
                  </div>
                  <button
                    type="button"
                    aria-label="Đóng"
                    disabled={isPending}
                    onClick={closeIfIdle}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <X size={20} aria-hidden="true" />
                  </button>
                </div>

                <div className="relative mt-5">
                  <label
                    htmlFor="move-images-destination-search"
                    className="mb-2 block text-sm font-medium text-gray-700"
                  >
                    Tìm bộ ảnh đích
                  </label>
                  <Search
                    size={18}
                    aria-hidden="true"
                    className="pointer-events-none absolute top-10 left-3 text-gray-400"
                  />
                  <input
                    id="move-images-destination-search"
                    type="search"
                    value={searchTerm}
                    onChange={event => setSearchTerm(event.target.value)}
                    placeholder="Tìm theo tên hoặc slug..."
                    disabled={isPending}
                    className="w-full rounded-lg border border-gray-300 py-2.5 pr-4 pl-10 text-sm transition outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-100"
                  />
                </div>

                <div className="mt-4 max-h-72 space-y-2 overflow-y-auto" aria-live="polite">
                  {loading ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
                      <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
                      Đang tải bộ ảnh...
                    </div>
                  ) : loadError ? (
                    <p className="py-8 text-center text-sm text-red-600">{loadError}</p>
                  ) : albums.length === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-500">Không tìm thấy bộ ảnh đích.</p>
                  ) : (
                    albums.map(album => {
                      const selected = selectedAlbum?.id === album.id
                      return (
                        <button
                          key={album.id}
                          type="button"
                          disabled={isPending}
                          aria-pressed={selected}
                          onClick={() => setSelectedAlbum(album)}
                          className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                            selected
                              ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20'
                              : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-gray-900">{album.title}</span>
                            <span className="mt-0.5 block truncate text-xs text-gray-500">
                              /{album.slug} · {album.imageCount} ảnh
                            </span>
                          </span>
                          {selected && <ArrowRight size={18} className="shrink-0 text-blue-600" aria-hidden="true" />}
                        </button>
                      )
                    })
                  )}
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3 sm:flex sm:justify-end">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={closeIfIdle}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    disabled={!selectedAlbum || isPending}
                    onClick={() => selectedAlbum && onConfirm(selectedAlbum)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isPending ? (
                      <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <ArrowRight size={17} aria-hidden="true" />
                    )}
                    {isPending ? 'Đang chuyển...' : `Chuyển ${selectedCount} ảnh`}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
