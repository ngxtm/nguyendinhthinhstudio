import {
  classifySource,
  createImageUploadPolicyVersion,
  preflightImage,
  validateStored,
  type ImageUploadPolicy
} from '@ndt/image-upload-policy'
import type { UploadCapability, OptimizedImage } from './types'
import type { ImageResourceRegistry } from './resource-registry'
import { encodeWebpOnce } from './optimizer.worker'

export class ImageOptimizationError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

async function* chunks(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  yield bytes
}
async function digest(bytes: Uint8Array): Promise<string> {
  const result = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export type OptimizerEnvironment = {
  normalize?: (
    file: File,
    width: number,
    height: number,
    policy: ImageUploadPolicy,
    signal?: AbortSignal
  ) => Promise<{ blob: Blob; width: number; height: number }>
}

export function computeTargetDimensions(
  sourceWidth: number,
  sourceHeight: number,
  policy: ImageUploadPolicy
): { width: number; height: number } {
  const scale = Math.min(
    1,
    policy.maxWidth / sourceWidth,
    policy.maxHeight / sourceHeight,
    Math.sqrt(policy.maxDecodedPixels / (sourceWidth * sourceHeight))
  )
  return {
    width: Math.max(1, Math.floor(sourceWidth * scale)),
    height: Math.max(1, Math.floor(sourceHeight * scale))
  }
}

export async function optimizeImage(
  file: File,
  policy: ImageUploadPolicy,
  capability: Extract<UploadCapability, { outcome: 'supported' }>,
  registry: ImageResourceRegistry,
  signal?: AbortSignal,
  environment: OptimizerEnvironment = {}
): Promise<OptimizedImage> {
  if (signal?.aborted) throw Object.assign(new Error('Optimization aborted'), { name: 'AbortError' })
  if (file.size > policy.maxSourceBytes) throw new ImageOptimizationError('image_source_bytes_exceeded')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const preflight = await preflightImage(chunks(bytes), policy, signal)
  if (preflight.outcome === 'rejected') throw new ImageOptimizationError(preflight.code)
  const classified = await classifySource(chunks(bytes), policy, signal)
  if (classified.outcome === 'rejected') throw new ImageOptimizationError(classified.code)
  const passThrough =
    file.size <= policy.softTargetBytes && classified.outcome === 'allowed' && file.type === classified.facts.mime
  if (passThrough) {
    const stored = await validateStored(chunks(bytes), policy, signal)
    if (stored.outcome !== 'allowed')
      throw new ImageOptimizationError(stored.outcome === 'rejected' ? stored.code : 'image_metadata_not_allowed')
    return {
      blob: file,
      filename: file.name,
      contentType: classified.facts.mime,
      fileSize: bytes.byteLength,
      processedSha256: await digest(bytes),
      width: classified.facts.width,
      height: classified.facts.height,
      policyVersion: createImageUploadPolicyVersion(policy),
      disposition: 'passed-through'
    }
  }
  const { width, height } = computeTargetDimensions(preflight.facts.width, preflight.facts.height, policy)
  const normalized = environment.normalize
    ? await environment.normalize(file, width, height, policy, signal)
    : await normalizeWithCanvas(
        file,
        classified.facts.mime,
        width,
        height,
        preflight.facts.width * preflight.facts.height,
        policy,
        registry,
        signal,
        capability
      )
  const outputBytes = new Uint8Array(await normalized.blob.arrayBuffer())
  const stored = await validateStored(chunks(outputBytes), policy, signal)
  if (stored.outcome !== 'allowed')
    throw new ImageOptimizationError(stored.outcome === 'rejected' ? stored.code : 'image_metadata_not_allowed')
  return {
    blob: normalized.blob,
    filename: file.name.replace(/\.[^.]+$/, '') + '.webp',
    contentType: 'image/webp',
    fileSize: outputBytes.byteLength,
    processedSha256: await digest(outputBytes),
    width: normalized.width,
    height: normalized.height,
    policyVersion: createImageUploadPolicyVersion(policy),
    disposition: 'normalized'
  }
}

async function normalizeWithCanvas(
  file: File,
  sourceMime: 'image/jpeg' | 'image/png' | 'image/webp',
  width: number,
  height: number,
  sourcePixels: number,
  policy: ImageUploadPolicy,
  registry: ImageResourceRegistry,
  signal: AbortSignal | undefined,
  capability: Extract<UploadCapability, { outcome: 'supported' }>
) {
  if (typeof OffscreenCanvas === 'undefined') throw new ImageOptimizationError('srgb_output_unproven')
  const sourceLease = registry.reserve(file.name, 'image-bitmap')
  const canvasLease = registry.reserve(file.name, 'canvas')
  let closeSource: (() => void) | undefined
  let closeDecoder: (() => void) | undefined
  try {
    let decoded: CanvasImageSource
    if (sourcePixels > policy.maxDecodedPixels) {
      const Decoder = (globalThis as any).ImageDecoder
      if (typeof Decoder !== 'function' || !capability.targetSizeDecode) {
        throw new ImageOptimizationError('image_decoder_unavailable')
      }
      const decoder = new Decoder({
        data: file.stream(),
        type: sourceMime,
        preferAnimation: false,
        desiredWidth: width,
        desiredHeight: height
      })
      closeDecoder = () => decoder.close()
      const result = await decoder.decode({
        frameIndex: 0,
        completeFramesOnly: true
      })
      const frame = result.image as VideoFrame
      if (
        frame.displayWidth <= 0 ||
        frame.displayHeight <= 0 ||
        frame.displayWidth > width ||
        frame.displayHeight > height ||
        frame.displayWidth * frame.displayHeight > policy.maxDecodedPixels
      ) {
        frame.close()
        throw new ImageOptimizationError('image_decoder_unavailable')
      }
      decoded = frame
      closeSource = () => frame.close()
    } else {
      if (typeof createImageBitmap !== 'function') {
        throw new ImageOptimizationError('image_decoder_unavailable')
      }
      const bitmap = await createImageBitmap(file, {
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: 'high'
      })
      decoded = bitmap
      closeSource = () => bitmap.close()
    }
    if (signal?.aborted) throw Object.assign(new Error('Optimization aborted'), { name: 'AbortError' })
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d', { colorSpace: 'srgb' } as any)
    if (!context) throw new ImageOptimizationError('srgb_output_unproven')
    context.drawImage(decoded, 0, 0, width, height)
    return { blob: await encodeWebpOnce(canvas as any, policy, signal), width, height }
  } finally {
    closeSource?.()
    closeDecoder?.()
    registry.release(canvasLease)
    registry.release(sourceLease)
  }
}
