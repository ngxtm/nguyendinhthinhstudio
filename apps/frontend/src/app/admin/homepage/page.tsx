'use client'

import { useState } from 'react'
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  getHomepageCollectionConfiguration,
  saveHomepageCollection,
  type HomepageCollectionAlbum,
  type HomepageCollectionConfiguration
} from '@/lib/api/homepage-collection'
import { useAbortableEffect } from '../hooks'
import { getAdminErrorMessage } from '../error-message'
import AlbumPicker, { AlbumCover, AlbumPickerGroup } from './AlbumPicker'
import { getCollectionSlots, isCompleteCollection, moveCollectionSlot, type CollectionSlots } from './collection-slots'

export default function HomepageSettingsPage() {
  const [configuration, setConfiguration] = useState<HomepageCollectionConfiguration | null>(null)
  const [slots, setSlots] = useState<CollectionSlots>([null, null, null])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useAbortableEffect(
    signal => {
      setLoading(true)
      setError('')
      getHomepageCollectionConfiguration(signal)
        .then(data => {
          if (!signal.aborted) {
            setConfiguration(data)
            setSlots(getCollectionSlots(data))
          }
        })
        .catch(cause => {
          if (!signal.aborted) setError(getAdminErrorMessage(cause, 'Không thể tải bộ ảnh trang chủ. Hãy thử lại.'))
        })
        .finally(() => {
          if (!signal.aborted) setLoading(false)
        })
    },
    [retry]
  )

  const complete = isCompleteCollection(slots)
  const hasSlotChanges = Boolean(
    configuration && slots.some((album, index) => (album?.id ?? null) !== (configuration.albumIds[index] ?? null))
  )
  const dirty = Boolean(configuration && (!configuration.configured || hasSlotChanges))
  const missingSavedAlbum = Boolean(
    configuration?.configured && configuration.albumIds.some(id => !configuration.albums.some(album => album.id === id))
  )

  function chooseAlbum(index: number, album: HomepageCollectionAlbum | null) {
    if (saving || (album && slots.some((slot, slotIndex) => slotIndex !== index && slot?.id === album.id))) return
    setSlots(previous => {
      const next: CollectionSlots = [...previous]
      next[index] = album
      return next
    })
  }

  async function save() {
    if (!complete || !dirty || saving) return
    setSaving(true)
    try {
      const data = await saveHomepageCollection(slots.flatMap(album => (album ? [album.id] : [])))
      setConfiguration(data)
      setSlots(getCollectionSlots(data))
      toast.success('Đã lưu bộ ảnh trang chủ')
    } catch (cause) {
      toast.error(getAdminErrorMessage(cause, 'Không thể lưu bộ ảnh trang chủ. Hãy thử lại.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Trang chủ</h1>
        <p className="mt-1 text-gray-600">Chọn 3 bộ ảnh hiển thị trong Latest Collection.</p>
      </header>
      {loading ? (
        <div role="status" className="flex items-center gap-2 py-10 text-gray-500">
          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
          Đang tải bộ ảnh trang chủ…
        </div>
      ) : null}
      {!loading && error ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p role="alert" className="text-red-600">
            {error}
          </p>
          <button
            type="button"
            onClick={() => setRetry(value => value + 1)}
            className="mt-3 min-h-11 rounded-lg border border-gray-300 px-4 text-sm text-gray-700 hover:bg-gray-50"
          >
            Thử lại
          </button>
        </div>
      ) : null}
      {!loading && !error && configuration ? (
        <section
          aria-label="Cấu hình Latest Collection"
          className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6"
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Latest Collection</h2>
            <span aria-live="polite" className="rounded-md bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
              Đã chọn {slots.filter(Boolean).length}/3
            </span>
          </div>
          <p className="text-sm text-gray-500">
            Chỉ chọn bộ ảnh đã xuất bản và có ảnh bìa. Thứ tự 1 → 2 → 3 là thứ tự hiển thị trên trang chủ.
          </p>
          {!configuration.configured ? (
            <p className="mt-3 text-sm text-gray-600">
              Hiện đang tự lấy 3 bộ ảnh mới nhất. Lưu để cố định các bộ ảnh bạn chọn.
            </p>
          ) : null}
          {missingSavedAlbum ? (
            <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              Một bộ ảnh đã bị ẩn, xóa hoặc mất ảnh bìa. Hãy chọn bộ ảnh khác cho vị trí trống.
            </p>
          ) : null}
          <AlbumPickerGroup className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">
            {slots.map((album, index) => (
              <div key={index} className="min-w-0 space-y-3" aria-label={`Vị trí ${index + 1}`}>
                <h3 className="text-sm font-medium text-gray-700">
                  Vị trí {index + 1}
                  {index === 0 ? ' · Thẻ đầu tiên' : ''}
                </h3>
                <AlbumCover album={album} />
                <AlbumPicker
                  selected={album}
                  slots={slots}
                  index={index}
                  disabled={saving}
                  onChange={next => chooseAlbum(index, next)}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-label={`Đưa bộ ảnh ở vị trí ${index + 1} lên trước`}
                    disabled={saving || index === 0}
                    onClick={() => setSlots(previous => moveCollectionSlot(previous, index, index - 1))}
                    className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ArrowLeft size={15} aria-hidden="true" />
                    Trước
                  </button>
                  <button
                    type="button"
                    aria-label={`Đưa bộ ảnh ở vị trí ${index + 1} ra sau`}
                    disabled={saving || index === 2}
                    onClick={() => setSlots(previous => moveCollectionSlot(previous, index, index + 1))}
                    className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  >
                    Sau
                    <ArrowRight size={15} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </AlbumPickerGroup>
          <footer className="mt-6 flex flex-col gap-4 border-t border-gray-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div aria-live="polite" className="text-sm text-gray-500">
              <p>
                {!complete
                  ? 'Chọn đủ 3 bộ ảnh khác nhau để lưu.'
                  : dirty
                    ? 'Có thay đổi chưa lưu.'
                    : 'Đã lưu 3 bộ ảnh cho trang chủ.'}
              </p>
              <p className="mt-1 text-xs">Trang chủ cập nhật theo bộ nhớ đệm, khoảng 1 phút sau khi lưu.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving || !hasSlotChanges}
                onClick={() => setSlots(getCollectionSlots(configuration))}
                className="min-h-11 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Hủy thay đổi
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || !complete || !dirty}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              >
                {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
                {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
              </button>
            </div>
          </footer>
        </section>
      ) : null}
    </div>
  )
}
