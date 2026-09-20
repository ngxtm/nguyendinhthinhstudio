'use client'

import { Dialog, Transition } from '@headlessui/react'
import { MoreVertical } from 'lucide-react'
import { Fragment, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'

export type ActionMenuPresentation = 'mobile-sheet' | 'desktop-popover'

interface ResponsiveActionMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  triggerLabel: string
  title: string
  children: (presentation: ActionMenuPresentation) => ReactNode
}

export default function ResponsiveActionMenu({
  open,
  onOpenChange,
  triggerLabel,
  title,
  children
}: ResponsiveActionMenuProps) {
  const [isDesktop, setIsDesktop] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 768px)')
    const updatePresentation = () => setIsDesktop(mediaQuery.matches)

    updatePresentation()
    mediaQuery.addEventListener('change', updatePresentation)
    return () => mediaQuery.removeEventListener('change', updatePresentation)
  }, [])

  const closeMenu = useCallback(() => {
    onOpenChange(false)
    queueMicrotask(() => triggerRef.current?.focus())
  }, [onOpenChange])

  useEffect(() => {
    if (!open || !isDesktop) return

    const closeOnPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        closeMenu()
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }

    document.addEventListener('pointerdown', closeOnPointerDown)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [closeMenu, isDesktop, open])

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup={isDesktop ? 'menu' : 'dialog'}
        aria-expanded={open}
        aria-label={triggerLabel}
        onClick={event => {
          event.preventDefault()
          event.stopPropagation()
          onOpenChange(!open)
        }}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        <MoreVertical size={20} aria-hidden="true" />
      </button>

      {open && isDesktop && (
        <div
          role="menu"
          aria-label={title}
          className="absolute right-0 bottom-full z-30 mb-1 w-52 max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {children('desktop-popover')}
        </div>
      )}

      <Transition appear show={open && !isDesktop} as={Fragment}>
        <Dialog as="div" className="relative z-50 md:hidden" onClose={closeMenu}>
          <Transition.Child
            as={Fragment}
            enter="motion-safe:transition-opacity motion-safe:duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="motion-safe:transition-opacity motion-safe:duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/45" aria-hidden="true" />
          </Transition.Child>

          <div className="fixed inset-0 flex items-end">
            <Transition.Child
              as={Fragment}
              enter="motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out"
              enterFrom="translate-y-full"
              enterTo="translate-y-0"
              leave="motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-in"
              leaveFrom="translate-y-0"
              leaveTo="translate-y-full"
            >
              <Dialog.Panel className="w-full rounded-t-2xl bg-white px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl motion-reduce:transition-none text-gray-900 [color-scheme:light]">
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300" aria-hidden="true" />
                <Dialog.Title className="px-2 pb-2 text-base font-semibold text-gray-900">{title}</Dialog.Title>
                <div className="overflow-hidden rounded-xl border border-gray-200">{children('mobile-sheet')}</div>
                <button
                  type="button"
                  onClick={closeMenu}
                  className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-gray-100 px-4 text-sm font-medium text-gray-700 hover:bg-gray-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  Hủy
                </button>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition>
    </div>
  )
}
