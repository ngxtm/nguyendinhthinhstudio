/**
 * Images API Service
 * Upload flow và image management
 */

import { apiClient, uploadFile } from './client';
import type { Image } from './albums';

export interface UploadUrlResponse {
  uploadUrl: string;
  uploadId: string;
  expiresAt: string;
}

export interface UploadRequestDto {
  albumId: string;
  filename: string;
  fileSize: number;
  contentType: string;
}

/**
 * Upload workflow với accurate progress tracking:
 * 1. Request presigned URL từ backend (0-10%)
 * 2. Upload file trực tiếp lên object storage (10-90%)
 * 3. Gọi backend để confirm và lưu vào DB (90-100%)
 */
export async function uploadImage(
  albumId: string,
  file: File,
  onProgress?: (progress: number) => void
): Promise<void> {
  try {
    // Step 1: Get presigned URL (0-10%)
    onProgress?.(0);
    const uploadRequest: UploadRequestDto = {
      albumId,
      filename: file.name,
      fileSize: file.size,
      contentType: file.type,
    };

    const { uploadUrl, uploadId } = await apiClient<UploadUrlResponse>(
      '/images/upload-url',
      {
        method: 'POST',
        body: JSON.stringify(uploadRequest),
      }
    );

    onProgress?.(10); // URL received

    // Step 2: Upload to object storage (10-90%)
    await uploadFile(uploadUrl, file, (uploadProgress) => {
      // Map storage upload progress (0-100%) to our range (10-90%)
      const mappedProgress = 10 + uploadProgress * 0.8;
      onProgress?.(mappedProgress);
    });

    onProgress?.(90); // Object storage upload complete

    // Step 3: Confirm upload to backend (90-100%)
    await apiClient('/images/confirm-upload', {
      method: 'POST',
      body: JSON.stringify({ uploadId }),
    });

    onProgress?.(100); // Fully complete
  } catch (error: any) {
    console.error('Upload failed:', error);
    throw new Error(error.message || 'Upload thất bại');
  }
}

/**
 * Upload multiple images
 */
export async function uploadMultipleImages(
  albumId: string,
  files: File[],
  onProgress?: (fileIndex: number, progress: number) => void
): Promise<void> {
  for (let i = 0; i < files.length; i++) {
    await uploadImage(
      albumId,
      files[i],
      (progress) => onProgress?.(i, progress)
    );
  }
}

/**
 * Get images for album
 */
export async function getAlbumImages(albumId: string): Promise<Image[]> {
  return apiClient<Image[]>(`/images/album/${albumId}`);
}

/**
 * Update image metadata (Admin only)
 */
export async function updateImage(
  imageId: string,
  data: { altText?: string; filename?: string }
): Promise<Image> {
  return apiClient<Image>(`/images/${imageId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Delete image (Admin only)
 */
export async function deleteImage(imageId: string): Promise<void> {
  return apiClient<void>(`/images/${imageId}`, {
    method: 'DELETE',
  });
}

/**
 * Reorder images (Admin only)
 */
export async function reorderImages(
  albumId: string,
  imageIds: string[]
): Promise<void> {
  return apiClient<void>(`/images/album/${albumId}/reorder`, {
    method: 'PATCH',
    body: JSON.stringify({ imageIds }),
  });
}
