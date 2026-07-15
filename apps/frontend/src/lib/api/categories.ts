/**
 * Categories API Service
 */

import { apiClient, adminApiClient } from './client';

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  parentId?: string | null;
  parent?: Category | null;
  children?: Category[];
  albumCount: number;
  childrenCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryDto {
  name: string;
  slug: string;
  description?: string;
  parentId?: string;
}

export interface UpdateCategoryDto {
  name?: string;
  slug?: string;
  description?: string;
  parentId?: string | null;
}

/**
 * Get all categories
 */
export async function getCategories(admin = false): Promise<Category[]> {
  return (admin ? adminApiClient : apiClient)<Category[]>('/categories');
}

/**
 * Get category by ID
 */
export async function getCategory(id: string): Promise<Category> {
  return apiClient<Category>(`/categories/${id}`);
}

/**
 * Create new category (Admin only)
 */
export async function createCategory(data: CreateCategoryDto): Promise<Category> {
  return adminApiClient<Category>('/categories', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Update category (Admin only)
 */
export async function updateCategory(
  id: string,
  data: UpdateCategoryDto
): Promise<Category> {
  return adminApiClient<Category>(`/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Delete category (Admin only)
 */
export async function deleteCategory(id: string): Promise<void> {
  return adminApiClient<void>(`/categories/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Check category usage in albums
 */
export async function checkCategoryUsage(id: string): Promise<{
  isUsed: boolean;
  albumCount: number;
  albums: Array<{ id: string; title: string; slug: string }>;
}> {
  return adminApiClient(`/categories/${id}/usage`);
}

/**
 * Bulk remove category from all albums
 */
export async function bulkRemoveCategoryFromAlbums(categoryId: string): Promise<{
  removed: number;
}> {
  return adminApiClient(`/categories/${categoryId}/bulk-remove`, {
    method: 'POST',
  });
}

/**
 * Generate slug from name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}
