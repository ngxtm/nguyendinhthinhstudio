import assert from 'node:assert/strict';
import test from 'node:test';
import {
  IMAGE_UPLOAD_POLICY_FAMILY,
  INITIAL_IMAGE_UPLOAD_POLICY,
  INITIAL_IMAGE_UPLOAD_POLICY_CANONICAL_JSON,
  INITIAL_IMAGE_UPLOAD_POLICY_HASH,
  INITIAL_IMAGE_UPLOAD_POLICY_VERSION,
  STORED_IMAGE_ERROR_CODES,
  canonicalizeImageUploadPolicy,
  createImageUploadPolicyVersion,
  hashImageUploadPolicy,
  normalizeImageUploadPolicy,
  type ImageUploadPolicy,
  type StoredImageErrorCode,
} from '../src/index.ts';

const expected = {
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
  allowedStoredMimes: ['image/jpeg', 'image/png', 'image/webp'],
  maxPagesOrFrames: 1,
  metadataRulesetVersion: 'web-metadata-v1',
  maxDecompressedIccBytes: 1_048_576,
  allowedIccSha256: [],
} as const satisfies ImageUploadPolicy;

const expectedCanonicalJson =
  '{"allowedIccSha256":[],"allowedStoredMimes":["image/jpeg","image/png","image/webp"],"maxConcurrentDecodedSurfaces":2,"maxDecodedPixels":7000000,"maxDecompressedIccBytes":1048576,"maxHeight":2560,"maxPagesOrFrames":1,"maxSourceBytes":104857600,"maxSourceDimension":16384,"maxSourcePixels":80000000,"maxStoredBytes":5242880,"maxWidth":2560,"metadataRulesetVersion":"web-metadata-v1","minimumChromiumMajor":136,"normalizedColorSpace":"srgb","preflightWorkingBytes":8388608,"softTargetBytes":3145728,"webpQuality":0.84}';

const expectedErrorCodes = [
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
] as const satisfies readonly StoredImageErrorCode[];

test('publishes the exact initial 18-field policy vector', () => {
  assert.deepEqual(INITIAL_IMAGE_UPLOAD_POLICY, expected);
  assert.equal(Object.keys(INITIAL_IMAGE_UPLOAD_POLICY).length, 18);
  assert.equal(IMAGE_UPLOAD_POLICY_FAMILY, 'web-v1');
  assert.equal(INITIAL_IMAGE_UPLOAD_POLICY_CANONICAL_JSON, expectedCanonicalJson);
  assert.equal(canonicalizeImageUploadPolicy(expected), expectedCanonicalJson);
  assert.equal(
    INITIAL_IMAGE_UPLOAD_POLICY_HASH,
    '18da64f64a7d4a645b549c56ebc5dce84ed830f69defdf8b6d7f2b8d9659baef',
  );
  assert.equal(
    INITIAL_IMAGE_UPLOAD_POLICY_VERSION,
    'web-v1-18da64f64a7d4a645b549c56ebc5dce84ed830f69defdf8b6d7f2b8d9659baef',
  );
});

test('hashes the exact family-prefixed RFC 8785 bytes deterministically', () => {
  assert.equal(hashImageUploadPolicy(expected), INITIAL_IMAGE_UPLOAD_POLICY_HASH);
  assert.equal(
    createImageUploadPolicyVersion(expected),
    INITIAL_IMAGE_UPLOAD_POLICY_VERSION,
  );

  const reversedEntries = Object.fromEntries(
    Object.entries(expected).reverse(),
  ) as unknown as ImageUploadPolicy;
  assert.equal(hashImageUploadPolicy(reversedEntries), INITIAL_IMAGE_UPLOAD_POLICY_HASH);
  assert.equal(canonicalizeImageUploadPolicy(reversedEntries), expectedCanonicalJson);
});

test('normalizes ICC digests and rejects malformed policy objects', () => {
  const digestA = 'a'.repeat(64);
  const digestB = 'b'.repeat(64);
  const normalized = normalizeImageUploadPolicy({
    ...expected,
    allowedIccSha256: [digestB, digestA, digestB],
  });

  assert.deepEqual(normalized.allowedIccSha256, [digestA, digestB]);
  assert.throws(
    () => normalizeImageUploadPolicy({ ...expected, webpQuality: Number.NaN }),
    /webpQuality/,
  );
  assert.throws(
    () => normalizeImageUploadPolicy({ ...expected, maxStoredBytes: Infinity }),
    /maxStoredBytes/,
  );

  const { maxWidth: _missing, ...missing } = expected;
  assert.throws(() => normalizeImageUploadPolicy(missing), /maxWidth/);
  assert.throws(
    () => normalizeImageUploadPolicy({ ...expected, unexpected: true }),
    /unexpected/,
  );
});

test('every wire property changes the hash while operational values stay outside it', () => {
  for (const key of Object.keys(expected) as Array<keyof ImageUploadPolicy>) {
    const value = expected[key];
    let changed: unknown;
    if (typeof value === 'number') changed = value + 1;
    else if (typeof value === 'string') changed = value + '-changed';
    else if (key === 'allowedStoredMimes') changed = [...value].reverse();
    else changed = ['c'.repeat(64)];

    const mutated = { ...expected, [key]: changed } as ImageUploadPolicy;
    assert.notEqual(hashImageUploadPolicy(mutated), INITIAL_IMAGE_UPLOAD_POLICY_HASH, key);
  }

  const operationalA = {
    presignLifetimeSeconds: 3600,
    finalizationLeaseSeconds: 600,
    processRole: 'api',
    processCount: 1,
    decodePermits: 2,
    r2TimeoutSeconds: 30,
    queueVisibilitySeconds: 60,
    presignEnabled: false,
    benchmarkBytes: 536_870_912,
  };
  const operationalB = { ...operationalA, processCount: 99, presignEnabled: true };
  assert.equal(
    hashImageUploadPolicy(expected),
    hashImageUploadPolicy(expected),
  );
  assert.notDeepEqual(operationalA, operationalB);
  for (const key of Object.keys(operationalA)) {
    assert.equal(key in INITIAL_IMAGE_UPLOAD_POLICY, false);
  }
});

test('exports the exact closed stored-image error code set', () => {
  assert.deepEqual(STORED_IMAGE_ERROR_CODES, expectedErrorCodes);
  const exhaustive: Record<StoredImageErrorCode, true> = Object.fromEntries(
    expectedErrorCodes.map((code) => [code, true]),
  ) as Record<StoredImageErrorCode, true>;
  assert.equal(Object.keys(exhaustive).length, expectedErrorCodes.length);
});
