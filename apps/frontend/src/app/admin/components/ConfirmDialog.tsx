'use client'

import { Dialog, Transition } from '@headlessui/react'
import { AlertTriangle, X } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel?: string
  isPending?: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Xác nhận xóa',
  isPending = false,
  onClose,
  onConfirm
}: ConfirmDialogProps) {
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
              <Dialog.Panel className="w-full max-w-md rounded-2xl bg-white p-5 text-left shadow-xl motion-reduce:transition-none sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-100">
                      <AlertTriangle className="h-5 w-5 text-red-600" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <Dialog.Title className="text-lg font-semibold text-gray-900">{title}</Dialog.Title>
                      <Dialog.Description as="div" className="mt-2 text-sm leading-6 text-gray-600">
                        {description}
                      </Dialog.Description>
                    </div>
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
                    disabled={isPending}
                    onClick={() => void onConfirm()}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isPending ? 'Đang xóa...' : confirmLabel}
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
