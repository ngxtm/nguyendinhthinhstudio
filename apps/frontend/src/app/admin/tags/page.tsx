'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Search, Tag as TagIcon, Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import {
  getTags,
  createTag,
  updateTag,
  deleteTag,
  checkTagUsage,
  bulkRemoveTagFromAlbums,
  generateSlug,
  type Tag,
  type CreateTagDto
} from '@/lib/api'
import DeleteConfirmModal from '../components/DeleteConfirmModal'

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [deletingTag, setDeletingTag] = useState<{
    tag: Tag
    usage: { isUsed: boolean; albumCount: number; albums: any[] }
  } | null>(null)
  const [formData, setFormData] = useState<CreateTagDto>({
    name: '',
    slug: '',
    description: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)

  useEffect(() => {
    loadTags()
  }, [])

  async function loadTags() {
    try {
      setLoading(true)
      const data = await getTags(true)
      setTags(data)
    } catch (error) {
      console.error('Failed to load tags:', error)
      toast.error('Không thể tải danh sách tags')
    } finally {
      setLoading(false)
    }
  }

  const filteredTags = tags.filter(
    tag =>
      tag.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tag.slug.toLowerCase().includes(searchQuery.toLowerCase())
  )

  function handleOpenCreateModal() {
    setEditingTag(null)
    setFormData({ name: '', slug: '', description: '' })
    setIsModalOpen(true)
  }

  function handleOpenEditModal(tag: Tag) {
    setEditingTag(tag)
    setFormData({
      name: tag.name,
      slug: tag.slug,
      description: tag.description || ''
    })
    setIsModalOpen(true)
  }

  function handleNameChange(name: string) {
    setFormData({
      ...formData,
      name,
      slug: generateSlug(name)
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      if (editingTag) {
        await updateTag(editingTag.id, formData)
        toast.success('Cập nhật tag thành công!')
      } else {
        await createTag(formData)
        toast.success('Tạo tag thành công!')
      }
      setIsModalOpen(false)
      loadTags()
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.message || 'Có lỗi xảy ra')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDeleteClick(tag: Tag) {
    try {
      const usage = await checkTagUsage(tag.id)
      setDeletingTag({ tag, usage })
      setIsDeleteModalOpen(true)
    } catch (error) {
      console.error('Error checking usage:', error)
      toast.error('Không thể kiểm tra usage của tag')
    }
  }

  async function handleConfirmDelete() {
    if (!deletingTag) return

    setIsSubmitting(true)
    try {
      await deleteTag(deletingTag.tag.id)
      toast.success('Xóa tag thành công!')
      setIsDeleteModalOpen(false)
      setDeletingTag(null)
      loadTags()
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.message || 'Không thể xóa tag')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleBulkRemove(): Promise<boolean> {
    if (!deletingTag) return false

    setIsSubmitting(true)
    try {
      const result = await bulkRemoveTagFromAlbums(deletingTag.tag.id)
      toast.success(`Đã xóa tag khỏi ${result.removed} album!`)
      const newUsage = await checkTagUsage(deletingTag.tag.id)
      setDeletingTag({ ...deletingTag, usage: newUsage })
      return true
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.message || 'Không thể xóa hàng loạt')
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleCopySlug(slug: string) {
    navigator.clipboard.writeText(slug)
    setCopiedSlug(slug)
    setTimeout(() => setCopiedSlug(null), 2000)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Đang tải...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Quản lý Tags</h1>
        <p className="mt-2 text-sm text-gray-600">
          Quản lý các thẻ phân loại album (Tết, Mùa xuân, Nàng thơ, Cá tính, Sexy...)
        </p>
        <div className="mt-3 flex items-center gap-4 text-sm">
          <span className="text-gray-700">
            <span className="font-semibold text-blue-600">{tags.length}</span> tags tổng cộng
          </span>
          {searchQuery && (
            <span className="text-gray-700">
              <span className="font-semibold text-green-600">{filteredTags.length}</span> kết quả tìm kiếm
            </span>
          )}
        </div>
      </div>

      {/* Search & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs md:max-w-sm">
          <Search className="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Tìm kiếm tag..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 pr-4 pl-10 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
          />
        </div>
        <button
          onClick={handleOpenCreateModal}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 sm:w-auto"
        >
          <Plus size={18} />
          Thêm Tag
        </button>
      </div>

      {/* Tags Display - Enhanced card grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredTags.map(tag => (
          <div
            key={tag.id}
            className="group relative rounded-xl border border-gray-200 bg-white p-4 transition-all duration-200 hover:border-blue-400 hover:shadow-lg"
          >
            {/* Header with icon and name */}
            <div className="mb-3 flex items-start justify-between">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <div className="flex-shrink-0 rounded-lg bg-blue-50 p-2">
                  <TagIcon size={18} className="text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base font-semibold text-gray-900">{tag.name}</h3>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="block max-w-[150px] truncate rounded bg-gray-50 px-2 py-0.5 text-xs text-gray-500">
                      {tag.slug}
                    </code>
                    <button
                      onClick={() => handleCopySlug(tag.slug)}
                      className="text-gray-400 transition-colors hover:text-blue-600"
                      title="Copy slug"
                    >
                      {copiedSlug === tag.slug ? (
                        <span className="text-xs font-medium text-green-600">✓</span>
                      ) : (
                        <Copy size={12} />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="ml-2 flex gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                <button
                  onClick={() => handleOpenEditModal(tag)}
                  className="inline-flex items-center justify-center rounded bg-gray-100 p-1.5 text-gray-600 transition-colors hover:bg-blue-100 hover:text-blue-600"
                  title="Chỉnh sửa"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => handleDeleteClick(tag)}
                  className="inline-flex items-center justify-center rounded bg-gray-100 p-1.5 text-gray-600 transition-colors hover:bg-red-100 hover:text-red-600"
                  title="Xóa"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Description */}
            {tag.description ? (
              <p className="mb-3 line-clamp-2 min-h-[40px] text-sm text-gray-600">{tag.description}</p>
            ) : (
              <p className="mb-3 min-h-[40px] text-sm text-gray-400 italic">Chưa có mô tả</p>
            )}

            {/* Footer with quick link */}
            <div className="flex items-center justify-end border-t border-gray-100 pt-3">
              <a
                href={`/thu-vien?tag=${tag.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
                title="Xem albums có tag này trên trang chủ"
              >
                Xem trên trang chủ
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {filteredTags.length === 0 && (
        <div className="rounded-lg bg-white p-12 text-center shadow">
          <TagIcon className="mx-auto mb-4 h-12 w-12 text-gray-400" />
          <h3 className="mb-2 text-lg font-medium text-gray-900">
            {searchQuery ? 'Không tìm thấy tag' : 'Chưa có tag nào'}
          </h3>
          <p className="mb-6 text-sm text-gray-500">
            {searchQuery ? 'Thử tìm kiếm với từ khóa khác' : 'Tạo tag đầu tiên để bắt đầu phân loại album của bạn'}
          </p>
          {!searchQuery && (
            <button
              onClick={handleOpenCreateModal}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus size={18} />
              Thêm Tag Đầu Tiên
            </button>
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-gray-900">{editingTag ? 'Chỉnh sửa Tag' : 'Thêm Tag Mới'}</h2>
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Tên Tag *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => handleNameChange(e.target.value)}
                  placeholder="VD: Tết, Mùa xuân, Nàng thơ, Cá tính, Sexy..."
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Slug *</label>
                <input
                  type="text"
                  required
                  value={formData.slug}
                  onChange={e => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="tet, mua-xuan, nang-tho..."
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
                />
                <p className="mt-1 text-xs text-gray-500">Tự động tạo từ tên, có thể chỉnh sửa</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Mô tả</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  placeholder="Mô tả ngắn về tag..."
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Đang lưu...' : editingTag ? 'Cập nhật' : 'Tạo mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {isDeleteModalOpen && deletingTag && (
        <DeleteConfirmModal
          isOpen={isDeleteModalOpen}
          onClose={() => {
            setIsDeleteModalOpen(false)
            setDeletingTag(null)
          }}
          onConfirm={handleConfirmDelete}
          onBulkRemove={deletingTag.usage.isUsed ? handleBulkRemove : undefined}
          title="Xóa Tag"
          itemName={deletingTag.tag.name}
          itemType="tag"
          isUsed={deletingTag.usage.isUsed}
          albumCount={deletingTag.usage.albumCount}
          albums={deletingTag.usage.albums}
          isLoading={isSubmitting}
        />
      )}
    </div>
  )
}
