/**
 * Number formatting helpers.
 */

/**
 * Compact count in TikTok style: 1.2K, 15K, 1.5M, 1.2B.
 * Used on public-facing surfaces where space is tight.
 */
export function formatCompactCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0'
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

/**
 * Full count with vi-VN thousands separators: 1.230.000.
 * Used in admin where exact figures matter.
 */
export function formatFullCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0'
  return new Intl.NumberFormat('vi-VN').format(value)
}