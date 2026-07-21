export const STORED_IMAGE_ERROR_CODES = [
  'image_truncated',
  'image_bad_length',
  'image_bad_crc',
  'image_bad_padding',
  'image_illegal_order',
  'image_duplicate_record',
  'image_animation_not_allowed',
  'image_multiple_pages_not_allowed',
  'image_unknown_record',
  'image_metadata_budget_exceeded',
  'image_trailing_bytes',
  'image_unsupported_format',
  'image_invalid_dimensions',
  'image_source_dimension_exceeded',
  'image_source_pixels_exceeded',
  'image_invalid_icc',
  'image_metadata_not_allowed',
] as const;

export type StoredImageErrorCode = (typeof STORED_IMAGE_ERROR_CODES)[number];
