export type CanonicalImageMime =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp';

export type ImageUploadPolicy = {
  minimumChromiumMajor: number;
  softTargetBytes: number;
  maxStoredBytes: number;
  maxSourceBytes: number;
  maxSourceDimension: number;
  maxSourcePixels: number;
  preflightWorkingBytes: number;
  maxDecodedPixels: number;
  maxConcurrentDecodedSurfaces: number;
  maxWidth: number;
  maxHeight: number;
  webpQuality: number;
  normalizedColorSpace: string;
  allowedStoredMimes: readonly CanonicalImageMime[];
  maxPagesOrFrames: number;
  metadataRulesetVersion: string;
  maxDecompressedIccBytes: number;
  allowedIccSha256: readonly string[];
};

const policyKeys = [
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
  'webpQuality',
  'normalizedColorSpace',
  'allowedStoredMimes',
  'maxPagesOrFrames',
  'metadataRulesetVersion',
  'maxDecompressedIccBytes',
  'allowedIccSha256',
] as const satisfies readonly (keyof ImageUploadPolicy)[];

const numericKeys = [
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
  'webpQuality',
  'maxPagesOrFrames',
  'maxDecompressedIccBytes',
] as const satisfies readonly (keyof ImageUploadPolicy)[];

const canonicalMimes = new Set<CanonicalImageMime>([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

function requireRecord(input: unknown): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('ImageUploadPolicy must be an object');
  }
  return input as Record<string, unknown>;
}

function validatePolicyShape(input: unknown): Record<string, unknown> {
  const record = requireRecord(input);
  const expectedKeys = new Set<string>(policyKeys);

  for (const key of Object.keys(record)) {
    if (!expectedKeys.has(key)) {
      throw new TypeError(`unexpected ImageUploadPolicy field: ${key}`);
    }
  }
  for (const key of policyKeys) {
    if (!Object.hasOwn(record, key)) {
      throw new TypeError(`missing ImageUploadPolicy field: ${key}`);
    }
  }
  for (const key of numericKeys) {
    if (typeof record[key] !== 'number' || !Number.isFinite(record[key])) {
      throw new TypeError(`${key} must be a finite number`);
    }
  }
  for (const key of ['normalizedColorSpace', 'metadataRulesetVersion'] as const) {
    if (typeof record[key] !== 'string' || record[key].length === 0) {
      throw new TypeError(`${key} must be a non-empty string`);
    }
  }

  if (
    !Array.isArray(record.allowedStoredMimes) ||
    record.allowedStoredMimes.some(
      (mime) => typeof mime !== 'string' || !canonicalMimes.has(mime as CanonicalImageMime),
    )
  ) {
    throw new TypeError('allowedStoredMimes must contain only canonical image MIME values');
  }
  if (
    !Array.isArray(record.allowedIccSha256) ||
    record.allowedIccSha256.some(
      (digest) => typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest),
    )
  ) {
    throw new TypeError('allowedIccSha256 must contain lowercase SHA-256 digests');
  }

  return record;
}

export function normalizeImageUploadPolicy(input: unknown): ImageUploadPolicy {
  const record = validatePolicyShape(input);

  return {
    minimumChromiumMajor: record.minimumChromiumMajor as number,
    softTargetBytes: record.softTargetBytes as number,
    maxStoredBytes: record.maxStoredBytes as number,
    maxSourceBytes: record.maxSourceBytes as number,
    maxSourceDimension: record.maxSourceDimension as number,
    maxSourcePixels: record.maxSourcePixels as number,
    preflightWorkingBytes: record.preflightWorkingBytes as number,
    maxDecodedPixels: record.maxDecodedPixels as number,
    maxConcurrentDecodedSurfaces:
      record.maxConcurrentDecodedSurfaces as number,
    maxWidth: record.maxWidth as number,
    maxHeight: record.maxHeight as number,
    webpQuality: record.webpQuality as number,
    normalizedColorSpace: record.normalizedColorSpace as string,
    allowedStoredMimes: [...(record.allowedStoredMimes as CanonicalImageMime[])],
    maxPagesOrFrames: record.maxPagesOrFrames as number,
    metadataRulesetVersion: record.metadataRulesetVersion as string,
    maxDecompressedIccBytes: record.maxDecompressedIccBytes as number,
    allowedIccSha256: [
      ...new Set(record.allowedIccSha256 as string[]),
    ].sort(),
  };
}

export const INITIAL_IMAGE_UPLOAD_POLICY: Readonly<ImageUploadPolicy> =
  Object.freeze({
    minimumChromiumMajor: 136,
    softTargetBytes: 3_145_728,
    maxStoredBytes: 5_242_880,
    maxSourceBytes: 104_857_600,
    maxSourceDimension: 16_384,
    maxSourcePixels: 80_000_000,
    preflightWorkingBytes: 8_388_608,
    maxDecodedPixels: 7_000_000,
    maxConcurrentDecodedSurfaces: 2,
    maxWidth: 2560,
    maxHeight: 2560,
    webpQuality: 0.84,
    normalizedColorSpace: 'srgb',
    allowedStoredMimes: Object.freeze<CanonicalImageMime[]>([
      'image/jpeg',
      'image/png',
      'image/webp',
    ]),
    maxPagesOrFrames: 1,
    metadataRulesetVersion: 'web-metadata-v1',
    maxDecompressedIccBytes: 1_048_576,
    allowedIccSha256: Object.freeze<string[]>([]),
  });
