import { createImageUploadRequestFingerprint } from './image-upload-fingerprint';

const input = {
  clientRequestId: '00000000-0000-4000-8000-000000000001',
  createdByAdminId: '00000000-0000-4000-8000-000000000002',
  albumId: '00000000-0000-4000-8000-000000000003',
  normalizedFilename: 'ảnh cưới.webp',
  canonicalMime: 'image/webp' as const,
  fileSize: 1_234_567,
  processedSha256: 'a'.repeat(64),
  policyVersion: 'web-v1-policy',
};

describe('createImageUploadRequestFingerprint', () => {
  it('hashes the exact canonical owner-bound request facts deterministically', () => {
    const first = createImageUploadRequestFingerprint(input);
    const reordered = createImageUploadRequestFingerprint({
      policyVersion: input.policyVersion,
      processedSha256: input.processedSha256,
      fileSize: input.fileSize,
      canonicalMime: input.canonicalMime,
      normalizedFilename: input.normalizedFilename,
      albumId: input.albumId,
      createdByAdminId: input.createdByAdminId,
      clientRequestId: input.clientRequestId,
    });

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(reordered).toBe(first);
  });

  it.each(Object.keys(input) as Array<keyof typeof input>)(
    'changes when %s changes',
    (key) => {
      const changed = {
        ...input,
        [key]:
          key === 'canonicalMime'
            ? 'image/png'
            : typeof input[key] === 'number'
              ? (input[key] as number) + 1
              : `${input[key]}-changed`,
      };
      expect(
        createImageUploadRequestFingerprint(changed as typeof input),
      ).not.toBe(createImageUploadRequestFingerprint(input));
    },
  );

  it('rejects missing, unknown, non-normalized, and non-canonical facts', () => {
    expect(() =>
      createImageUploadRequestFingerprint({
        ...input,
        normalizedFilename: 'a\u0301.webp',
      }),
    ).toThrow('normalizedFilename');
    expect(() =>
      createImageUploadRequestFingerprint({
        ...input,
        canonicalMime: 'image/jpg' as never,
      }),
    ).toThrow('canonicalMime');
    expect(() =>
      createImageUploadRequestFingerprint({ ...input, extra: true } as never),
    ).toThrow('unexpected');
  });
});
