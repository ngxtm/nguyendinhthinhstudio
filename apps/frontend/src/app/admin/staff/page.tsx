'use client'

/**
 * Quản lý nhân viên
 * CRUD hồ sơ nhân viên (thợ chụp / người makeup) với avatar.
 */

import { Fragment, useEffect, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { Pencil, Plus, Trash2, X, UserCircle } from 'lucide-react'
import { toast } from 'sonner'
import {
  createStaff,
  deleteStaff,
  listStaff,
  updateStaff,
  uploadStaffAvatar,
  type CreateStaffDto,
  type Staff,
  type StaffRole,
  type StaffStatus
} from '@/lib/api'
import { useAbortableEffect } from '@/app/admin/hooks'
import ConfirmDialog from '../components/ConfirmDialog'

const ROLES: { value: StaffRole; label: string }[] = [
  { value: 'photographer', label: 'Thợ chụp' },
  { value: 'makeup_artist', label: 'Người makeup' }
]

const STATUSES: { value: StaffStatus; label: string; badge: string }[] = [
  { value: 'active', label: 'Đang làm', badge: 'bg-green-100 text-green-700' },
  { value: 'inactive', label: 'Nghỉ', badge: 'bg-gray-100 text-gray-600' }
]

const EMPTY_FORM: CreateStaffDto = {
  fullName: '',
  phone: '',
  email: '',
  avatarUrl: '',
  role: 'photographer',
  status: 'active',
  note: ''
}

export default function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Staff | null>(null)
  const [form, setForm] = useState<CreateStaffDto>(EMPTY_FORM)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteCandidate, setDeleteCandidate] = useState<Staff | null>(null)
  const [isDeletePending, setIsDeletePending] = useState(false)

  const loadStaff = async (signal?: AbortSignal) => {
    try {
      const data = await listStaff()
      if (!signal?.aborted) setStaff(data)
    } catch {
      if (!signal?.aborted) toast.error('Không thể tải danh sách nhân viên')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }

  useAbortableEffect(signal => {
    loadStaff(signal)
  }, [])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setAvatarFile(null)
    setAvatarPreview(null)
    setModalOpen(true)
  }

  const openEdit = (s: Staff) => {
    setEditing(s)
    setForm({
      fullName: s.fullName,
      phone: s.phone ?? '',
      email: s.email ?? '',
      avatarUrl: s.avatarUrl ?? '',
      role: s.role,
      status: s.status,
      note: s.note ?? ''
    })
    setAvatarFile(null)
    setAvatarPreview(s.avatarUrl ?? null)
    setModalOpen(true)
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Avatar phải là ảnh JPEG/PNG/WebP')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Avatar tối đa 5MB')
      return
    }
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.fullName.trim()) {
      toast.error('Vui lòng nhập họ tên')
      return
    }
    setSaving(true)
    try {
      const payload: CreateStaffDto = {
        ...form,
        email: form.email?.trim() || undefined,
        phone: form.phone?.trim() || undefined,
        avatarUrl: form.avatarUrl?.trim() || undefined,
        note: form.note?.trim() || undefined
      }
      if (editing) {
        await updateStaff(editing.id, payload)
        if (avatarFile) {
          await uploadStaffAvatar(editing.id, avatarFile)
        }
        toast.success('Đã cập nhật nhân viên')
      } else {
        const created = await createStaff(payload)
        if (avatarFile) {
          await uploadStaffAvatar(created.id, avatarFile)
        }
        toast.success('Đã thêm nhân viên')
      }
      setModalOpen(false)
      await loadStaff()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Lưu thất bại'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const requestDelete = (s: Staff) => {
    if (!isDeletePending) setDeleteCandidate(s)
  }

  const handleConfirmDelete = async (): Promise<void> => {
    if (!deleteCandidate || isDeletePending) return

    setIsDeletePending(true)
    try {
      await deleteStaff(deleteCandidate.id)
      toast.success('Đã xóa nhân viên')
      setDeleteCandidate(null)
      await loadStaff()
    } catch {
      toast.error('Xóa nhân viên thất bại')
    } finally {
      setIsDeletePending(false)
    }
  }

  const roleLabel = (r: StaffRole) => ROLES.find(x => x.value === r)?.label ?? r
  const statusMeta = (s: StaffStatus) => STATUSES.find(x => x.value === s) ?? STATUSES[0]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý nhân viên</h1>
          <p className="mt-1 text-sm text-gray-500">Hồ sơ thợ chụp và người makeup của studio.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Plus size={18} />
          Thêm nhân viên
        </button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-gray-500">Đang tải…</div>
      ) : staff.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center">
          <p className="text-sm text-gray-500">Chưa có nhân viên nào. Bấm “Thêm nhân viên” để bắt đầu.</p>
        </div>
      ) : (
        <div className="w-full overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[48rem] table-fixed divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-[26%] min-w-[10rem] px-4 py-3 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase">
                  Nhân viên
                </th>
                <th className="w-[26%] min-w-[11rem] px-4 py-3 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase">
                  Liên hệ
                </th>
                <th className="w-[18%] px-4 py-3 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase">
                  Vai trò
                </th>
                <th className="w-[16%] px-4 py-3 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase">
                  Trạng thái
                </th>
                <th className="w-[14%] px-4 py-3 text-right text-xs font-semibold tracking-wider text-gray-500 uppercase">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {staff.map(s => {
                const sm = statusMeta(s.status)
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="min-w-[10rem] px-4 py-3 whitespace-nowrap">
                      <div className="flex min-w-0 items-center gap-3 overflow-hidden">
                        <div className="shrink-0">
                          <Avatar url={s.avatarUrl} name={s.fullName} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div title={s.fullName} className="truncate font-medium text-gray-900">
                            {s.fullName}
                          </div>
                          {s.note && (
                            <div title={s.note} className="truncate text-xs text-gray-500">
                              {s.note}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="min-w-[11rem] px-4 py-3 text-sm text-gray-600">
                      <div className="min-w-0 space-y-1 overflow-hidden whitespace-nowrap">
                        {s.phone && (
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="shrink-0 text-gray-400">SĐT:</span>
                            <span title={s.phone} className="truncate">
                              {s.phone}
                            </span>
                          </div>
                        )}
                        {s.email && (
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="shrink-0 text-gray-400">Email:</span>
                            <span title={s.email} className="truncate text-gray-500">
                              {s.email}
                            </span>
                          </div>
                        )}
                        {!s.phone && !s.email && <span className="text-gray-400">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{roleLabel(s.role)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${sm.badge}`}>
                        {sm.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(s)}
                          className="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-blue-600"
                          aria-label="Sửa"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => requestDelete(s)}
                          disabled={isDeletePending}
                          className="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-600 disabled:opacity-50"
                          aria-label="Xóa"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit modal */}
      <Transition appear show={modalOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setModalOpen(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/40" />
          </Transition.Child>
          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-2xl bg-white p-6 shadow-xl transition-all">
                  <div className="flex items-center justify-between">
                    <Dialog.Title as="h3" className="text-lg font-semibold text-gray-900">
                      {editing ? 'Sửa nhân viên' : 'Thêm nhân viên'}
                    </Dialog.Title>
                    <button
                      onClick={() => setModalOpen(false)}
                      className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                    <div className="flex items-center gap-4">
                      <Avatar
                        url={avatarPreview ?? form.avatarUrl ?? undefined}
                        name={form.fullName || '?'}
                        size={64}
                      />
                      <label className="block flex-1">
                        <span className="mb-1 block text-sm font-medium text-gray-700">Ảnh avatar</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleAvatarChange}
                          className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
                        />
                        <span className="mt-1 block text-xs text-gray-400">
                          JPEG/PNG/WebP, tối đa 5MB. Tự resize 256×256 WebP khi hiển thị.
                        </span>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-gray-700">Họ tên *</span>
                        <input
                          type="text"
                          value={form.fullName}
                          onChange={e => setForm({ ...form, fullName: e.target.value })}
                          className="input"
                          required
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-gray-700">Số điện thoại</span>
                        <input
                          type="text"
                          value={form.phone ?? ''}
                          onChange={e => setForm({ ...form, phone: e.target.value })}
                          className="input"
                        />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="mb-1 block text-sm font-medium text-gray-700">Email</span>
                        <input
                          type="email"
                          value={form.email ?? ''}
                          onChange={e => setForm({ ...form, email: e.target.value })}
                          className="input"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-gray-700">Vai trò</span>
                        <select
                          value={form.role}
                          onChange={e => setForm({ ...form, role: e.target.value as StaffRole })}
                          className="input"
                        >
                          {ROLES.map(r => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-gray-700">Trạng thái</span>
                        <select
                          value={form.status}
                          onChange={e => setForm({ ...form, status: e.target.value as StaffStatus })}
                          className="input"
                        >
                          {STATUSES.map(s => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="mb-1 block text-sm font-medium text-gray-700">Ghi chú</span>
                        <textarea
                          value={form.note ?? ''}
                          onChange={e => setForm({ ...form, note: e.target.value })}
                          rows={2}
                          className="input"
                        />
                      </label>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setModalOpen(false)}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Thêm'}
                      </button>
                    </div>
                  </form>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      <ConfirmDialog
        open={deleteCandidate !== null}
        title="Xóa nhân viên?"
        description={
          <>
            Xóa nhân viên <strong>&quot;{deleteCandidate?.fullName}&quot;</strong>? Hành động này không thể hoàn tác.
          </>
        }
        confirmLabel="Xóa nhân viên"
        isPending={isDeletePending}
        onClose={() => setDeleteCandidate(null)}
        onConfirm={handleConfirmDelete}
      />

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid #d1d5db;
          background: #fff;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: #111827;
          outline: none;
          transition:
            border-color 0.15s,
            box-shadow 0.15s;
        }
        :global(.input:focus) {
          border-color: #2563eb;
          box-shadow: 0 0 0 1px #2563eb;
        }
      `}</style>
    </div>
  )
}

function Avatar({ url, name, size = 40 }: { url?: string | null; name: string; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return <UserCircle size={size} className="text-gray-300" />
}
