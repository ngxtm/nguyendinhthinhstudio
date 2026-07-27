import {
  ACCEPTED_SOURCE_MIME_TYPES,
  MAX_OUTPUT_BYTES,
  MAX_OUTPUT_EDGE,
  MAX_SOURCE_BYTES,
  type AcceptedSourceMime
} from './upload-constants'
import { ImageEncoderError, canvasToBlobOnce, encodeWebpOnce } from './optimizer.worker'
import type { OptimizedImage } from './types'

export class ImageOptimizationError extends Error {
  constructor(
    readonly code: string,
    options?: ErrorOptions
  ) {
    super(code, options)
    this.name = 'ImageOptimizationError'
  }
}

type DecodedSource = {
  image: CanvasImageSource
  width: number
  height: number
  close: () => void
}

type DrawingSurface = {
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void
  encode(signal?: AbortSignal): Promise<Blob>
}

export type OptimizerEnvironment = Partial<{
  decode(file: File, signal?: AbortSignal): Promise<DecodedSource>
  createSurface(width: number, height: number): Pick<DrawingSurface, 'drawImage'>
  encode(surface: Pick<DrawingSurface, 'drawImage'>, signal?: AbortSignal): Promise<Blob>
}>

function abortError(message: string): Error {
  return Object.assign(new Error(message), { name: 'AbortError' })
}

function isAcceptedSourceMime(value: string): value is AcceptedSourceMime {
  return (ACCEPTED_SOURCE_MIME_TYPES as readonly string[]).includes(value)
}

async function digest(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const result = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export function computeTargetDimensions(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_OUTPUT_EDGE / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  }
}

async function decodeWithBrowser(file: File, signal?: AbortSignal): Promise<DecodedSource> {
  if (typeof globalThis.createImageBitmap !== 'function') {
    throw new ImageOptimizationError('image_decoder_unavailable')
  }
  if (signal?.aborted) throw abortError('Optimization aborted')

  try {
    const image = await globalThis.createImageBitmap(file, {
      imageOrientation: 'from-image',
      colorSpaceConversion: 'default'
    })
    if (signal?.aborted) {
      image.close()
      throw abortError('Optimization aborted')
    }
    return {
      image,
      width: image.width,
      height: image.height,
      close: () => image.close()
    }
  } catch (error) {
    if (error instanceof ImageOptimizationError || (error as Error)?.name === 'AbortError') {
      throw error
    }
    throw new ImageOptimizationError('image_decode_failed', { cause: error })
  }
}

function createBrowserSurface(width: number, height: number): DrawingSurface {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    if (!context) throw new ImageOptimizationError('canvas_unavailable')
    return {
      drawImage: (image, dx, dy, dw, dh) => context.drawImage(image, dx, dy, dw, dh),
      encode: signal => encodeWebpOnce(canvas, signal)
    }
  }

  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    throw new ImageOptimizationError('canvas_unavailable')
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new ImageOptimizationError('canvas_unavailable')
  return {
    drawImage: (image, dx, dy, dw, dh) => context.drawImage(image, dx, dy, dw, dh),
    encode: signal => canvasToBlobOnce(canvas, signal)
  }
}

function assertOutput(blob: Blob): Blob {
  if (blob.type !== 'image/webp' || blob.size === 0) {
    throw new ImageOptimizationError('image_encode_failed')
  }
  if (blob.size > MAX_OUTPUT_BYTES) {
    throw new ImageOptimizationError('image_output_bytes_exceeded')
  }
  return blob
}

function outputFilename(filename: string): string {
  const normalizedFilename = filename.normalize('NFC')
  const basename = normalizedFilename.replace(/\.[^.]+$/, '')
  return `${basename || normalizedFilename}.webp`
}

export async function optimizeImage(
  file: File,
  environment: OptimizerEnvironment = {},
  signal?: AbortSignal
): Promise<OptimizedImage> {
  if (signal?.aborted) throw abortError('Optimization aborted')
  if (!isAcceptedSourceMime(file.type)) {
    throw new ImageOptimizationError('image_source_unsupported')
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new ImageOptimizationError('image_source_bytes_exceeded')
  }

  let decoded: DecodedSource | undefined
  try {
    try {
      decoded = environment.decode ? await environment.decode(file, signal) : await decodeWithBrowser(file, signal)
    } catch (error) {
      if (error instanceof ImageOptimizationError || (error as Error)?.name === 'AbortError') {
        throw error
      }
      throw new ImageOptimizationError('image_decode_failed', { cause: error })
    }
    if (decoded.width <= 0 || decoded.height <= 0) {
      throw new ImageOptimizationError('image_decode_failed')
    }
    if (signal?.aborted) throw abortError('Optimization aborted')

    const target = computeTargetDimensions(decoded.width, decoded.height)
    const surface = environment.createSurface
      ? environment.createSurface(target.width, target.height)
      : createBrowserSurface(target.width, target.height)
    surface.drawImage(decoded.image, 0, 0, target.width, target.height)

    let output: Blob
    try {
      output = environment.encode
        ? await environment.encode(surface, signal)
        : await (surface as DrawingSurface).encode(signal)
    } catch (error) {
      if (
        error instanceof ImageOptimizationError ||
        error instanceof ImageEncoderError ||
        (error as Error)?.name === 'AbortError'
      ) {
        throw error
      }
      throw new ImageOptimizationError('image_encode_failed', { cause: error })
    }

    output = assertOutput(output)
    return {
      blob: output,
      filename: outputFilename(file.name),
      contentType: 'image/webp',
      fileSize: output.size,
      processedSha256: await digest(output),
      width: target.width,
      height: target.height
    }
  } finally {
    decoded?.close()
  }
}
