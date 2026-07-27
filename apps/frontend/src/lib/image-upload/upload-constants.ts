export const ACCEPTED_SOURCE_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp'] as const)

export type AcceptedSourceMime = (typeof ACCEPTED_SOURCE_MIME_TYPES)[number]

export const MAX_SOURCE_BYTES = 100 * 1024 * 1024
export const MAX_OUTPUT_BYTES = 5 * 1024 * 1024
export const MAX_OUTPUT_EDGE = 2560
export const WEBP_QUALITY = 0.84
export const MAX_BATCH_FILES = 50
export const UPLOAD_CONCURRENCY = 2
