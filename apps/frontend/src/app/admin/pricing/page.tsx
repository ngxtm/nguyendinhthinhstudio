'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Loader2, Save, Upload } from 'lucide-react'
import { toast } from 'sonner'
import type { AdminPricing, PricingCategoryId, PricingPrices } from '@ndt/types'
import { getAdminPricing, publishPricing, savePricingDraft } from '@/lib/api/pricing'
import { formatPriceInput, formatPriceVnd, parsePriceInput, pricingCategories } from '@/lib/pricing'
import { useAbortableEffect } from '../hooks/useAbortableEffect'
import { getAdminErrorMessage } from '../error-message'

function priceInputs(prices: PricingPrices): Record<string, string> {
  return Object.fromEntries(Object.entries(prices).map(([id, value]) => [id, formatPriceInput(value)]))
}

export default function PricingPage() {
  const [categoryId, setCategoryId] = useState<PricingCategoryId>('ca-nhan')
  const [configuration, setConfiguration] = useState<AdminPricing | null>(null)
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<'draft' | 'publish' | null>(null)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [retry, setRetry] = useState(0)
  const category = pricingCategories.find(item => item.id === categoryId)!

  useAbortableEffect(
    signal => {
      setLoading(true)
      setLoadError('')
      setSaveError('')
      setConflict(false)
      setConfiguration(null)
      getAdminPricing(categoryId, signal)
        .then(data => {
          if (signal.aborted) return
          setConfiguration(data)
          setInputs(priceInputs(data.draft))
        })
        .catch(cause => {
          if (!signal.aborted) setLoadError(getAdminErrorMessage(cause, 'Không thể tải bảng giá. Hãy thử lại.'))
        })
        .finally(() => {
          if (!signal.aborted) setLoading(false)
        })
    },
    [categoryId, retry]
  )

  const invalid = category.packages.filter(item => parsePriceInput(inputs[item.id] ?? '') === null)
  const unsaved = configuration
    ? category.packages.filter(item => parsePriceInput(inputs[item.id] ?? '') !== configuration.draft[item.id])
    : []
  const unpublished = configuration
    ? category.packages.filter(item => parsePriceInput(inputs[item.id] ?? '') !== configuration.published[item.id])
    : []
  const dirty = unsaved.length > 0
  const busy = pending !== null

  useEffect(() => {
    if (!dirty) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const navigate = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a') : null
      if (
        !link ||
        link.target === '_blank' ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        !link.href ||
        link.href === window.location.href
      )
        return
      if (!window.confirm('Có thay đổi chưa lưu. Bạn muốn rời trang và bỏ các thay đổi này?')) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', navigate, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', navigate, true)
    }
  }, [dirty])

  function selectCategory(id: PricingCategoryId) {
    if (busy || id === categoryId) return
    if (dirty && !window.confirm('Có thay đổi chưa lưu. Bạn muốn đổi nhóm và bỏ các thay đổi này?')) return
    setConfiguration(null)
    setLoading(true)
    setCategoryId(id)
  }

  async function save(action: 'draft' | 'publish') {
    if (!configuration || busy || invalid.length || conflict || (action === 'draft' ? !dirty : !unpublished.length))
      return
    setPending(action)
    setSaveError('')
    const prices = Object.fromEntries(category.packages.map(item => [item.id, parsePriceInput(inputs[item.id])!]))
    try {
      const input = { revision: configuration.revision, prices }
      const result = await (action === 'draft'
        ? savePricingDraft(categoryId, input)
        : publishPricing(categoryId, input))
      setConfiguration(result)
      setInputs(priceInputs(result.draft))
      toast.success(
        action === 'draft'
          ? 'Đã lưu nháp. Giá trên website chưa thay đổi.'
          : 'Đã xuất bản giá. Website sẽ hiển thị giá mới khi tải trang.'
      )
    } catch (cause) {
      setSaveError(getAdminErrorMessage(cause, 'Không thể lưu bảng giá. Các thay đổi vẫn được giữ để thử lại.'))
      if (cause && typeof cause === 'object' && 'status' in cause && cause.status === 409) setConflict(true)
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="space-y-6 text-gray-900 [color-scheme:light]">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Quản lý bảng giá</h1>
          <p className="mt-2 text-sm text-gray-600">
            Chỉnh giá các gói dịch vụ. Lưu nháp để chuẩn bị, xuất bản để cập nhật lên website.
          </p>
        </div>
        <a
          href={`/bang-gia/${categoryId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium hover:bg-gray-50"
        >
          <ExternalLink size={16} aria-hidden="true" /> Xem bảng giá
        </a>
      </header>

      <nav aria-label="Nhóm bảng giá" className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {pricingCategories.map(item => (
          <button
            key={item.id}
            type="button"
            disabled={busy}
            aria-current={item.id === categoryId ? 'page' : undefined}
            onClick={() => selectCategory(item.id)}
            className={`min-h-12 shrink-0 border-b-2 px-4 text-sm font-medium disabled:opacity-50 ${item.id === categoryId ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'}`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {loading ? (
        <p role="status" className="flex items-center gap-2 py-12 text-gray-500">
          <Loader2 size={18} className="animate-spin" aria-hidden="true" /> Đang tải bảng giá…
        </p>
      ) : null}
      {!loading && loadError ? (
        <div className="rounded-xl border border-red-200 bg-white p-6">
          <p role="alert" className="text-red-700">
            {loadError}
          </p>
          <button
            type="button"
            onClick={() => setRetry(value => value + 1)}
            className="mt-3 min-h-11 rounded-lg border border-gray-300 px-4 text-sm"
          >
            Thử lại
          </button>
        </div>
      ) : null}

      {!loading && configuration ? (
        <>
          <section className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 p-5">
              <h2 className="font-semibold">Các gói dịch vụ · {category.label}</h2>
              <span className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600">VNĐ</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th scope="col" className="px-5 py-3">
                      Gói dịch vụ
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Giá trên website
                    </th>
                    <th scope="col" className="px-5 py-3">
                      Giá chỉnh sửa (VNĐ)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {category.packages.map(item => {
                    const value = parsePriceInput(inputs[item.id] ?? '')
                    const changed = value !== configuration.published[item.id]
                    const hasError = value === null
                    return (
                      <tr key={item.id}>
                        <th scope="row" className="px-5 py-4 font-normal">
                          <span className="font-semibold text-gray-900">{item.name}</span>
                          <p className="mt-1 text-xs text-gray-500">
                            {item.tier} · /{item.unit}
                          </p>
                          {changed ? (
                            <span className="mt-2 inline-block rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                              Chưa xuất bản
                            </span>
                          ) : null}
                        </th>
                        <td className="px-4 py-4 whitespace-nowrap text-gray-600 tabular-nums">
                          {formatPriceVnd(configuration.published[item.id])}
                        </td>
                        <td className="px-5 py-4">
                          <input
                            aria-label={`Giá ${item.name}`}
                            aria-invalid={hasError}
                            aria-describedby={hasError ? `error-${item.id}` : undefined}
                            inputMode="numeric"
                            autoComplete="off"
                            maxLength={15}
                            disabled={busy}
                            value={inputs[item.id] ?? ''}
                            onChange={event => setInputs(previous => ({ ...previous, [item.id]: event.target.value }))}
                            onBlur={() => {
                              if (value !== null)
                                setInputs(previous => ({ ...previous, [item.id]: formatPriceInput(value) }))
                            }}
                            className={`min-h-11 w-40 rounded-lg border bg-white px-3 tabular-nums outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 ${hasError ? 'border-red-500' : 'border-gray-300'}`}
                          />
                          {hasError ? (
                            <p id={`error-${item.id}`} className="mt-1 max-w-44 text-xs text-red-600">
                              Nhập từ 1 đến 999.999.999 đồng, không có số lẻ.
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="border-t border-gray-100 p-5 text-xs leading-5 text-gray-500">
              Nhập số tiền đầy đủ bằng VNĐ. Giá theo người giữ nguyên đơn vị /người. Các dịch vụ kèm thêm và điều khoản
              giữ nội dung hiện tại.
            </p>
          </section>

          {saveError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p role="alert">{saveError}</p>
              {conflict ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!dirty || window.confirm('Tải lại sẽ bỏ các thay đổi chưa lưu. Bạn muốn tiếp tục?'))
                      setRetry(value => value + 1)
                  }}
                  className="mt-2 min-h-11 rounded-lg border border-red-300 bg-white px-4 font-medium"
                >
                  Tải lại bảng giá
                </button>
              ) : null}
            </div>
          ) : null}

          <footer className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div aria-live="polite" className="text-sm">
              <p className={dirty ? 'text-amber-700' : 'text-gray-600'}>
                {dirty ? `${unsaved.length} gói có thay đổi chưa lưu.` : 'Đã lưu các thay đổi.'}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {unpublished.length
                  ? `${unpublished.length} gói có giá khác website trong nhóm ${category.label}.`
                  : 'Giá đang trùng với website.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!dirty || busy}
                onClick={() => {
                  setInputs(priceInputs(configuration.draft))
                  if (!conflict) setSaveError('')
                }}
                className="min-h-11 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                Hủy thay đổi
              </button>
              <button
                type="button"
                disabled={!dirty || busy || !!invalid.length || conflict}
                onClick={() => void save('draft')}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-300 px-4 text-sm font-medium hover:bg-gray-50 disabled:opacity-40"
              >
                {pending === 'draft' ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Save size={16} aria-hidden="true" />
                )}
                {pending === 'draft' ? 'Đang lưu…' : 'Lưu nháp'}
              </button>
              <button
                type="button"
                disabled={!unpublished.length || busy || !!invalid.length || conflict}
                onClick={() => void save('publish')}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              >
                {pending === 'publish' ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Upload size={16} aria-hidden="true" />
                )}
                {pending === 'publish' ? 'Đang xuất bản…' : 'Xuất bản giá'}
              </button>
            </div>
          </footer>
        </>
      ) : null}
    </div>
  )
}
