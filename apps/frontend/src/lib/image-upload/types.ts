export type UploadCapability =
  | { outcome: 'supported' }
  | {
      outcome: 'unsupported'
      code: 'image_decoder_unavailable' | 'canvas_unavailable' | 'webp_encode_unavailable'
    }

export type OptimizedImage = {
  blob: Blob
  filename: string
  contentType: 'image/webp'
  fileSize: number
  processedSha256: string
  width: number
  height: number
}
