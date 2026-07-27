/**
 * Images API Service
 * Upload flow và image management
 */

import { ApiError, adminApiClient, apiClient, uploadFile } from './client'
import type { Image } from './albums'
import type {
  AbandonResponse,
  ConfirmResponse,
  PresignResponse,
  UploadPresignRequest,
  UploadSessionStatusResponse
} from '@ndt/types'
import { probeUploadCapability } from '../image-upload/capability-probe'
import { optimizeImage } from '../image-upload/optimizer'
import type { OptimizedImage, UploadCapability } from '../image-upload/types'

export class UploadApiError extends Error {
  constructor(
    readonly code: string,
    readonly retryAfter?: string
  ) {
    super(code)
    this.name = 'UploadApiError'
  }
}

function assertOutcome<T extends { outcome?: unknown }>(value: unknown, allowed: readonly string[]): T {
  if (!value || typeof value !== 'object' || !allowed.includes(String((value as { outcome?: unknown }).outcome))) {
    throw new UploadApiError('unexpected_upload_response')
  }
  return value as T
}

export function asUploadApiError(error: unknown): never {
  if (error instanceof ApiError && error.data && typeof error.data === 'object') {
    const payload = error.data as { code?: unknown; retryAfter?: unknown }
    if (error.status === 429 && payload.code === 'upload_rate_limited' && typeof payload.retryAfter === 'string') {
      throw new UploadApiError('upload_rate_limited', payload.retryAfter)
    }
  }
  throw error
}

export async function requestUploadUrl(request: UploadPresignRequest): Promise<PresignResponse> {
  try {
    const response = await adminApiClient<unknown>('/images/upload-url', {
      method: 'POST',
      body: JSON.stringify(request)
    })
    return assertOutcome<PresignResponse>(response, [
      'ready',
      'finalizing',
      'consumed',
      'failed',
      'gone',
      'deleted',
      'unavailable'
    ])
  } catch (error) {
    return asUploadApiError(error)
  }
}

export async function confirmImageUpload(uploadId: string): Promise<ConfirmResponse> {
  return assertOutcome<ConfirmResponse>(
    await adminApiClient<unknown>('/images/confirm-upload', {
      method: 'POST',
      body: JSON.stringify({ uploadId })
    }),
    ['finalizing', 'consumed', 'failed', 'gone', 'deleted', 'unavailable', 'retryable']
  )
}

export async function getUploadStatus(uploadId: string): Promise<UploadSessionStatusResponse> {
  return assertOutcome<UploadSessionStatusResponse>(
    await adminApiClient<unknown>(`/images/upload-sessions/${encodeURIComponent(uploadId)}`),
    ['pending', 'finalizing', 'consumed', 'failed', 'gone', 'deleted', 'unavailable']
  )
}

export async function abandonImageUpload(uploadId: string): Promise<AbandonResponse> {
  return assertOutcome<AbandonResponse>(
    await adminApiClient<unknown>(`/images/upload-sessions/${encodeURIComponent(uploadId)}/abandon`, {
      method: 'POST'
    }),
    ['abandoned', 'finalizing', 'consumed', 'failed', 'gone', 'deleted', 'unavailable']
  )
}

export function createClientRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export type AdminImageUploadDependencies = {
  probeCapability(signal?: AbortSignal): Promise<UploadCapability>
  optimize(file: File, signal?: AbortSignal): Promise<OptimizedImage>
  createClientRequestId(): string
  presign(input: UploadPresignRequest): Promise<PresignResponse>
  put(url: string, blob: Blob, onProgress: (progress: number) => void, signal?: AbortSignal): Promise<void>
  confirm(uploadId: string): Promise<ConfirmResponse>
  status(uploadId: string): Promise<UploadSessionStatusResponse>
  abandon(uploadId: string): Promise<AbandonResponse>
}

const browserUploadDependencies: AdminImageUploadDependencies = {
  probeCapability: probeUploadCapability,
  optimize: (file, signal) => optimizeImage(file, {}, signal),
  createClientRequestId,
  presign: requestUploadUrl,
  put: (url, blob, onProgress) => uploadFile(url, blob, onProgress),
  confirm: confirmImageUpload,
  status: getUploadStatus,
  abandon: abandonImageUpload
}

function failureCode(
  response: Exclude<
    PresignResponse | ConfirmResponse | UploadSessionStatusResponse,
    { outcome: 'ready' | 'pending' | 'finalizing' | 'retryable' | 'consumed' }
  >
): string {
  return response.outcome === 'failed' ? response.failureCode : response.code
}

async function waitUntilConsumed(
  initial: ConfirmResponse | UploadSessionStatusResponse,
  uploadId: string,
  dependencies: AdminImageUploadDependencies
): Promise<void> {
  let response = initial

  for (;;) {
    if (response.outcome === 'consumed') return
    if (
      response.outcome === 'failed' ||
      response.outcome === 'gone' ||
      response.outcome === 'deleted' ||
      response.outcome === 'unavailable'
    ) {
      throw new UploadApiError(failureCode(response))
    }

    if (response.outcome === 'pending') {
      response = await dependencies.confirm(uploadId)
      continue
    }

    const delay = Math.max(0, new Date(response.retryAfter).getTime() - Date.now())
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay))
    }
    response = await dependencies.status(uploadId)
  }
}

export async function runAdminImageUpload(
  albumId: string,
  file: File,
  onProgress: ((progress: number) => void) | undefined,
  dependencies: AdminImageUploadDependencies = browserUploadDependencies
): Promise<void> {
  const controller = new AbortController()
  const capability = await dependencies.probeCapability(controller.signal)
  if (capability.outcome !== 'supported') {
    throw new UploadApiError(capability.code)
  }

  onProgress?.(0)
  const optimized = await dependencies.optimize(file, controller.signal)
  const clientRequestId = dependencies.createClientRequestId()
  let uploadId: string | undefined
  let consumed = false

  try {
    const presign = await dependencies.presign({
      clientRequestId,
      albumId,
      filename: optimized.filename,
      contentType: 'image/webp',
      fileSize: optimized.fileSize,
      processedSha256: optimized.processedSha256
    })
    uploadId = presign.uploadId

    if (presign.outcome === 'consumed') {
      consumed = true
      onProgress?.(100)
      return
    }
    if (
      presign.outcome === 'failed' ||
      presign.outcome === 'gone' ||
      presign.outcome === 'deleted' ||
      presign.outcome === 'unavailable'
    ) {
      throw new UploadApiError(failureCode(presign))
    }

    if (presign.outcome === 'ready') {
      onProgress?.(10)
      await dependencies.put(
        presign.uploadUrl,
        optimized.blob,
        progress => onProgress?.(10 + progress * 0.8),
        controller.signal
      )
      onProgress?.(90)
      await waitUntilConsumed(await dependencies.confirm(uploadId), uploadId, dependencies)
    } else {
      onProgress?.(90)
      await waitUntilConsumed(presign, uploadId, dependencies)
    }

    consumed = true
    onProgress?.(100)
  } catch (error) {
    if (uploadId && !consumed) {
      await dependencies.abandon(uploadId).catch(() => undefined)
    }
    throw error
  }
}

/**
 * Upload workflow với accurate progress tracking:
 * 1. Browser nén sang WebP (0-10%)
 * 2. Upload trực tiếp lên object storage (10-90%)
 * 3. Gọi backend để confirm và lưu vào DB (90-100%)
 */
export function uploadImage(albumId: string, file: File, onProgress?: (progress: number) => void): Promise<void> {
  return runAdminImageUpload(albumId, file, onProgress)
}

export async function uploadMultipleImages(
  albumId: string,
  files: File[],
  onProgress?: (fileIndex: number, progress: number) => void
): Promise<void> {
  for (let i = 0; i < files.length; i += 1) {
    await uploadImage(albumId, files[i], progress => onProgress?.(i, progress))
  }
}

export async function getAlbumImages(albumId: string): Promise<Image[]> {
  return apiClient<Image[]>(`/images/album/${albumId}`)
}

export async function updateImage(imageId: string, data: { altText?: string; filename?: string }): Promise<Image> {
  return adminApiClient<Image>(`/images/${imageId}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  })
}

export async function deleteImage(imageId: string): Promise<void> {
  return adminApiClient<void>(`/images/${imageId}`, {
    method: 'DELETE'
  })
}

export async function reorderImages(albumId: string, imageIds: string[]): Promise<void> {
  return adminApiClient<void>(`/images/album/${albumId}/reorder`, {
    method: 'PATCH',
    body: JSON.stringify({ imageIds })
  })
}
