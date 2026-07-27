import { Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import sharp from 'sharp'

export const MAX_STORED_IMAGE_BYTES = 5 * 1024 * 1024
export const STORED_IMAGE_MIME = 'image/webp' as const

export type StoredImageFacts = {
  mime: typeof STORED_IMAGE_MIME
  width: number
  height: number
}

export type StoredImageInspection = {
  digestSha256: string
  byteSize: number
  facts: StoredImageFacts
}

export class StoredImageInspectionError extends Error {
  constructor(readonly code: 'upload_decode_failed') {
    super(code)
    this.name = 'StoredImageInspectionError'
  }
}

function abortError(): Error {
  return Object.assign(new Error('Image inspection aborted'), {
    name: 'AbortError',
  })
}

@Injectable()
export class StoredImageInspectorService {
  async inspect(
    bytes: Uint8Array,
    signal?: AbortSignal,
  ): Promise<StoredImageInspection> {
    if (bytes.byteLength > MAX_STORED_IMAGE_BYTES) {
      throw new StoredImageInspectionError('upload_decode_failed')
    }
    if (signal?.aborted) throw abortError()

    try {
      const metadata = await sharp(bytes, { failOn: 'error' }).metadata()
      if (metadata.format !== 'webp') {
        throw new StoredImageInspectionError('upload_decode_failed')
      }

      const decoded = await sharp(bytes, { failOn: 'error' })
        .raw()
        .toBuffer({ resolveWithObject: true })
      if (signal?.aborted) throw abortError()
      if (!decoded.info.width || !decoded.info.height) {
        throw new StoredImageInspectionError('upload_decode_failed')
      }

      return {
        digestSha256: createHash('sha256').update(bytes).digest('hex'),
        byteSize: bytes.byteLength,
        facts: {
          mime: STORED_IMAGE_MIME,
          width: decoded.info.width,
          height: decoded.info.height,
        },
      }
    } catch (error) {
      if (
        error instanceof StoredImageInspectionError ||
        (error as Error)?.name === 'AbortError'
      ) {
        throw error
      }
      throw new StoredImageInspectionError('upload_decode_failed')
    }
  }
}
