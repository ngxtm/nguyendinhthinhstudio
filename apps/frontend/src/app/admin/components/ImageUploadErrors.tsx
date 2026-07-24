'use client'

export const IMAGE_NORMALIZATION_MESSAGE = 'Hệ thống sẽ tự chuẩn hóa màu của ảnh khi cần.'

export function getImageUploadErrorMessage(code: string): string {
  switch (code) {
    case 'image_invalid_icc':
      return 'Dữ liệu màu trong ảnh bị hỏng. Vui lòng xuất lại ảnh rồi thử lại.'
    case 'image_bad_length':
    case 'image_truncated':
    case 'image_bad_crc':
    case 'image_bad_padding':
    case 'image_illegal_order':
    case 'image_trailing_bytes':
      return 'Ảnh có cấu trúc không hợp lệ hoặc đã bị hỏng. Vui lòng xuất lại ảnh rồi thử lại.'
    case 'image_metadata_budget_exceeded':
      return 'Ảnh chứa quá nhiều dữ liệu bổ sung. Vui lòng xuất lại ảnh rồi thử lại.'
    default:
      return 'Không thể xử lý ảnh này. Vui lòng thử xuất lại ảnh hoặc chọn ảnh khác.'
  }
}

export function ImageUploadErrors({
  code,
  onRetry,
  onRemove
}: {
  code: string
  onRetry?: () => void
  onRemove?: () => void
}) {
  return (
    <div role="alert" className="mt-1 flex items-center gap-2 text-sm text-red-600">
      <span>{getImageUploadErrorMessage(code)}</span>
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
