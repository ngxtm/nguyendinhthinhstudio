import type { ImageUploadPolicy } from '@ndt/image-upload-policy';
import type { UploadCapability } from './types';

export type CapabilityProbeEnvironment = Partial<{
  chromiumMajor: number;
  imageDecoder: boolean;
  orientationMode: 'raw' | 'display' | 'ambiguous';
  targetSizeDecode: boolean;
  webpEncode: boolean;
  srgbOutput: boolean;
}>;

function chromiumMajor(): number | null {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const match = ua.match(/(?:Chrome|Chromium)\/(\d+)/i);
  return match ? Number(match[1]) : null;
}

export async function probeUploadCapability(policy: ImageUploadPolicy, signal?: AbortSignal, environment?: CapabilityProbeEnvironment): Promise<UploadCapability> {
  if (signal?.aborted) throw Object.assign(new Error('Capability probe aborted'), { name: 'AbortError' });
  const major = environment?.chromiumMajor ?? chromiumMajor();
  if (major === null || major < policy.minimumChromiumMajor) return { outcome: 'unsupported', code: 'browser_version_unsupported' };
  const decoderAvailable = environment?.imageDecoder ?? typeof (globalThis as any).ImageDecoder !== 'undefined';
  if (!decoderAvailable) return { outcome: 'unsupported', code: 'image_decoder_unavailable' };
  const orientation = environment?.orientationMode ?? 'display';
  if (orientation === 'ambiguous') return { outcome: 'unsupported', code: 'orientation_probe_failed' };
  if (!(environment?.targetSizeDecode ?? true)) return { outcome: 'unsupported', code: 'target_size_decode_unavailable' };
  if (!(environment?.webpEncode ?? true)) return { outcome: 'unsupported', code: 'webp_encode_unavailable' };
  if (!(environment?.srgbOutput ?? true)) return { outcome: 'unsupported', code: 'srgb_output_unproven' };
  return { outcome: 'supported', chromiumMajor: major, orientationMode: orientation, targetSizeDecode: true, webpEncode: true, srgbOutput: true };
}
