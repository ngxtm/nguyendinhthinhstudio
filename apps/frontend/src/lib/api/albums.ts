/**
 * Albums API Service
 * Tất cả các API calls cho albums
 */

import { apiClient, adminApiClient } from './client';

export interface Album {
  id: string;
  title: string;
  slug: string;
  description?: string;
  shootDate?: string;
  status: 'draft' | 'published' | 'scheduled';
  isFeatured: boolean;
  featuredOrder?: number;
  coverImage?: Image;
  images?: Image[];
  tags?: Tag[];
  categories?: AlbumCategory[];
  primaryCategory?: AlbumCategory | null;
  category?: AlbumCategory | null;
  imageCount: number;
  viewCount: number;
  googleDriveLink?: string;
  metaTitle?: string;
  metaDescription?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
}

export interface Image {
  id: string;
  albumId?: string;
  filename: string;
  r2ObjectKey?: string;
  thumbnailUrl: string;
  smallUrl: string;
  mediumUrl: string;
  largeUrl: string;
  xlargeUrl: string;
  altText?: string;
  orderIndex: number;
  width?: number;
  height?: number;
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

export interface AlbumCategory {
  id: string;
  name: string;
  slug: string;
  depth: number;
  source: 'manual' | 'parent';
}

export interface CreateAlbumDto {
  title: string;
  slug?: string;
  description?: string;
  shootDate?: string;
  categoryIds?: string[];
  tagSlugs?: string[];
  status?: 'draft' | 'published' | 'scheduled';
  scheduledPublishAt?: string;
  isFeatured?: boolean;
  featuredOrder?: number;
  googleDriveLink?: string;
  metaTitle?: string;
  metaDescription?: string;
}

export type UpdateAlbumDto = Partial<CreateAlbumDto>;

export interface QueryAlbumsParams {
  status?: string;
  category?: string;
  tag?: string;
  isFeatured?: boolean;
  limit?: number;
  cursor?: string;
  sortBy?: 'newest' | 'oldest' | 'popular' | 'featured';
  search?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
    limit: number;
  };
}

export interface AlbumDashboardStats {
  totalAlbums: number;
  publishedAlbums: number;
  draftAlbums: number;
  totalImages: number;
  totalViews: number;
}

type AlbumTagRelation = {
  tag?: Tag | null;
} & Record<string, unknown>;

type AlbumCategoryRelation = {
  category?: AlbumCategory | null;
  depth?: number;
  source?: string;
} & Record<string, unknown>;

function isAlbumTagRelation(value: unknown): value is AlbumTagRelation {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'tag' in (value as Record<string, unknown>)
  );
}

function isTag(value: unknown): value is Tag {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.name === 'string' && typeof candidate.slug === 'string';
}

export function normalizeAlbumTags(tags?: unknown[]): Tag[] {
  if (!Array.isArray(tags)) {
    return [];
  }

  const normalized: Tag[] = [];

  for (const item of tags) {
    if (isAlbumTagRelation(item) && item.tag && isTag(item.tag)) {
      normalized.push(item.tag);
      continue;
    }

    if (isTag(item)) {
      normalized.push(item);
    }
  }

  return normalized;
}

function isAlbumCategory(value: unknown): value is AlbumCategory {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.slug === 'string'
  );
}

export function normalizeAlbumCategories(categories?: unknown[]): AlbumCategory[] {
  if (!Array.isArray(categories)) {
    return [];
  }

  const normalized: AlbumCategory[] = [];

  for (const item of categories) {
    if (isAlbumCategory(item)) {
      normalized.push({
        ...item,
        depth: typeof item.depth === 'number' ? item.depth : 0,
        source: item.source === 'parent' ? 'parent' : 'manual',
      });
      continue;
    }

    if (item && typeof item === 'object' && 'category' in item) {
      const relation = item as AlbumCategoryRelation;
      if (isAlbumCategory(relation.category)) {
        normalized.push({
          ...relation.category,
          depth: typeof relation.depth === 'number' ? relation.depth : 0,
          source: relation.source === 'parent' ? 'parent' : 'manual',
        });
      }
    }
  }

  return normalized.sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));
}

/**
 * List albums với pagination và filters
 */
export async function listAlbums(
  params?: QueryAlbumsParams,
  options?: { signal?: AbortSignal; admin?: boolean }
): Promise<PaginatedResponse<Album>> {
  const searchParams = new URLSearchParams();

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    });
  }

  const query = searchParams.toString();
  const client = options?.admin ? adminApiClient : apiClient;
  const endpoint = options?.admin ? '/albums/admin' : '/albums';
  return client<PaginatedResponse<Album>>(
    `${endpoint}${query ? `?${query}` : ''}`,
    { signal: options?.signal }
  );
}

/**
 * Get album by slug
 * Reads only — view count is incremented separately via `incrementAlbumView`.
 */
export function adminAlbumBySlugEndpoint(slug: string): string {
  return `/albums/admin/slug/${encodeURIComponent(slug)}`;
}

export async function getAlbum(slug: string, admin = false): Promise<Album> {
  const path = admin ? adminAlbumBySlugEndpoint(slug) : `/albums/${encodeURIComponent(slug)}`;
  return (admin ? adminApiClient : apiClient)<Album>(path);
}

/**
 * Record a single album page view (increments view count by 1).
 * Call once per real page view from the client.
 */
export async function incrementAlbumView(slug: string): Promise<void> {
  await apiClient<void>(`/albums/${encodeURIComponent(slug)}/view`, {
    method: 'POST',
  });
}

/**
 * Get related albums
 */
export async function getRelatedAlbums(slug: string): Promise<Album[]> {
  return apiClient<Album[]>(`/albums/${encodeURIComponent(slug)}/related`);
}

export async function getAlbumDashboardStats(): Promise<AlbumDashboardStats> {
  return adminApiClient<AlbumDashboardStats>('/albums/dashboard/stats');
}

/**
 * Create new album (Admin only)
 */
export async function createAlbum(data: CreateAlbumDto): Promise<Album> {
  return adminApiClient<Album>('/albums', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Update album (Admin only)
 */
export async function updateAlbum(
  id: string,
  data: UpdateAlbumDto
): Promise<Album> {
  return adminApiClient<Album>(`/albums/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Delete album (Admin only)
 */
export async function deleteAlbum(id: string): Promise<void> {
  return adminApiClient<void>(`/albums/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Delete an exact selection of album images atomically (Admin only)
 */
export async function bulkDeleteAlbumImages(
  albumId: string,
  imageIds: string[]
): Promise<Album> {
  return adminApiClient<Album>(`/albums/${albumId}/images/bulk-delete`, {
    method: 'POST',
    body: JSON.stringify({ imageIds }),
  });
}

/**
 * Set cover image (Admin only)
 */
export async function setCoverImage(
  albumId: string,
  imageId: string
): Promise<Album> {
  return adminApiClient<Album>(`/albums/${albumId}/cover`, {
    method: 'PATCH',
    body: JSON.stringify({ imageId }),
  });
}

/**
 * Publish album (Admin only)
 */
export async function publishAlbum(albumId: string): Promise<Album> {
  return adminApiClient<Album>(`/albums/${albumId}/publish`, {
    method: 'PATCH',
  });
}

/**
 * Toggle featured status (Admin only)
 */
export async function toggleFeatured(albumId: string): Promise<Album> {
  return adminApiClient<Album>(`/albums/${albumId}/feature`, {
    method: 'PATCH',
  });
}

// Alias for backward compatibility
export { listAlbums as getAlbums };
