import { WEBP_QUALITY } from './upload-constants'
import { canvasToBlobOnce } from './optimizer.worker'
import type { UploadCapability } from './types'

export type CapabilityProbeEnvironment = Partial<{
  hasCreateImageBitmap: boolean
  hasOffscreenCanvas: boolean
  hasDocumentCanvas: boolean
  encodeWebp: () => Promise<Blob>
}>

function abortError(): Error {
  return Object.assign(new Error('Capability probe aborted'), {
    name: 'AbortError'
  })
}

function canCreateDomCanvas(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function'
}

async function probeBrowserWebp(canUseOffscreen: boolean, canUseDomCanvas: boolean): Promise<Blob> {
  if (canUseOffscreen && typeof OffscreenCanvas !== 'undefined') {
    try {
      const canvas = new OffscreenCanvas(1, 1)
      return await canvas.convertToBlob({
        type: 'image/webp',
        quality: WEBP_QUALITY
      })
    } catch {
      // A DOM canvas can still provide the required encode path.
    }
  }

  if (canUseDomCanvas && canCreateDomCanvas()) {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    if (!canvas.getContext('2d')) {
      throw new Error('canvas context unavailable')
    }
    return canvasToBlobOnce(canvas)
  }

  throw new Error('canvas unavailable')
}

export async function probeUploadCapability(
  signal?: AbortSignal,
  environment?: CapabilityProbeEnvironment
): Promise<UploadCapability> {
  if (signal?.aborted) throw abortError()

  const hasCreateImageBitmap = environment?.hasCreateImageBitmap ?? typeof globalThis.createImageBitmap === 'function'
  if (!hasCreateImageBitmap) {
    return { outcome: 'unsupported', code: 'image_decoder_unavailable' }
  }

  const hasOffscreenCanvas = environment?.hasOffscreenCanvas ?? typeof OffscreenCanvas !== 'undefined'
  const hasDocumentCanvas = environment?.hasDocumentCanvas ?? canCreateDomCanvas()
  if (!hasOffscreenCanvas && !hasDocumentCanvas) {
    return { outcome: 'unsupported', code: 'canvas_unavailable' }
  }

  try {
    const blob = environment?.encodeWebp
      ? await environment.encodeWebp()
      : await probeBrowserWebp(hasOffscreenCanvas, hasDocumentCanvas)
    if (signal?.aborted) throw abortError()
    if (blob.type !== 'image/webp' || blob.size === 0) {
      return { outcome: 'unsupported', code: 'webp_encode_unavailable' }
    }
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error
    return { outcome: 'unsupported', code: 'webp_encode_unavailable' }
  }

  return { outcome: 'supported' }
}
