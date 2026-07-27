import { createImageUploadRequestFingerprint } from './image-upload-fingerprint';

const input = {
  clientRequestId: '00000000-0000-4000-8000-000000000001',
  createdByAdminId: '00000000-0000-4000-8000-000000000002',
  albumId: '00000000-0000-4000-8000-000000000003',
  normalizedFilename: 'ảnh cưới.webp',
  canonicalMime: 'image/webp' as const,
  fileSize: 1_234_567,
  processedSha256: 'a'.repeat(64),
};

const fingerprintChangingInputs = [
  [
    'client request ID',
    {
      ...input,
      clientRequestId: '00000000-0000-4000-8000-000000000004',
    },
  ],
  [
    'admin',
    {
      ...input,
      createdByAdminId: '00000000-0000-4000-8000-000000000005',
    },
  ],
  [
    'album',
    {
      ...input,
      albumId: '00000000-0000-4000-8000-000000000006',
    },
  ],
  ['filename', { ...input, normalizedFilename: 'ảnh lễ cưới.webp' }],
  ['bytes', { ...input, fileSize: input.fileSize + 1 }],
  ['digest', { ...input, processedSha256: 'b'.repeat(64) }],
] as const;

describe('createImageUploadRequestFingerprint', () => {
  it('hashes the exact canonical owner-bound request facts deterministically', () => {
    const first = createImageUploadRequestFingerprint(input);
    const reordered = createImageUploadRequestFingerprint({
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

  it.each(fingerprintChangingInputs)(
    'changes when %s changes',
    (_fact, changed) => {
      expect(createImageUploadRequestFingerprint(changed)).not.toBe(
        createImageUploadRequestFingerprint(input),
      );
    },
  );

  it('requires the canonical browser-produced WebP MIME fact', () => {
    expect(() =>
      createImageUploadRequestFingerprint({
        ...input,
        canonicalMime: 'image/png' as never,
      }),
    ).toThrow('canonicalMime is invalid');

    const { canonicalMime: _canonicalMime, ...withoutCanonicalMime } = input;
    expect(() =>
      createImageUploadRequestFingerprint(withoutCanonicalMime as never),
    ).toThrow('missing fingerprint field: canonicalMime');
  });

  it('rejects stale policy, unknown, and non-normalized facts', () => {
    expect(() =>
      createImageUploadRequestFingerprint({
        ...input,
        normalizedFilename: 'a\u0301.webp',
      }),
    ).toThrow('normalizedFilename');
    expect(() =>
      createImageUploadRequestFingerprint({
        ...input,
        policyVersion: 'web-v1-policy',
      } as never),
    ).toThrow('unexpected fingerprint field: policyVersion');
    expect(() =>
      createImageUploadRequestFingerprint({ ...input, extra: true } as never),
    ).toThrow('unexpected');
  });
});
