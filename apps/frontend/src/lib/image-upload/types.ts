export type ImageResourceKind =
  | 'image-bitmap'
  | 'canvas'
  | 'worker-surface'
  | 'thumbnail'
  | 'preview-image'
  | 'output-blob'
  | 'object-url';

export type ResourceLease = {
  readonly itemId: string;
  readonly kind: ImageResourceKind;
  readonly token: symbol;
  readonly owner: string;
};

export type ResourceSnapshot = Readonly<{
  decodedOrVisibleSurfaces: number;
  residentOutputBlobs: number;
  total: number;
  leases: readonly ResourceLease[];
}>;

export type UploadCapability =
  | { outcome: 'supported'; chromiumMajor: number; orientationMode: 'raw' | 'display'; targetSizeDecode: true; webpEncode: true; srgbOutput: true }
  | { outcome: 'unsupported'; code: 'browser_version_unsupported' | 'image_decoder_unavailable' | 'orientation_probe_failed' | 'target_size_decode_unavailable' | 'webp_encode_unavailable' | 'srgb_output_unproven' };

export type OptimizedImage = {
  blob: Blob;
  filename: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  fileSize: number;
  processedSha256: string;
  width: number;
  height: number;
  policyVersion: string;
  disposition: 'passed-through' | 'normalized';
};
