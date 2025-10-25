/**
 * Tags API Service
 */

import { apiClient } from './client';
import type { Tag, Album } from './albums';
import { normalizeAlbumTags, normalizeAlbumCategories } from './albums';

export interface CreateTagDto {
  name: string;
  slug: string;
  description?: string;
}

export interface UpdateTagDto {
  name?: string;
  slug?: string;
  description?: string;
}

/**
 * Get all tags
 */
export async function getTags(): Promise<Tag[]> {
  return apiClient<Tag[]>('/tags');
}

/**
 * Get tag by ID
 */
export async function getTag(id: string): Promise<Tag> {
  return apiClient<Tag>(`/tags/${id}`);
}

/**
 * Create new tag (Admin only)
 */
export async function createTag(data: CreateTagDto): Promise<Tag> {
  return apiClient<Tag>('/tags', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Update tag (Admin only)
 */
export async function updateTag(id: string, data: UpdateTagDto): Promise<Tag> {
  return apiClient<Tag>(`/tags/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Delete tag (Admin only)
 */
export async function deleteTag(id: string): Promise<void> {
  return apiClient<void>(`/tags/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Check tag usage in albums
 */
export async function checkTagUsage(id: string): Promise<{
  isUsed: boolean;
  albumCount: number;
  albums: Array<{ id: string; title: string; slug: string }>;
}> {
  return apiClient(`/tags/${id}/usage`);
}

/**
 * Bulk remove tag from all albums
 */
export async function bulkRemoveTagFromAlbums(tagId: string): Promise<{
  removed: number;
}> {
  return apiClient(`/tags/${tagId}/bulk-remove`, {
    method: 'POST',
  });
}

export interface TagAlbumsResponse {
  tag: Tag;
  data: Album[];
  pagination: {
    limit: number;
    offset: number;
    nextOffset: number | null;
    hasMore: boolean;
    totalPrimary: number;
    totalFallback: number;
  };
}

export async function getTagAlbums(
  slug: string,
  params?: { limit?: number; offset?: number }
): Promise<TagAlbumsResponse> {
  const searchParams = new URLSearchParams();

  if (params?.limit !== undefined) {
    searchParams.set('limit', String(params.limit));
  }

  if (params?.offset !== undefined) {
    searchParams.set('offset', String(params.offset));
  }

  const query = searchParams.toString();

  const response = await apiClient<TagAlbumsResponse>(
    `/tags/slug/${slug}/albums${query ? `?${query}` : ''}`
  );

  return {
    ...response,
    data: response.data.map(album => {
      const normalizedTags = normalizeAlbumTags(album.tags);
      const normalizedCategories = normalizeAlbumCategories(album.categories);
      const primaryCategory = album.primaryCategory || normalizedCategories.find(cat => cat.source === 'manual') || null;

      return {
        ...album,
        tags: normalizedTags,
        categories: normalizedCategories,
        primaryCategory,
      };
    }),
  };
}
