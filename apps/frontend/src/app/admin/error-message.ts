type ErrorPayload = {
  message?: unknown
  error?: unknown
}

function asText(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
    const message = value.join(' ').trim()
    return message || undefined
  }
  return undefined
}

function extractPayloadMessage(payload: unknown): string | undefined {
  const direct = asText(payload)
  if (direct) return direct
  if (!payload || typeof payload !== 'object') return undefined

  const data = payload as ErrorPayload
  return asText(data.message) ?? asText(data.error)
}

function hasVietnameseText(message: string): boolean {
  return /[ăâđêôơưĂÂĐÊÔƠƯÀ-ỹ]/u.test(message)
}

export function getAdminErrorMessage(error: unknown, fallback: string): string {
  let message: string | undefined

  if (error && typeof error === 'object' && 'data' in error) {
    message = extractPayloadMessage((error as { data?: unknown }).data)
  }

  message ??= extractPayloadMessage(error)
  message ??= error instanceof Error ? error.message.trim() : undefined

  return message && hasVietnameseText(message) ? message : fallback
}
