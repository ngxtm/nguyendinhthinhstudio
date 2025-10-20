'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Search } from 'lucide-react'
import { toast } from 'sonner'
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  checkCategoryUsage,
  bulkRemoveCategoryFromAlbums,
  generateSlug,
  type Category,
  type CreateCategoryDto
} from '@/app/lib/api'
import DeleteConfirmModal from '../components/DeleteConfirmModal'
import SearchableCombobox from '../components/SearchableCombobox'

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [deletingCategory, setDeletingCategory] = useState<{
    category: Category
    usage: { isUsed: boolean; albumCount: number; albums: any[] }
  } | null>(null)
  const [formData, setFormData] = useState<CreateCategoryDto>({
    name: '',
    slug: '',
    description: '',
    parentId: undefined
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    loadCategories()
  }, [])

  async function loadCategories() {
    try {
      setLoading(true)
      const data = await getCategories()
      setCategories(data)
    } catch (error) {
      console.error('Failed to load categories:', error)
      toast.error('Không thể tải danh sách categories')
    } finally {
      setLoading(false)
    }
  }

  const filteredCategories = categories.filter(
    cat =>
      cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cat.slug.toLowerCase().includes(searchQuery.toLowerCase())
  )

  function handleOpenCreateModal() {
    setEditingCategory(null)
    setFormData({ name: '', slug: '', description: '', parentId: undefined })
    setIsModalOpen(true)
  }

  function handleOpenEditModal(category: Category) {
    setEditingCategory(category)
    setFormData({
      name: category.name,
      slug: category.slug,
      description: category.description || '',
      parentId: category.parentId || undefined
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
      if (editingCategory) {
        await updateCategory(editingCategory.id, formData)
        toast.success('Cập nhật category thành công!')
      } else {
        await createCategory(formData)
        toast.success('Tạo category thành công!')
      }
      setIsModalOpen(false)
      loadCategories()
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.message || 'Có lỗi xảy ra')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDeleteClick(category: Category) {
    try {
      const usage = await checkCategoryUsage(category.id)
      setDeletingCategory({ category, usage })
      setIsDeleteModalOpen(true)
    } catch (error) {
      console.error('Error checking usage:', error)
      toast.error('Không thể kiểm tra usage của category')
    }
  }

  async function handleConfirmDelete() {
    if (!deletingCategory) return

    setIsSubmitting(true)
    try {
      await deleteCategory(deletingCategory.category.id)
      toast.success('Xóa category thành công!')
      setIsDeleteModalOpen(false)
      setDeletingCategory(null)
      loadCategories()
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.message || 'Không thể xóa category')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleBulkRemove() {
    if (!deletingCategory) return

    if (
      !confirm(
        `Xóa "${deletingCategory.category.name}" khỏi ${deletingCategory.usage.albumCount} album?`
      )
    ) {
      return
    }

    setIsSubmitting(true)
    try {
      const result = await bulkRemoveCategoryFromAlbums(deletingCategory.category.id)
      toast.success(`Đã xóa category khỏi ${result.removed} album!`)
      // Reload usage info
      const newUsage = await checkCategoryUsage(deletingCategory.category.id)
      setDeletingCategory({ ...deletingCategory, usage: newUsage })
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.message || 'Không thể xóa hàng loạt')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Đang tải...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Quản lý Categories</h1>
          <p className="mt-2 text-sm text-gray-600">
            Quản lý các danh mục album (Wedding, Couple, Family...)
          </p>
        </div>

        {/* Search & Actions */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm kiếm category..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus size={18} />
            Thêm Category
          </button>
        </div>

        {/* Categories Table */}
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Tên
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Slug
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Parent
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Số Album / Children
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Hành động
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500">
                    {searchQuery ? 'Không tìm thấy category' : 'Chưa có category nào'}
                  </td>
                </tr>
              ) : (
                filteredCategories.map(category => (
                  <tr key={category.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{category.name}</div>
                        {category.description && (
                          <div className="text-xs text-gray-500">{category.description}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <code className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
                        {category.slug}
                      </code>
                    </td>
                    <td className="px-6 py-4">
                      {category.parent ? (
                        <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800">
                          {category.parent.name}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                          {category.albumCount} album
                        </span>
                        {category.childrenCount !== undefined && category.childrenCount > 0 && (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                            {category.childrenCount} children
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleOpenEditModal(category)}
                          className="rounded p-1.5 text-gray-600 hover:bg-gray-100"
                          title="Chỉnh sửa"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(category)}
                          className="rounded p-1.5 text-red-600 hover:bg-red-50"
                          title="Xóa"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-gray-900">
              {editingCategory ? 'Chỉnh sửa Category' : 'Thêm Category Mới'}
            </h2>
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Tên Category *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => handleNameChange(e.target.value)}
                  placeholder="VD: Wedding, Couple, Family..."
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Slug *</label>
                <input
                  type="text"
                  required
                  value={formData.slug}
                  onChange={e => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="wedding, couple, family..."
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
                <p className="mt-1 text-xs text-gray-500">Tự động tạo từ tên, có thể chỉnh sửa</p>
              </div>
              <div>
                <SearchableCombobox
                  label="Parent Category"
                  options={categories
                    .filter(c => !editingCategory || c.id !== editingCategory.id)
                    .map(cat => ({ id: cat.id, name: cat.name, slug: cat.slug }))}
                  selected={
                    formData.parentId
                      ? categories
                          .map(cat => ({ id: cat.id, name: cat.name, slug: cat.slug }))
                          .find(cat => cat.id === formData.parentId) || null
                      : null
                  }
                  onChange={(option) => setFormData({ ...formData, parentId: option?.id || undefined })}
                  placeholder="Tìm kiếm parent category..."
                />
                <p className="mt-1 text-xs text-gray-500">
                  Chọn parent category nếu đây là category con (VD: Cưới truyền thống thuộc Wedding). Bỏ trống nếu đây là category gốc.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Mô tả</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  placeholder="Mô tả ngắn về category..."
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
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
                  {isSubmitting ? 'Đang lưu...' : editingCategory ? 'Cập nhật' : 'Tạo mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {isDeleteModalOpen && deletingCategory && (
        <DeleteConfirmModal
          isOpen={isDeleteModalOpen}
          onClose={() => {
            setIsDeleteModalOpen(false)
            setDeletingCategory(null)
          }}
          onConfirm={handleConfirmDelete}
          onBulkRemove={deletingCategory.usage.isUsed ? handleBulkRemove : undefined}
          title="Xóa Category"
          itemName={deletingCategory.category.name}
          itemType="category"
          isUsed={deletingCategory.usage.isUsed}
          albumCount={deletingCategory.usage.albumCount}
          albums={deletingCategory.usage.albums}
          isLoading={isSubmitting}
        />
      )}
    </div>
  )
}
