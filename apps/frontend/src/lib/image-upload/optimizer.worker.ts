import { MAX_OUTPUT_BYTES, WEBP_QUALITY } from './upload-constants'

export class ImageEncoderError extends Error {
  constructor(
    readonly code: 'image_encode_failed' | 'image_output_bytes_exceeded',
    options?: ErrorOptions
  ) {
    super(code, options)
    this.name = 'ImageEncoderError'
  }
}

type OffscreenSurface = {
  convertToBlob(options: { type: 'image/webp'; quality: number }): Promise<Blob>
}

type DomCanvasSurface = {
  toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number): void
}

function abortError(): Error {
  return Object.assign(new Error('Encode aborted'), { name: 'AbortError' })
}

function assertEncodedWebp(blob: Blob): Blob {
  if (blob.type !== 'image/webp' || blob.size === 0) {
    throw new ImageEncoderError('image_encode_failed')
  }
  if (blob.size > MAX_OUTPUT_BYTES) {
    throw new ImageEncoderError('image_output_bytes_exceeded')
  }
  return blob
}

export async function encodeWebpOnce(surface: OffscreenSurface, signal?: AbortSignal): Promise<Blob> {
  if (signal?.aborted) throw abortError()

  try {
    const blob = await surface.convertToBlob({
      type: 'image/webp',
      quality: WEBP_QUALITY
    })
    if (signal?.aborted) throw abortError()
    return assertEncodedWebp(blob)
  } catch (error) {
    if (error instanceof ImageEncoderError || (error as Error)?.name === 'AbortError') {
      throw error
    }
    throw new ImageEncoderError('image_encode_failed', { cause: error })
  }
}

export function canvasToBlobOnce(canvas: DomCanvasSurface, signal?: AbortSignal): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }

    try {
      canvas.toBlob(
        blob => {
          if (signal?.aborted) {
            reject(abortError())
            return
          }
          if (!blob) {
            reject(new ImageEncoderError('image_encode_failed'))
            return
          }
          try {
            resolve(assertEncodedWebp(blob))
          } catch (error) {
            reject(error)
          }
        },
        'image/webp',
        WEBP_QUALITY
      )
    } catch (error) {
      reject(new ImageEncoderError('image_encode_failed', { cause: error }))
    }
  })
}
