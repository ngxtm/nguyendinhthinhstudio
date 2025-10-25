/**
 * Create Album Page
 * Form để tạo album mới
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  createAlbum,
  getTags,
  getCategories,
  type CreateAlbumDto,
  type Tag,
  type Category as ApiCategory
} from '@/lib/api';
import CategoryCombobox from '../../components/CategoryCombobox';

export default function NewAlbumPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [tags, setTags] = useState<Tag[]>([]);
  const [categories, setCategories] = useState<ComboboxCategory[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<ComboboxCategory[]>([]);
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
    metaDescription: '',
  });

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
            slug: category.parent.slug,
          }
        : null,
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoadingData(true);
      const [allTags, allCategories] = await Promise.all([
        getTags(),
        getCategories()
      ]);
      setTags(allTags);
      const mappedCategories = allCategories.map(mapCategoryToOption);
      setCategories(mappedCategories);
      setSelectedCategories(prev => {
        if (prev.length === 0) return prev;
        const mapped = prev
          .map(cat => mappedCategories.find(c => c.id === cat.id))
          .filter((cat): cat is ComboboxCategory => Boolean(cat));
        if (mapped.length !== prev.length) {
          setFormData(current => ({
            ...current,
            categoryIds: mapped.map(cat => cat.id),
          }));
        }
        return mapped;
      });
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Không thể tải danh sách categories và tags');
    } finally {
      setLoadingData(false);
    }
  }

  async function handleRefresh() {
    await loadData();
  }

  function handleCategoryChange(nextCategories: ComboboxCategory[]) {
    setSelectedCategories(nextCategories);
    setFormData((current) => ({
      ...current,
      categoryIds: nextCategories.map(cat => cat.id),
    }));
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
      .replace(/-+/g, '-');
  }

  function handleTitleChange(title: string) {
    setFormData((current) => ({
      ...current,
      title,
      slug: generateSlug(title),
    }));
  }

  function toggleTag(tagSlug: string) {
    const currentTags = formData.tagSlugs || [];
    if (currentTags.includes(tagSlug)) {
      setFormData((current) => ({
        ...current,
        tagSlugs: currentTags.filter((s) => s !== tagSlug),
      }));
    } else {
      setFormData((current) => ({
        ...current,
        tagSlugs: [...currentTags, tagSlug],
      }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast.error('Vui lòng nhập tên album');
      return;
    }

    if (!formData.categoryIds || formData.categoryIds.length === 0) {
      toast.error('Vui lòng chọn ít nhất một category');
      return;
    }

    try {
      setLoading(true);
      const album = await createAlbum(formData);
      toast.success('Đã tạo album thành công!');
      router.push(`/admin/albums/${album.slug}`);
    } catch (error) {
      console.error('Failed to create album:', error);
      toast.error('Không thể tạo album. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/admin/albums"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft size={20} />
          Quay lại
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Tạo Album Mới</h1>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-3xl">
        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tên Album <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Nàng Sen - Beauty Collection"
              required
            />
          </div>

          {/* Slug */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Slug (URL-friendly)
            </label>
            <input
              type="text"
              value={formData.slug}
              onChange={(e) => setFormData((current) => ({ ...current, slug: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="nang-sen-beauty-collection"
            />
            <p className="mt-1 text-sm text-gray-500">
              URL: /thu-vien/{formData.slug || 'album-slug'}
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mô tả
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData((current) => ({ ...current, description: e.target.value }))}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Bộ ảnh đẹp với chủ đề hoa sen..."
            />
          </div>

          {/* Shoot Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ngày Chụp
            </label>
            <input
              type="date"
              value={formData.shootDate}
              onChange={(e) => setFormData((current) => ({ ...current, shootDate: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="mt-1 text-sm text-gray-500">
              Ngày thực hiện buổi chụp (tùy chọn)
            </p>
          </div>

          {/* Category */}
          <div className="flex gap-2">
            <div className="flex-1">
              <CategoryCombobox
                categories={categories}
                selected={selectedCategories}
                onChange={handleCategoryChange}
                label="Category"
                required={true}
                disabled={loadingData}
              />
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loadingData}
              className="mt-8 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 h-[42px]"
              title="Tải lại danh sách"
            >
              <RefreshCw size={20} className={loadingData ? 'animate-spin' : ''} />
            </button>
          </div>
          <p className="text-sm text-gray-500 -mt-4">
            Vừa tạo category mới? Click nút refresh để cập nhật danh sách
          </p>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tags
            </label>
            {loadingData ? (
              <p className="text-sm text-gray-500">Đang tải tags...</p>
            ) : tags.length === 0 ? (
              <p className="text-sm text-gray-500">
                Chưa có tags. <Link href="/admin/tags" className="text-blue-600 hover:underline">Tạo tags mới</Link>
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => {
                  const isSelected = formData.tagSlugs?.includes(tag.slug);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.slug)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Status
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="draft"
                  checked={formData.status === 'draft'}
                onChange={(e) => setFormData((current) => ({ ...current, status: e.target.value as any }))}
                  className="mr-2"
                />
                <span>Draft</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="published"
                  checked={formData.status === 'published'}
                onChange={(e) => setFormData((current) => ({ ...current, status: e.target.value as any }))}
                  className="mr-2"
                />
                <span>Published</span>
              </label>
            </div>
          </div>

          {/* Featured */}
          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.isFeatured}
                onChange={(e) => setFormData((current) => ({ ...current, isFeatured: e.target.checked }))}
                className="mr-2 rounded"
              />
              <span className="text-sm font-medium text-gray-700">
                Featured (hiển thị ưu tiên trên homepage)
              </span>
            </label>
          </div>

          {/* SEO Section */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-4">SEO Settings (Optional)</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Meta Title
                </label>
                <input
                  type="text"
                  value={formData.metaTitle}
                  onChange={(e) => setFormData((current) => ({ ...current, metaTitle: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Nàng Sen - Bộ ảnh Beauty | NDT Studio"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Meta Description
                </label>
                <textarea
                  value={formData.metaDescription}
                  onChange={(e) => setFormData((current) => ({ ...current, metaDescription: e.target.value }))}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Khám phá bộ ảnh đẹp với chủ đề hoa sen tại NDT Studio..."
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-6 border-t">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Đang tạo...' : 'Tạo Album'}
            </button>
            <Link
              href="/admin/albums"
              className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Hủy
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}
