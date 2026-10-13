'use client'

import { useState } from 'react'
import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Popover,
  PopoverButton,
  PopoverGroup,
  PopoverPanel
} from '@headlessui/react'
import { Check, ChevronDown, Image as ImageIcon, Loader2, Search } from 'lucide-react'
import {
  searchHomepageCollectionAlbums,
  type HomepageCollectionAlbum,
  type HomepageCollectionSearchResult
} from '@/lib/api/homepage-collection'
import { useAbortableEffect, useDebouncedValue } from '../hooks'
import { getAdminErrorMessage } from '../error-message'
import type { CollectionSlots } from './collection-slots'

export { PopoverGroup as AlbumPickerGroup }

type AlbumPickerProps = {
  selected: HomepageCollectionAlbum | null
  slots: CollectionSlots
  index: number
  disabled: boolean
  onChange: (album: HomepageCollectionAlbum | null) => void
}

export function AlbumCover({
  album,
  thumbnail = false
}: {
  album: HomepageCollectionAlbum | null
  thumbnail?: boolean
}) {
  const image = album?.coverImage
  const src =
    image &&
    (thumbnail
      ? image.thumbnailUrl || image.smallUrl || image.mediumUrl || image.largeUrl || image.xlargeUrl
      : image.smallUrl || image.mediumUrl || image.largeUrl || image.xlargeUrl || image.thumbnailUrl)
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={thumbnail ? '' : image?.altText || album?.title || 'Ảnh bìa bộ ảnh'}
      loading="lazy"
      decoding="async"
      className={
        thumbnail
          ? 'h-12 w-10 shrink-0 rounded object-cover'
          : 'h-48 w-full rounded-lg bg-gray-100 object-contain sm:h-56'
      }
    />
  ) : (
    <div
      className={`flex items-center justify-center rounded-lg bg-gray-100 text-gray-400 ${thumbnail ? 'h-12 w-10 shrink-0' : 'h-48 w-full flex-col gap-2 sm:h-56'}`}
    >
      <ImageIcon size={thumbnail ? 18 : 28} aria-hidden="true" />
      {!thumbnail ? <span className="text-sm">Chưa chọn bộ ảnh</span> : null}
    </div>
  )
}

function AlbumSearchPanel({
  selected,
  slots,
  index,
  onChange,
  onDismiss
}: Omit<AlbumPickerProps, 'disabled'> & { onDismiss: () => void }) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<HomepageCollectionSearchResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const search = useDebouncedValue(query.trim(), 300)
  const waitingForSearch = query.trim() !== search
  const busy = loading || waitingForSearch

  useAbortableEffect(
    signal => {
      setLoading(true)
      setError('')
      setResult(null)
      searchHomepageCollectionAlbums(search, page, signal)
        .then(data => {
          if (!signal.aborted) setResult(data)
        })
        .catch(cause => {
          if (!signal.aborted) setError(getAdminErrorMessage(cause, 'Không thể tìm bộ ảnh. Hãy thử lại.'))
        })
        .finally(() => {
          if (!signal.aborted) setLoading(false)
        })
    },
    [search, page, retry]
  )

  return (
    <div>
      <Combobox value={selected} by="id" onChange={onChange} immediate>
        <div className="relative">
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
          />
          <ComboboxInput
            autoFocus
            aria-label="Tìm bộ ảnh theo tên"
            placeholder="Nhập tên bộ ảnh…"
            value={query}
            onChange={event => {
              setQuery(event.target.value)
              setPage(1)
            }}
            onKeyDownCapture={event => {
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                onDismiss()
              }
            }}
            className="min-h-11 w-full rounded-lg border border-gray-300 bg-white py-2 pr-3 pl-9 text-base text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
          />
        </div>
        <p className="mt-2 text-xs text-gray-500">Tìm được cả tên có dấu và không dấu.</p>
        <div aria-live="polite" className="py-2 text-sm text-gray-600">
          {busy ? (
            <span className="flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Đang tìm bộ ảnh…
            </span>
          ) : null}
          {!busy && error ? <p role="alert">{error}</p> : null}
          {!busy && !error && result?.albums.length === 0 ? 'Không tìm thấy bộ ảnh. Thử tên khác.' : null}
        </div>
        <ComboboxOptions
          static
          modal={false}
          className="max-h-64 overflow-y-auto focus:outline-none"
          aria-label="Kết quả tìm bộ ảnh"
        >
          {!busy && !error
            ? result?.albums.map(album => {
                const usedIndex = slots.findIndex((slot, slotIndex) => slotIndex !== index && slot?.id === album.id)
                return (
                  <ComboboxOption
                    key={album.id}
                    value={album}
                    disabled={usedIndex >= 0}
                    className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg p-2 text-sm text-gray-900 data-disabled:cursor-not-allowed data-disabled:opacity-50 data-focus:bg-blue-50"
                  >
                    {({ selected: isSelected }) => (
                      <>
                        <AlbumCover album={album} thumbnail />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium break-words">{album.title}</p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {usedIndex >= 0
                              ? `Đã chọn ở vị trí ${usedIndex + 1}`
                              : album.categories.map(category => category.name).join(', ') || 'Đã xuất bản'}
                          </p>
                        </div>
                        {isSelected ? <Check size={17} aria-hidden="true" className="shrink-0 text-blue-600" /> : null}
                      </>
                    )}
                  </ComboboxOption>
                )
              })
            : null}
        </ComboboxOptions>
      </Combobox>
      {!busy && error ? (
        <button
          type="button"
          onClick={() => setRetry(value => value + 1)}
          className="min-h-11 rounded-lg px-3 text-sm text-blue-600 hover:bg-blue-50"
        >
          Thử lại
        </button>
      ) : null}
      {!error && (page > 1 || result?.pagination.hasMore) ? (
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-gray-100 pt-2 text-sm">
          <button
            type="button"
            disabled={busy || page === 1}
            onClick={() => setPage(value => value - 1)}
            className="min-h-11 rounded px-2 hover:bg-gray-100 disabled:opacity-40"
          >
            Trước
          </button>
          <span className="text-gray-500">Trang {page}</span>
          <button
            type="button"
            disabled={busy || !result?.pagination.hasMore}
            onClick={() => setPage(value => value + 1)}
            className="min-h-11 rounded px-2 hover:bg-gray-100 disabled:opacity-40"
          >
            Tiếp
          </button>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => onChange(null)}
        className="mt-2 min-h-11 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-600 hover:bg-gray-50"
      >
        Bỏ chọn vị trí này
      </button>
    </div>
  )
}

export default function AlbumPicker(props: AlbumPickerProps) {
  return (
    <Popover className="relative">
      {({ close }) => (
        <>
          <PopoverButton
            disabled={props.disabled}
            aria-label={`Chọn bộ ảnh cho vị trí ${props.index + 1}: ${props.selected?.title || 'Chưa chọn'}`}
            className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-900 hover:border-blue-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50"
          >
            <span className="min-w-0 break-words">{props.selected?.title || 'Tìm và chọn bộ ảnh…'}</span>
            <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-gray-500" />
          </PopoverButton>
          <PopoverPanel
            anchor={{ to: 'bottom start', gap: 8, padding: 16 }}
            focus
            className="z-50 w-[var(--button-width)] max-w-[calc(100vw-2rem)] min-w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-lg"
          >
            <AlbumSearchPanel
              {...props}
              onDismiss={() => close()}
              onChange={album => {
                props.onChange(album)
                close()
              }}
            />
          </PopoverPanel>
        </>
      )}
    </Popover>
  )
}
