/**
 * Create Album Page
 * Form để tạo album mới
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import {
  createAlbum,
  getTags,
  getCategories,
  type CreateAlbumDto,
  type Tag,
  type Category as ApiCategory
} from '@/lib/api'
import CategoryCombobox from '../../components/CategoryCombobox'

export default function NewAlbumPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [tags, setTags] = useState<Tag[]>([])
  const [categories, setCategories] = useState<ComboboxCategory[]>([])
  const [selectedCategories, setSelectedCategories] = useState<ComboboxCategory[]>([])
  const [formData, setFormData] = useState<CreateAlbumDto>({
    title: '',
    slug: '',
    description: '',
    shootDate: '',
    categoryIds: [],
    tagSlugs: [],
    status: 'draft',
    isFeatured: false,
    metaTitle: '',
    metaDescription: ''
  })

  type ComboboxCategory = {
    id: string
    name: string
    slug: string
    parent?: {
      id: string
      name: string
      slug: string
    } | null
  }

  function mapCategoryToOption(category: ApiCategory): ComboboxCategory {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      parent: category.parent
        ? {
            id: category.parent.id,
            name: category.parent.name,
            slug: category.parent.slug
          }
        : null
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoadingData(true)
      const [allTags, allCategories] = await Promise.all([getTags(true), getCategories(true)])
      setTags(allTags)
      const mappedCategories = allCategories.map(mapCategoryToOption)
      setCategories(mappedCategories)
      setSelectedCategories(prev => {
        if (prev.length === 0) return prev
        const mapped = prev
          .map(cat => mappedCategories.find(c => c.id === cat.id))
          .filter((cat): cat is ComboboxCategory => Boolean(cat))
        if (mapped.length !== prev.length) {
          setFormData(current => ({
            ...current,
            categoryIds: mapped.map(cat => cat.id)
          }))
        }
        return mapped
      })
    } catch (error) {
      console.error('Failed to load data:', error)
      toast.error('Không thể tải danh sách danh mục và thẻ')
    } finally {
      setLoadingData(false)
    }
  }

  async function handleRefresh() {
    await loadData()
  }

  function handleCategoryChange(nextCategories: ComboboxCategory[]) {
    setSelectedCategories(nextCategories)
    setFormData(current => ({
      ...current,
      categoryIds: nextCategories.map(cat => cat.id)
    }))
  }

  function generateSlug(title: string) {
    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
  }

  function handleTitleChange(title: string) {
    setFormData(current => ({
      ...current,
      title,
      slug: generateSlug(title)
    }))
  }

  function toggleTag(tagSlug: string) {
    const currentTags = formData.tagSlugs || []
    if (currentTags.includes(tagSlug)) {
      setFormData(current => ({
        ...current,
        tagSlugs: currentTags.filter(s => s !== tagSlug)
      }))
    } else {
      setFormData(current => ({
        ...current,
        tagSlugs: [...currentTags, tagSlug]
      }))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!formData.title.trim()) {
      toast.error('Vui lòng nhập tên bộ ảnh')
      return
    }

    if (!formData.categoryIds || formData.categoryIds.length === 0) {
      toast.error('Vui lòng chọn ít nhất một danh mục')
      return
    }

    try {
      setLoading(true)
      const album = await createAlbum(formData)
      toast.success('Đã tạo bộ ảnh thành công!')
      router.push(`/admin/albums/${album.slug}`)
    } catch (error) {
      console.error('Failed to create album:', error)
      toast.error('Không thể tạo bộ ảnh. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link href="/admin/albums" className="mb-4 inline-flex items-center gap-2 text-gray-600 hover:text-gray-900">
          <ArrowLeft size={20} />
          Quay lại
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Tạo bộ ảnh mới</h1>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-3xl">
        <div className="space-y-6 rounded-lg bg-white p-6 shadow">
          {/* Title */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Tên bộ ảnh <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={e => handleTitleChange(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
              placeholder="Nàng Sen - Bộ ảnh làm đẹp"
              required
            />
          </div>

          {/* Slug */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Đường dẫn (slug)</label>
            <input
              type="text"
              value={formData.slug}
              onChange={e => setFormData(current => ({ ...current, slug: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
              placeholder="nang-sen-bo-anh-lam-dep"
            />
            <p className="mt-1 text-sm text-gray-500">Đường dẫn: /thu-vien/{formData.slug || 'bo-anh-slug'}</p>
          </div>

          {/* Description */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Mô tả</label>
            <textarea
              value={formData.description}
              onChange={e => setFormData(current => ({ ...current, description: e.target.value }))}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
              placeholder="Bộ ảnh đẹp với chủ đề hoa sen..."
            />
          </div>

          {/* Shoot Date */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Ngày Chụp</label>
            <input
              type="date"
              value={formData.shootDate}
              onChange={e => setFormData(current => ({ ...current, shootDate: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-sm text-gray-500">Ngày thực hiện buổi chụp (tùy chọn)</p>
          </div>

          {/* Category */}
          <div className="flex gap-2">
            <div className="flex-1">
              <CategoryCombobox
                categories={categories}
                selected={selectedCategories}
                onChange={handleCategoryChange}
                label="Danh mục"
                required={true}
                disabled={loadingData}
              />
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loadingData}
              className="mt-8 h-[42px] rounded-lg border border-gray-300 px-3 py-2 transition-colors hover:bg-gray-50 disabled:opacity-50"
              title="Tải lại danh sách"
            >
              <RefreshCw size={20} className={loadingData ? 'animate-spin' : ''} />
            </button>
          </div>
          <p className="-mt-4 text-sm text-gray-500">Vừa tạo danh mục mới? Nhấp nút tải lại để cập nhật danh sách</p>

          {/* Tags */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Thẻ</label>
            {loadingData ? (
              <p className="text-sm text-gray-500">Đang tải thẻ...</p>
            ) : tags.length === 0 ? (
              <p className="text-sm text-gray-500">
                Chưa có thẻ.{' '}
                <Link href="/admin/tags" className="text-blue-600 hover:underline">
                  Tạo thẻ mới
                </Link>
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => {
                  const isSelected = formData.tagSlugs?.includes(tag.slug)
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.slug)}
                      className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                        isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {tag.name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Status */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Trạng thái</label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="draft"
                  checked={formData.status === 'draft'}
                  onChange={e => setFormData(current => ({ ...current, status: e.target.value as any }))}
                  className="mr-2"
                />
                <span>Nháp</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="published"
                  checked={formData.status === 'published'}
                  onChange={e => setFormData(current => ({ ...current, status: e.target.value as any }))}
                  className="mr-2"
                />
                <span>Đã xuất bản</span>
              </label>
            </div>
          </div>

          {/* Featured */}
          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.isFeatured}
                onChange={e => setFormData(current => ({ ...current, isFeatured: e.target.checked }))}
                className="mr-2 rounded"
              />
              <span className="text-sm font-medium text-gray-700">Nổi bật (hiển thị ưu tiên trên trang chủ)</span>
            </label>
          </div>

          {/* SEO Section */}
          <div className="border-t pt-6">
            <h3 className="mb-4 text-lg font-semibold">Cài đặt SEO (Không bắt buộc)</h3>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Tiêu đề meta</label>
                <input
                  type="text"
                  value={formData.metaTitle}
                  onChange={e => setFormData(current => ({ ...current, metaTitle: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  placeholder="Nàng Sen - Bộ ảnh làm đẹp | NDT Studio"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Mô tả meta</label>
                <textarea
                  value={formData.metaDescription}
                  onChange={e => setFormData(current => ({ ...current, metaDescription: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  placeholder="Khám phá bộ ảnh đẹp với chủ đề hoa sen tại NDT Studio..."
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4 border-t pt-6">
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Đang tạo...' : 'Tạo bộ ảnh'}
            </button>
            <Link
              href="/admin/albums"
              className="rounded-lg border border-gray-300 px-6 py-3 font-medium transition-colors hover:bg-gray-50"
            >
              Hủy
            </Link>
          </div>
        </div>
      </form>
    </div>
  )
}
