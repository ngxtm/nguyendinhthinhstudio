import { Injectable, Optional } from '@nestjs/common';
import {
  createImageUploadPolicyVersion,
  hashImageUploadPolicy,
  INITIAL_IMAGE_UPLOAD_POLICY,
  normalizeImageUploadPolicy,
  type CanonicalImageMime,
  type ImageUploadPolicy,
} from '@ndt/image-upload-policy';
import type { PolicyResponse } from '@ndt/types';

const canonicalMimeByExtension = Object.freeze({
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const);

function assertPositiveInteger(
  policy: ImageUploadPolicy,
  key: Extract<keyof ImageUploadPolicy, string>,
): void {
  const value = policy[key];
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new TypeError(`${key} must be a positive integer`);
  }
}

function assertSafePolicyRelations(policy: ImageUploadPolicy): void {
  const integerKeys = [
    'minimumChromiumMajor',
    'softTargetBytes',
    'maxStoredBytes',
    'maxSourceBytes',
    'maxSourceDimension',
    'maxSourcePixels',
    'preflightWorkingBytes',
    'maxDecodedPixels',
    'maxConcurrentDecodedSurfaces',
    'maxWidth',
    'maxHeight',
    'maxPagesOrFrames',
    'maxDecompressedIccBytes',
  ] as const;

  for (const key of integerKeys) {
    assertPositiveInteger(policy, key);
  }
  if (policy.webpQuality <= 0 || policy.webpQuality > 1) {
    throw new TypeError('webpQuality must be greater than 0 and at most 1');
  }
  if (policy.softTargetBytes > policy.maxStoredBytes) {
    throw new TypeError('softTargetBytes must not exceed maxStoredBytes');
  }
  if (policy.maxStoredBytes > policy.maxSourceBytes) {
    throw new TypeError('maxStoredBytes must not exceed maxSourceBytes');
  }
  if (policy.preflightWorkingBytes > policy.maxSourceBytes) {
    throw new TypeError('preflightWorkingBytes must not exceed maxSourceBytes');
  }
  if (policy.maxWidth > policy.maxSourceDimension) {
    throw new TypeError('maxWidth must not exceed maxSourceDimension');
  }
  if (policy.maxHeight > policy.maxSourceDimension) {
    throw new TypeError('maxHeight must not exceed maxSourceDimension');
  }
  if (policy.maxDecodedPixels > policy.maxSourcePixels) {
    throw new TypeError('maxDecodedPixels must not exceed maxSourcePixels');
  }
}

@Injectable()
export class ImageUploadPolicyService {
  readonly canonicalMimeByExtension = canonicalMimeByExtension;
  readonly policy: Readonly<ImageUploadPolicy>;
  readonly policyHash: string;
  readonly policyVersion: string;

  constructor(
    @Optional() policy: ImageUploadPolicy = INITIAL_IMAGE_UPLOAD_POLICY,
  ) {
    const normalized = normalizeImageUploadPolicy(policy);
    assertSafePolicyRelations(normalized);
    this.policy = Object.freeze({
      ...normalized,
      allowedStoredMimes: Object.freeze([...normalized.allowedStoredMimes]),
      allowedIccSha256: Object.freeze([...normalized.allowedIccSha256]),
    });
    this.policyHash = hashImageUploadPolicy(this.policy as ImageUploadPolicy);
    this.policyVersion = createImageUploadPolicyVersion(
      this.policy as ImageUploadPolicy,
    );
  }

  getPolicy(): PolicyResponse {
    return {
      policyVersion: this.policyVersion,
      policy: this.policy,
    };
  }

  canonicalizeMime(input: string): CanonicalImageMime {
    const normalized = input.trim().toLowerCase();
    if (
      !this.policy.allowedStoredMimes.includes(normalized as CanonicalImageMime)
    ) {
      throw new TypeError('unsupported canonical image MIME');
    }
    return normalized as CanonicalImageMime;
  }
}
