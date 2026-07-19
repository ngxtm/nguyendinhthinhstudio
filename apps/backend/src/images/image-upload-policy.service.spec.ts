import {
  INITIAL_IMAGE_UPLOAD_POLICY,
  INITIAL_IMAGE_UPLOAD_POLICY_HASH,
  INITIAL_IMAGE_UPLOAD_POLICY_VERSION,
  normalizeImageUploadPolicy,
} from '@ndt/image-upload-policy';
import { ImageUploadPolicyService } from './image-upload-policy.service';

describe('ImageUploadPolicyService', () => {
  it('exposes the exact shared wire policy without backend-owned fields', () => {
    const service = new ImageUploadPolicyService();

    expect(service.getPolicy()).toEqual({
      policyVersion: INITIAL_IMAGE_UPLOAD_POLICY_VERSION,
      policy: INITIAL_IMAGE_UPLOAD_POLICY,
    });
    expect(service.policyHash).toBe(INITIAL_IMAGE_UPLOAD_POLICY_HASH);
    expect(service.policyHash).toBe(
      '18da64f64a7d4a645b549c56ebc5dce84ed830f69defdf8b6d7f2b8d9659baef',
    );
    expect(service.policyVersion).toBe(
      'web-v1-18da64f64a7d4a645b549c56ebc5dce84ed830f69defdf8b6d7f2b8d9659baef',
    );
    expect(Object.keys(service.getPolicy().policy)).toHaveLength(18);
  });

  it('keeps the canonical MIME map closed and stable', () => {
    const service = new ImageUploadPolicyService();

    expect(service.canonicalMimeByExtension).toEqual({
      jpeg: 'image/jpeg',
      jpg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    });
    expect(service.canonicalizeMime('IMAGE/JPEG')).toBe('image/jpeg');
    expect(() => service.canonicalizeMime('image/gif')).toThrow(
      'unsupported canonical image MIME',
    );
  });

  it('normalizes sorted unique ICC digests and rejects unsafe policy relations', () => {
    const b = 'b'.repeat(64);
    const a = 'a'.repeat(64);
    const normalized = normalizeImageUploadPolicy({
      ...INITIAL_IMAGE_UPLOAD_POLICY,
      allowedIccSha256: [b, a, b],
    });
    const service = new ImageUploadPolicyService(normalized);

    expect(service.getPolicy().policy.allowedIccSha256).toEqual([a, b]);
    expect(() =>
      new ImageUploadPolicyService({
        ...normalized,
        softTargetBytes: normalized.maxStoredBytes + 1,
      }),
    ).toThrow('softTargetBytes');
    expect(() =>
      new ImageUploadPolicyService({
        ...normalized,
        maxWidth: normalized.maxSourceDimension + 1,
      }),
    ).toThrow('maxWidth');
    expect(() =>
      new ImageUploadPolicyService({
        ...normalized,
        maxDecodedPixels: normalized.maxSourcePixels + 1,
      }),
    ).toThrow('maxDecodedPixels');
  });
});
