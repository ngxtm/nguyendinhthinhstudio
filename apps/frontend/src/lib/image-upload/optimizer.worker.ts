import { validateStored, type ImageUploadPolicy } from '@ndt/image-upload-policy'

export class ImageEncoderError extends Error {
  constructor(
    readonly code: 'image_encode_failed' | 'image_bad_length' | 'image_unsupported_format',
    options?: ErrorOptions
  ) {
    super(code, options)
  }
}

async function* blobChunks(blob: Blob): AsyncIterable<Uint8Array> {
  yield new Uint8Array(await blob.arrayBuffer())
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

function readU32Le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
}

function writeU32Le(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff
  bytes[offset + 1] = (value >>> 8) & 0xff
  bytes[offset + 2] = (value >>> 16) & 0xff
  bytes[offset + 3] = (value >>> 24) & 0xff
}

export async function stripWebpOptionalMetadata(blob: Blob): Promise<Blob> {
  const source = new Uint8Array(await blob.arrayBuffer())
  if (
    source.byteLength < 12 ||
    ascii(source, 0, 4) !== 'RIFF' ||
    ascii(source, 8, 4) !== 'WEBP' ||
    readU32Le(source, 4) + 8 !== source.byteLength
  ) {
    throw new ImageEncoderError('image_encode_failed')
  }
  const chunks: Uint8Array[] = []
  let removed = false
  for (let offset = 12; offset < source.byteLength; ) {
    if (source.byteLength - offset < 8) {
      throw new ImageEncoderError('image_encode_failed')
    }
    const type = ascii(source, offset, 4)
    const length = readU32Le(source, offset + 4)
    const end = offset + 8 + length + (length & 1)
    if (end > source.byteLength) {
      throw new ImageEncoderError('image_encode_failed')
    }
    if (type === 'ICCP' || type === 'EXIF' || type === 'XMP ') {
      removed = true
    } else {
      const chunk = source.slice(offset, end)
      if (type === 'VP8X') {
        if (length !== 10) throw new ImageEncoderError('image_encode_failed')
        const metadataFlags = 0x20 | 0x08 | 0x04
        if ((chunk[8] & metadataFlags) !== 0) removed = true
        chunk[8] &= ~metadataFlags
      }
      chunks.push(chunk)
    }
    offset = end
  }
  if (!removed) return blob
  const totalLength = 12 + chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const normalized = new Uint8Array(totalLength)
  normalized.set(source.subarray(0, 12))
  writeU32Le(normalized, 4, totalLength - 8)
  let offset = 12
  for (const chunk of chunks) {
    normalized.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new Blob([normalized], { type: 'image/webp' })
}

export async function encodeWebpOnce(
  surface: { convertToBlob(options: { type: 'image/webp'; quality: number }): Promise<Blob> },
  policy: ImageUploadPolicy,
  signal?: AbortSignal
): Promise<Blob> {
  if (signal?.aborted) throw Object.assign(new Error('Encode aborted'), { name: 'AbortError' })
  let blob: Blob
  try {
    blob = await surface.convertToBlob({ type: 'image/webp', quality: policy.webpQuality })
  } catch (error) {
    throw new ImageEncoderError('image_encode_failed', { cause: error })
  }
  if (signal?.aborted) throw Object.assign(new Error('Encode aborted'), { name: 'AbortError' })
  if (blob.type !== 'image/webp' || blob.size === 0) throw new ImageEncoderError('image_unsupported_format')
  if (blob.size > policy.maxStoredBytes) throw new ImageEncoderError('image_bad_length')
  blob = await stripWebpOptionalMetadata(blob)
  const grammar = await validateStored(blobChunks(blob), policy, signal)
  if (grammar.outcome === 'rejected') {
    throw new ImageEncoderError(
      grammar.code === 'image_bad_length'
        ? 'image_bad_length'
        : grammar.code === 'image_unsupported_format'
          ? 'image_unsupported_format'
          : 'image_encode_failed',
      { cause: new Error(`stored grammar rejected: ${grammar.code}`) }
    )
  }
  return blob
}

export type WorkerEncodeRequest = { kind: 'encode'; requestId: string; policy: ImageUploadPolicy; surface: unknown }

export function installOptimizerWorker(scope: {
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerEncodeRequest>) => void): void
  postMessage(message: unknown): void
}) {
  scope.addEventListener('message', async event => {
    if (event.data.kind !== 'encode') return
    try {
      const blob = await encodeWebpOnce(event.data.surface as any, event.data.policy)
      scope.postMessage({ kind: 'encoded', requestId: event.data.requestId, blob })
    } catch (error) {
      scope.postMessage({
        kind: 'error',
        requestId: event.data.requestId,
        code: error instanceof ImageEncoderError ? error.code : 'image_encode_failed'
      })
    }
  })
}

export function canvasToBlobOnce(
  canvas: { toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number): void },
  policy: ImageUploadPolicy,
  signal?: AbortSignal
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error('Encode aborted'), { name: 'AbortError' }))
      return
    }
    let settled = false
    canvas.toBlob(
      async blob => {
        if (settled) return
        settled = true
        if (signal?.aborted) {
          reject(Object.assign(new Error('Encode aborted'), { name: 'AbortError' }))
          return
        }
        if (!blob) {
          reject(new ImageEncoderError('image_encode_failed'))
          return
        }
        try {
          resolve(await encodeWebpOnce({ convertToBlob: async () => blob }, policy, signal))
        } catch (error) {
          reject(error)
        }
      },
      'image/webp',
      policy.webpQuality
    )
  })
}
