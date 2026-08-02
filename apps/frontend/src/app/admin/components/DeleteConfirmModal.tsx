'use client'

import { Fragment, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { AlertTriangle, X } from 'lucide-react'
import ConfirmDialog from './ConfirmDialog'

interface DeleteConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  onBulkRemove?: () => Promise<boolean>
  title: string
  itemName: string
  itemType: 'category' | 'tag'
  isUsed: boolean
  albumCount: number
  albums: Array<{ id: string; title: string; slug: string }>
  isLoading?: boolean
}

/**
 * DeleteConfirmModal Component
 * Modal xác nhận xóa với bulk remove feature
 */
export default function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  onBulkRemove,
  title,
  itemName,
  itemType,
  isUsed,
  albumCount,
  albums,
  isLoading = false
}: DeleteConfirmModalProps) {
  const typeText = itemType === 'category' ? 'danh mục' : 'thẻ'
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)

  const closeIfIdle = () => {
    if (!isLoading) onClose()
  }

  const handleConfirmBulkRemove = async () => {
    if (!onBulkRemove || isLoading) return

    if (await onBulkRemove()) setBulkConfirmOpen(false)
  }

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={closeIfIdle}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                      <AlertTriangle className="h-6 w-6 text-red-600" />
                    </div>
                    <div>
                      <Dialog.Title as="h3" className="text-lg font-semibold text-gray-900">
                        {title}
                      </Dialog.Title>
                      <p className="mt-1 text-sm text-gray-500">
                        {isUsed ? `Không thể xóa ${typeText} này` : `Xác nhận xóa ${typeText}`}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={closeIfIdle}
                    className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Content */}
                <div className="mt-6">
                  {isUsed ? (
                    <>
                      {/* Warning Message */}
                      <div className="rounded-lg bg-amber-50 p-4">
                        <p className="text-sm text-amber-800">
                          <strong>&quot;{itemName}&quot;</strong> đang được sử dụng trong <strong>{albumCount}</strong>{' '}
                          bộ ảnh. Bạn cần xóa {typeText} khỏi các bộ ảnh trước khi có thể xóa nó.
                        </p>
                      </div>

                      {/* Albums List */}
                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-gray-900">Các bộ ảnh đang sử dụng {typeText} này:</h4>
                        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3">
                          {albums.map(album => (
                            <div
                              key={album.id}
                              className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-sm shadow-sm"
                            >
                              <span className="font-medium text-gray-900">{album.title}</span>
                              <a
                                href={`/admin/albums/${album.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                              >
                                Xem bộ ảnh →
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Bulk Remove Section */}
                      {onBulkRemove && (
                        <div className="mt-4 rounded-lg border-2 border-red-200 bg-red-50 p-4">
                          <h4 className="text-sm font-semibold text-red-900">Xóa hàng loạt</h4>
                          <p className="mt-1 text-xs text-red-700">
                            Xóa <strong>&quot;{itemName}&quot;</strong> khỏi tất cả {albumCount} bộ ảnh cùng lúc. Hành
                            động này không thể hoàn tác.
                          </p>
                          <button
                            type="button"
                            onClick={() => setBulkConfirmOpen(true)}
                            disabled={isLoading}
                            className="mt-3 w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isLoading ? 'Đang xóa...' : `Xóa "${itemName}" khỏi tất cả ${albumCount} bộ ảnh`}
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {/* Simple Delete Confirmation */}
                      <p className="text-sm text-gray-600">
                        Bạn có chắc chắn muốn xóa {typeText} <strong>"{itemName}"</strong>? Hành động này không thể hoàn
                        tác.
                      </p>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={closeIfIdle}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Hủy
                  </button>
                  {!isUsed && (
                    <button
                      type="button"
                      onClick={onConfirm}
                      disabled={isLoading}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isLoading ? 'Đang xóa...' : 'Xác nhận xóa'}
                    </button>
                  )}
                </div>
                {onBulkRemove && (
                  <ConfirmDialog
                    open={bulkConfirmOpen}
                    title={`Xóa ${typeText} khỏi bộ ảnh?`}
                    description={
                      <>
                        Xóa <strong>&quot;{itemName}&quot;</strong> khỏi <strong>{albumCount}</strong> bộ ảnh? Hành động
                        này không thể hoàn tác.
                      </>
                    }
                    confirmLabel="Xóa hàng loạt"
                    isPending={isLoading}
                    onClose={() => setBulkConfirmOpen(false)}
                    onConfirm={handleConfirmBulkRemove}
                  />
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
