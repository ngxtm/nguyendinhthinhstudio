import { ImagesService } from './images.service';
import { StoredImageInspectionError } from './stored-image-inspector.service';

const ALBUM_ID = '00000000-0000-4000-8000-000000000001';
const UPLOAD_ID = '00000000-0000-4000-8000-000000000002';
const ADMIN_ID = '00000000-0000-4000-8000-000000000003';
const CLIENT_REQUEST_ID = '00000000-0000-4000-8000-000000000004';
const DIGEST = 'a'.repeat(64);
const NOW = new Date('2026-07-27T12:00:00.000Z');

const request = {
  clientRequestId: CLIENT_REQUEST_ID,
  albumId: ALBUM_ID,
  filename: 'portrait.webp',
  contentType: 'image/webp' as const,
  fileSize: 1024,
  processedSha256: DIGEST,
};

function harness() {
  const upload: any = {
    id: UPLOAD_ID,
    ...request,
    uploadObjectKey: `uploads/${UPLOAD_ID}/portrait.webp`,
    finalObjectKey: `albums/${ALBUM_ID}/portrait.webp`,
    status: 'pending',
    sourceEtag: null,
    finalizationStartedAt: null,
    finalizationLeaseToken: null,
    expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
    presignExpiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
    createdByAdminId: ADMIN_ID,
    createdAt: NOW,
  };
  const image: any = { findFirst: jest.fn().mockResolvedValue({ orderIndex: 0 }), findUnique: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0) };
  const imageUpload: any = {
    create: jest.fn().mockImplementation(async ({ data }) => Object.assign(upload, data)),
    findUnique: jest.fn().mockImplementation(async () => upload),
    count: jest.fn().mockResolvedValue(0),
    updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
      if (where.id !== upload.id || (where.status && where.status !== upload.status)) return { count: 0 };
      Object.assign(upload, data);
      return { count: 1 };
    }),
  };
  const prisma: any = {
    album: { findUnique: jest.fn().mockResolvedValue({ id: ALBUM_ID }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    image,
    imageUpload,
    imageUploadIdempotency: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  prisma.$transaction = jest.fn(async (work) => work(prisma));
  const storage: any = {
    createUploadObjectKey: jest.fn().mockReturnValue(upload.uploadObjectKey),
    createFinalObjectKey: jest.fn().mockReturnValue(upload.finalObjectKey),
    signFixedExpiryPut: jest.fn().mockResolvedValue('https://r2.example.test/upload'),
    verifyObject: jest.fn().mockResolvedValue('source-etag'),
    readObjectBytes: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    promoteObject: jest.fn().mockResolvedValue('destination-etag'),
  };
  const promotions: any = {
    createDispatchedPromotion: jest.fn().mockResolvedValue({ id: 'promotion-1' }),
    settleCopyResponseAndCommit: jest.fn().mockImplementation(async ({ image: committedImage, observedAt }) => {
      Object.assign(upload, { status: 'consumed', resultImageId: committedImage.id, terminalAt: observedAt, resultRetentionExpiresAt: new Date(NOW.getTime() + 86_400_000) });
      image.findUnique.mockResolvedValue(committedImage);
      return {};
    }),
  };
  const semaphore = { acquire: jest.fn().mockResolvedValue(jest.fn()) };
  const inspector = { inspect: jest.fn().mockResolvedValue({ digestSha256: DIGEST, byteSize: 1024, facts: { mime: 'image/webp', width: 10, height: 20 } }) };
  const service = new ImagesService(prisma, storage, { getVariantUrls: jest.fn().mockReturnValue({ thumbnailUrl: '', smallUrl: '', mediumUrl: '', largeUrl: '', xlargeUrl: '' }) } as never, { presentImage: jest.fn((value) => value) } as never, promotions, semaphore as never, inspector as never);
  return { upload, prisma, storage, promotions, semaphore, inspector, service };
}

describe('ImagesService simplified WebP upload sessions', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(NOW));
  afterEach(() => jest.useRealTimers());

  it('persists and fingerprints a WebP request without durable policy facts', async () => {
    const h = harness();

    await expect(h.service.getUploadUrl(request, ADMIN_ID)).resolves.toEqual(expect.objectContaining({ outcome: 'ready' }));

    const persisted = h.prisma.imageUpload.create.mock.calls[0][0].data;
    expect(persisted).toEqual(expect.objectContaining({ contentType: 'image/webp', processedSha256: DIGEST }));
    expect(persisted).not.toHaveProperty('policyVersion');
    expect(persisted).not.toHaveProperty('policySnapshot');
  });

  it('uses required promotion, semaphore, and Sharp inspector dependencies for confirmation', async () => {
    const h = harness();

    await h.service.confirmUpload({ uploadId: UPLOAD_ID }, ADMIN_ID);

    expect(h.inspector.inspect).toHaveBeenCalledWith(expect.any(Uint8Array), expect.any(AbortSignal));
    expect(h.promotions.createDispatchedPromotion).toHaveBeenCalledWith(expect.objectContaining({ canonicalMime: 'image/webp' }));
    expect(h.promotions.createDispatchedPromotion.mock.calls[0][0]).not.toHaveProperty('policyVersion');
    expect(h.storage.promoteObject).toHaveBeenCalledTimes(1);
  });

  it('terminalizes a decode failure as the normal failed-session envelope', async () => {
    const h = harness();
    h.inspector.inspect.mockRejectedValueOnce(new StoredImageInspectionError('upload_decode_failed'));

    await expect(h.service.confirmUpload({ uploadId: UPLOAD_ID }, ADMIN_ID)).resolves.toEqual(
      expect.objectContaining({ outcome: 'failed', failureCode: 'upload_decode_failed', uploadId: UPLOAD_ID }),
    );
    expect(h.promotions.createDispatchedPromotion).not.toHaveBeenCalled();
  });

  it('retains digest mismatch as a terminal failed-session outcome', async () => {
    const h = harness();
    h.inspector.inspect.mockResolvedValueOnce({ digestSha256: 'b'.repeat(64), byteSize: 1024, facts: { mime: 'image/webp', width: 10, height: 20 } });

    await expect(h.service.confirmUpload({ uploadId: UPLOAD_ID }, ADMIN_ID)).resolves.toEqual(
      expect.objectContaining({ outcome: 'failed', failureCode: 'upload_digest_mismatch' }),
    );
    expect(h.upload.failureCode).toBe('upload_digest_mismatch');
  });
});
