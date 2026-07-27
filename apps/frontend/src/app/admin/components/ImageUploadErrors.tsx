'use client'

export const IMAGE_NORMALIZATION_MESSAGE = 'Ảnh sẽ được nén sang WebP trước khi upload.'

function retryTime(retryAfter: string | undefined): string {
  if (!retryAfter) return 'ít phút nữa'
  const date = new Date(retryAfter)
  if (Number.isNaN(date.getTime())) return 'ít phút nữa'
  return date.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit'
  })
}

export function getImageUploadErrorMessage(code: string, retryAfter?: string): string {
  switch (code) {
    case 'upload_rate_limited':
      return `Bạn đã gửi quá nhiều yêu cầu. Thử lại sau ${retryTime(retryAfter)}.`
    case 'image_source_unsupported':
      return 'Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.'
    case 'image_source_bytes_exceeded':
      return 'Ảnh vượt quá dung lượng nguồn tối đa 100 MB.'
    case 'image_output_bytes_exceeded':
      return 'Ảnh sau khi nén vẫn vượt quá 5 MB. Vui lòng chọn ảnh khác.'
    case 'image_decoder_unavailable':
    case 'canvas_unavailable':
    case 'webp_encode_unavailable':
      return 'Trình duyệt này không hỗ trợ xử lý ảnh WebP. Vui lòng dùng trình duyệt khác.'
    case 'image_decode_failed':
    case 'image_encode_failed':
      return 'Không thể xử lý ảnh này trong trình duyệt. Vui lòng thử xuất lại ảnh hoặc chọn ảnh khác.'
    default:
      return 'Không thể upload ảnh này. Vui lòng thử lại hoặc chọn ảnh khác.'
  }
}

export function ImageUploadErrors({
  code,
  retryAfter,
  onRetry,
  onRemove
}: {
  code: string
  retryAfter?: string
  onRetry?: () => void
  onRemove?: () => void
}) {
  return (
    <div role="alert" className="mt-1 flex items-center gap-2 text-sm text-red-600">
      <span>{getImageUploadErrorMessage(code, retryAfter)}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-medium underline">
          Thử lại
        </button>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} className="font-medium underline">
          Xóa
        </button>
      )}
    </div>
  )
}
