import { createHash } from 'node:crypto';

export type ImageUploadFingerprintInput = Readonly<{
  clientRequestId: string;
  createdByAdminId: string;
  albumId: string;
  normalizedFilename: string;
  canonicalMime: 'image/jpeg' | 'image/png' | 'image/webp';
  fileSize: number;
  processedSha256: string;
  policyVersion: string;
}>;

const keys = [
  'clientRequestId',
  'createdByAdminId',
  'albumId',
  'normalizedFilename',
  'canonicalMime',
  'fileSize',
  'processedSha256',
  'policyVersion',
] as const satisfies readonly (keyof ImageUploadFingerprintInput)[];

export function createImageUploadRequestFingerprint(
  input: ImageUploadFingerprintInput,
): string {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('fingerprint input must be an object');
  }
  const expected = new Set<string>(keys);
  for (const key of Object.keys(input)) {
    if (!expected.has(key)) {
      throw new TypeError(`unexpected fingerprint field: ${key}`);
    }
  }
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) {
      throw new TypeError(`missing fingerprint field: ${key}`);
    }
  }
  if (
    input.normalizedFilename.trim() !== input.normalizedFilename ||
    input.normalizedFilename.normalize('NFC') !== input.normalizedFilename
  ) {
    throw new TypeError('normalizedFilename must be trimmed NFC');
  }
  if (
    !(['image/jpeg', 'image/png', 'image/webp'] as const).includes(
      input.canonicalMime,
    )
  ) {
    throw new TypeError('canonicalMime is invalid');
  }
  if (!Number.isSafeInteger(input.fileSize) || input.fileSize <= 0) {
    throw new TypeError('fileSize must be a positive safe integer');
  }

  const canonical = JSON.stringify(
    Object.fromEntries([...keys].sort().map((key) => [key, input[key]])),
  );
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
