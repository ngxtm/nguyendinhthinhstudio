import { createHash } from 'node:crypto';
import {
  INITIAL_IMAGE_UPLOAD_POLICY,
  normalizeImageUploadPolicy,
  type ImageUploadPolicy,
} from './policy.js';

export const IMAGE_UPLOAD_POLICY_FAMILY = 'web-v1';

function canonicalize(value: unknown): string {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('canonical JSON does not permit non-finite numbers');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(',')}}`;
  }
  throw new TypeError(`canonical JSON does not permit ${typeof value}`);
}

export function canonicalizeImageUploadPolicy(
  policy: ImageUploadPolicy,
): string {
  return canonicalize(normalizeImageUploadPolicy(policy));
}

export function hashImageUploadPolicy(policy: ImageUploadPolicy): string {
  const canonicalJson = canonicalizeImageUploadPolicy(policy);
  return createHash('sha256')
    .update('NDT_IMAGE_UPLOAD_POLICY', 'utf8')
    .update(Buffer.from([0]))
    .update(IMAGE_UPLOAD_POLICY_FAMILY, 'utf8')
    .update(Buffer.from([0]))
    .update(canonicalJson, 'utf8')
    .digest('hex');
}

export function createImageUploadPolicyVersion(
  policy: ImageUploadPolicy,
): string {
  return `${IMAGE_UPLOAD_POLICY_FAMILY}-${hashImageUploadPolicy(policy)}`;
}

export const INITIAL_IMAGE_UPLOAD_POLICY_CANONICAL_JSON =
  canonicalizeImageUploadPolicy(INITIAL_IMAGE_UPLOAD_POLICY as ImageUploadPolicy);
export const INITIAL_IMAGE_UPLOAD_POLICY_HASH = hashImageUploadPolicy(
  INITIAL_IMAGE_UPLOAD_POLICY as ImageUploadPolicy,
);
export const INITIAL_IMAGE_UPLOAD_POLICY_VERSION =
  createImageUploadPolicyVersion(
    INITIAL_IMAGE_UPLOAD_POLICY as ImageUploadPolicy,
  );
