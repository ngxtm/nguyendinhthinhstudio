/**
 * Images API Service
 * Upload flow và image management
 */

import { apiClient, adminApiClient, uploadFile } from './client';
import type { Image } from './albums';
import type { ImageUploadPolicy } from '@ndt/image-upload-policy';
import type { ConfirmResponse, PolicyResponse, PresignResponse, UploadPresignRequest, UploadSessionStatusResponse, AbandonResponse } from '@ndt/types';
import { probeUploadCapability } from '../image-upload/capability-probe';
import { optimizeImage } from '../image-upload/optimizer';
import { BoundedImageResourceRegistry, type ImageResourceRegistry } from '../image-upload/resource-registry';
import type { OptimizedImage, UploadCapability } from '../image-upload/types';

export class UploadApiError extends Error {
  constructor(readonly code: string, readonly retryAfter?: string) { super(code); }
}

function assertOutcome<T extends { outcome?: unknown }>(value: unknown, allowed: readonly string[]): T {
  if (!value || typeof value !== 'object' || !allowed.includes(String((value as any).outcome))) throw new UploadApiError('unexpected_upload_response');
  return value as T;
}

export async function loadUploadPolicy(): Promise<PolicyResponse> {
  const response = await adminApiClient<unknown>('/images/upload-policy');
  const value = response as any;
  if (!value || typeof value.policyVersion !== 'string' || !value.policy) throw new UploadApiError('unexpected_upload_response');
  return value as PolicyResponse;
}

export async function requestUploadUrl(request: UploadPresignRequest): Promise<PresignResponse> {
  const response = await adminApiClient<unknown>('/images/upload-url', { method: 'POST', body: JSON.stringify(request) });
  return assertOutcome<PresignResponse>(response, ['ready', 'finalizing', 'consumed', 'failed', 'gone', 'deleted', 'unavailable']);
}

export async function confirmImageUpload(uploadId: string): Promise<ConfirmResponse> {
  return assertOutcome<ConfirmResponse>(await adminApiClient<unknown>('/images/confirm-upload', { method: 'POST', body: JSON.stringify({ uploadId }) }), ['finalizing', 'consumed', 'failed', 'gone', 'deleted', 'unavailable', 'retryable']);
}

export async function getUploadStatus(uploadId: string): Promise<UploadSessionStatusResponse> {
  return assertOutcome<UploadSessionStatusResponse>(await adminApiClient<unknown>(`/images/upload-sessions/${encodeURIComponent(uploadId)}`), ['pending', 'finalizing', 'consumed', 'failed', 'gone', 'deleted', 'unavailable']);
}

export async function abandonImageUpload(uploadId: string): Promise<AbandonResponse> {
  return assertOutcome<AbandonResponse>(await adminApiClient<unknown>(`/images/upload-sessions/${encodeURIComponent(uploadId)}/abandon`, { method: 'POST' }), ['abandoned', 'finalizing', 'consumed', 'failed', 'gone', 'deleted', 'unavailable']);
}

export function createClientRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export type CurrentPolicyUploadDependencies = {
  loadPolicy(): Promise<PolicyResponse>;
  probeCapability(
    policy: ImageUploadPolicy,
    signal?: AbortSignal,
  ): Promise<UploadCapability>;
  createRegistry(): ImageResourceRegistry;
  optimize(
    file: File,
    policy: ImageUploadPolicy,
    capability: Extract<UploadCapability, { outcome: 'supported' }>,
    registry: ImageResourceRegistry,
    signal?: AbortSignal,
  ): Promise<OptimizedImage>;
  createClientRequestId(): string;
  presign(input: UploadPresignRequest): Promise<PresignResponse>;
  put(
    url: string,
    blob: Blob,
    onProgress: (progress: number) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  confirm(uploadId: string): Promise<ConfirmResponse>;
  status(uploadId: string): Promise<UploadSessionStatusResponse>;
  abandon(uploadId: string): Promise<AbandonResponse>;
};

const browserUploadDependencies: CurrentPolicyUploadDependencies = {
  loadPolicy: loadUploadPolicy,
  probeCapability: probeUploadCapability,
  createRegistry: () => new BoundedImageResourceRegistry(),
  optimize: optimizeImage,
  createClientRequestId,
  presign: requestUploadUrl,
  put: (url, blob, onProgress) => uploadFile(url, blob, onProgress),
  confirm: confirmImageUpload,
  status: getUploadStatus,
  abandon: abandonImageUpload,
};

function failureCode(
  response: Exclude<
    PresignResponse | ConfirmResponse | UploadSessionStatusResponse,
    { outcome: 'ready' | 'pending' | 'finalizing' | 'retryable' | 'consumed' }
  >,
): string {
  return response.outcome === 'failed' ? response.failureCode : response.code;
}

async function waitUntilConsumed(
  initial: ConfirmResponse | UploadSessionStatusResponse,
  uploadId: string,
  dependencies: CurrentPolicyUploadDependencies,
): Promise<void> {
  let response = initial;

  for (;;) {
    if (response.outcome === 'consumed') return;
    if (
      response.outcome === 'failed' ||
      response.outcome === 'gone' ||
      response.outcome === 'deleted' ||
      response.outcome === 'unavailable'
    ) {
      throw new UploadApiError(failureCode(response));
    }

    if (response.outcome === 'pending') {
      response = await dependencies.confirm(uploadId);
      continue;
    }

    const delay = Math.max(0, new Date(response.retryAfter).getTime() - Date.now());
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    response = await dependencies.status(uploadId);
  }
}

export async function runCurrentPolicyUpload(
  albumId: string,
  file: File,
  onProgress: ((progress: number) => void) | undefined,
  dependencies: CurrentPolicyUploadDependencies = browserUploadDependencies,
): Promise<void> {
  const controller = new AbortController();
  const { policy } = await dependencies.loadPolicy();
  const capability = await dependencies.probeCapability(policy, controller.signal);
  if (capability.outcome !== 'supported') {
    throw new UploadApiError(capability.code);
  }

  onProgress?.(0);
  const registry = dependencies.createRegistry();
  const optimized = await dependencies.optimize(
    file,
    policy,
    capability,
    registry,
    controller.signal,
  );
  const clientRequestId = dependencies.createClientRequestId();
  const outputLease = registry.reserve(clientRequestId, 'output-blob');
  let uploadId: string | undefined;
  let consumed = false;

  try {
    const presign = await dependencies.presign({
      clientRequestId,
      albumId,
      filename: optimized.filename,
      contentType: optimized.contentType,
      fileSize: optimized.fileSize,
      processedSha256: optimized.processedSha256,
      policyVersion: optimized.policyVersion,
    });
    uploadId = presign.uploadId;

    if (presign.outcome === 'consumed') {
      consumed = true;
      onProgress?.(100);
      return;
    }
    if (
      presign.outcome === 'failed' ||
      presign.outcome === 'gone' ||
      presign.outcome === 'deleted' ||
      presign.outcome === 'unavailable'
    ) {
      throw new UploadApiError(failureCode(presign));
    }

    if (presign.outcome === 'ready') {
      onProgress?.(10);
      await dependencies.put(
        presign.uploadUrl,
        optimized.blob,
        (progress) => onProgress?.(10 + progress * 0.8),
        controller.signal,
      );
      onProgress?.(90);
      await waitUntilConsumed(
        await dependencies.confirm(uploadId),
        uploadId,
        dependencies,
      );
    } else {
      onProgress?.(90);
      await waitUntilConsumed(presign, uploadId, dependencies);
    }

    consumed = true;
    onProgress?.(100);
  } catch (error) {
    if (uploadId && !consumed) {
      await dependencies.abandon(uploadId).catch(() => undefined);
    }
    throw error;
  } finally {
    registry.release(outputLease);
  }
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
    await runCurrentPolicyUpload(albumId, file, onProgress);
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
  return adminApiClient<Image>(`/images/${imageId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Delete image (Admin only)
 */
export async function deleteImage(imageId: string): Promise<void> {
  return adminApiClient<void>(`/images/${imageId}`, {
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
  return adminApiClient<void>(`/images/album/${albumId}/reorder`, {
    method: 'PATCH',
    body: JSON.stringify({ imageIds }),
  });
}
