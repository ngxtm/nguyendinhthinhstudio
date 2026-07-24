import { BadRequestException } from '@nestjs/common';
import { createImageUploadRequestFingerprint } from './image-upload-fingerprint';
import { ImagesService } from './images.service';

const ALBUM_ID = '00000000-0000-4000-8000-000000000001';
const UPLOAD_ID = '00000000-0000-4000-8000-000000000002';
const SECOND_UPLOAD_ID = '00000000-0000-4000-8000-000000000003';
const UPLOAD_KEY = `uploads/${UPLOAD_ID}/portrait.jpg`;
const FINAL_KEY = `albums/${ALBUM_ID}/00000000-0000-4000-8000-000000000004-portrait.jpg`;
const NOW = new Date('2026-07-12T12:00:00.000Z');
const ADMIN_ID = '00000000-0000-4000-8000-000000000005';
const CLIENT_REQUEST_ID = '00000000-0000-4000-8000-000000000006';
const POLICY_VERSION = 'web-v1-policy';
const PROCESSED_SHA256 = 'a'.repeat(64);

type UploadRow = {
  id: string;
  albumId: string;
  uploadObjectKey: string;
  finalObjectKey: string;
  filename: string;
  contentType: string;
  fileSize: number;
  status: 'pending' | 'finalizing' | 'consumed' | 'failed';
  sourceEtag: string | null;
  finalizationStartedAt: Date | null;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
  clientRequestId?: string | null;
  createdByAdminId?: string | null;
  presignExpiresAt?: Date | null;
  finalizationLeaseToken?: string | null;
  resultImageId?: string | null;
  resultDeletedAt?: Date | null;
  terminalAt?: Date | null;
  resultRetentionExpiresAt?: Date | null;
  failureCode?: string | null;
};

const uploadRequest = {
  clientRequestId: CLIENT_REQUEST_ID,
  albumId: ALBUM_ID,
  filename: 'portrait.jpg',
  contentType: 'image/jpeg',
  fileSize: 1024,
  processedSha256: PROCESSED_SHA256,
  policyVersion: POLICY_VERSION,
};

const activeUpload = (overrides: Partial<UploadRow> = {}): UploadRow => ({
  id: UPLOAD_ID,
  albumId: ALBUM_ID,
  uploadObjectKey: UPLOAD_KEY,
  finalObjectKey: FINAL_KEY,
  filename: 'portrait.jpg',
  contentType: 'image/jpeg',
  fileSize: 1024,
  status: 'pending',
  sourceEtag: null,
  finalizationStartedAt: null,
  expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
  consumedAt: null,
  createdAt: NOW,
  clientRequestId: CLIENT_REQUEST_ID,
  createdByAdminId: ADMIN_ID,
  presignExpiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
  ...overrides,
});

describe('ImagesService read presentation', () => {
  it('presents every image returned for an album without mutating query rows', async () => {
    const harness = createHarness();
    const rows = [
      { id: 'image-1', thumbnailUrl: 'stored://one' },
      { id: 'image-2', thumbnailUrl: 'stored://two' },
    ];
    harness.prisma.image.findMany.mockResolvedValueOnce(rows);

    await expect(
      harness.createService().findByAlbum(ALBUM_ID),
    ).resolves.toEqual([
      { id: 'image-1', thumbnailUrl: 'presented://image-1' },
      { id: 'image-2', thumbnailUrl: 'presented://image-2' },
    ]);

    expect(harness.imagePresenter.presentImage).toHaveBeenCalledTimes(2);
    expect(rows).toEqual([
      { id: 'image-1', thumbnailUrl: 'stored://one' },
      { id: 'image-2', thumbnailUrl: 'stored://two' },
    ]);
  });
});

function createHarness(session = activeUpload()) {
  const rows = {
    images: [] as Array<Record<string, unknown>>,
    upload: session,
  };
  const prisma: any = {
    album: {
      findUnique: jest.fn().mockResolvedValue({
        id: ALBUM_ID,
        imageCount: 0,
        _count: { images: 0 },
      }),
      update: jest.fn().mockImplementation(async ({ data }: any) => {
        if (data.imageCount?.increment) {
          rows.images.length += 0;
        }
        return { id: ALBUM_ID, ...data };
      }),
      delete: jest.fn(),
    },
    imageUploadIdempotency: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }: any) => data),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    imageUpload: {
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        rows.upload = { ...data };
        return rows.upload;
      }),
      findUnique: jest.fn().mockImplementation(async () => rows.upload),
      update: jest.fn().mockImplementation(async ({ data }: any) => {
        rows.upload = { ...rows.upload, ...data };
        return rows.upload;
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
    },
    image: {
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({ orderIndex: 0 }),
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        const image = { id: `image-${rows.images.length + 1}`, ...data };
        rows.images.push(image);
        return image;
      }),
    },
  };
  prisma.$transaction = jest.fn(async (work: (tx: typeof prisma) => unknown) =>
    typeof work === 'function' ? work(prisma) : work,
  );

  const storage: any = {
    createUploadObjectKey: jest.fn().mockReturnValue(UPLOAD_KEY),
    createFinalObjectKey: jest.fn().mockReturnValue(FINAL_KEY),
    signFixedExpiryPut: jest
      .fn()
      .mockResolvedValue('https://r2.example.test/presigned-temporary-upload'),
    getPresignedUploadUrl: jest.fn().mockImplementation((...args: unknown[]) =>
      Promise.resolve(
        args.length === 3
          ? 'https://r2.example.test/presigned-temporary-upload'
          : {
              uploadUrl: 'https://r2.example.test/presigned-temporary-upload',
              objectKey: UPLOAD_KEY,
            },
      ),
    ),
    verifyObject: jest.fn().mockResolvedValue('"source-etag"'),
    readObjectBytes: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    promoteObject: jest.fn().mockResolvedValue(undefined),
    deleteObject: jest.fn().mockResolvedValue(undefined),
  };
  const imageUrl: any = {
    getVariantUrls: jest.fn().mockReturnValue({
      thumbnailUrl: 'https://img.example.test/thumbnail',
      smallUrl: 'https://img.example.test/small',
      mediumUrl: 'https://img.example.test/medium',
      largeUrl: 'https://img.example.test/large',
      xlargeUrl: 'https://img.example.test/xlarge',
    }),
  };
  const policy: any = {
    policyVersion: POLICY_VERSION,
    getPolicy: jest.fn(() => ({
      policyVersion: POLICY_VERSION,
      policy: { maxStoredBytes: 5_242_880 },
    })),
  };
  const imagePresenter: any = {
    presentImage: jest.fn((image: Record<string, unknown>) => ({
      ...image,
      thumbnailUrl: `presented://${String(image.id)}`,
    })),
  };

  return {
    rows,
    prisma,
    storage,
    imageUrl,
    imagePresenter,
    policy,
    createService: () =>
      new (ImagesService as any)(
        prisma,
        storage,
        imageUrl,
        imagePresenter,
        policy,
      ),
    createCurrentService: (promotions: any, semaphore: any, inspector: any) =>
      new (ImagesService as any)(prisma, storage, imageUrl, imagePresenter, policy, promotions, semaphore, inspector),
  };
}

describe('ImagesService upload sessions', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('persists distinct temporary and final object keys before returning a presigned upload URL', async () => {
    const harness = createHarness();

    await expect(
      harness.createService().getUploadUrl(uploadRequest, ADMIN_ID),
    ).resolves.toEqual({
      outcome: 'ready',
      statusCode: 200,
      uploadUrl: 'https://r2.example.test/presigned-temporary-upload',
      uploadId: expect.any(String),
      expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000).toISOString(),
    });

    expect(harness.storage.createUploadObjectKey).toHaveBeenCalledWith(
      expect.any(String),
      'portrait.jpg',
    );
    expect(harness.storage.createFinalObjectKey).toHaveBeenCalledWith(
      ALBUM_ID,
      'portrait.jpg',
    );
    expect(harness.prisma.imageUpload.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: expect.any(String),
        albumId: ALBUM_ID,
        uploadObjectKey: UPLOAD_KEY,
        finalObjectKey: FINAL_KEY,
        filename: 'portrait.jpg',
        contentType: 'image/jpeg',
        fileSize: 1024,
        status: 'pending',
        clientRequestId: CLIENT_REQUEST_ID,
        createdByAdminId: ADMIN_ID,
        policyVersion: POLICY_VERSION,
        policySnapshot: { maxStoredBytes: 5_242_880 },
        processedSha256: PROCESSED_SHA256,
        expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
      }),
    });
    expect(harness.prisma.imageUploadIdempotency.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientRequestId: CLIENT_REQUEST_ID,
        createdByAdminId: ADMIN_ID,
        uploadId: expect.any(String),
        requestFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    });
    expect(harness.storage.signFixedExpiryPut).toHaveBeenCalledWith(
      UPLOAD_KEY,
      'image/jpeg',
      1024,
      new Date(NOW.getTime() + 60 * 60 * 1000),
      NOW,
    );
  });

  it('uses the transaction clock for first expiry and a fresh post-transaction signing clock', async () => {
    const harness = createHarness();
    harness.prisma.$transaction.mockImplementationOnce(
      async (work: (tx: typeof harness.prisma) => unknown) => {
        jest.setSystemTime(new Date('2026-07-12T12:00:05.000Z'));
        const result = await work(harness.prisma);
        jest.setSystemTime(new Date('2026-07-12T12:00:15.000Z'));
        return result;
      },
    );

    await expect(
      harness.createService().getUploadUrl(uploadRequest, ADMIN_ID),
    ).resolves.toEqual(
      expect.objectContaining({
        outcome: 'ready',
        expiresAt: '2026-07-12T13:00:05.000Z',
      }),
    );
    expect(harness.storage.signFixedExpiryPut).toHaveBeenCalledWith(
      UPLOAD_KEY,
      'image/jpeg',
      1024,
      new Date('2026-07-12T13:00:05.000Z'),
      new Date('2026-07-12T12:00:15.000Z'),
    );
  });

  it('reuses one session and immutable expiry for a same-fingerprint retry', async () => {
    const harness = createHarness();
    await harness.createService().getUploadUrl(uploadRequest, ADMIN_ID);
    const requestFingerprint = createImageUploadRequestFingerprint({
      clientRequestId: CLIENT_REQUEST_ID,
      createdByAdminId: ADMIN_ID,
      albumId: ALBUM_ID,
      normalizedFilename: 'portrait.jpg',
      canonicalMime: 'image/jpeg',
      fileSize: 1024,
      processedSha256: PROCESSED_SHA256,
      policyVersion: POLICY_VERSION,
    });
    harness.prisma.imageUploadIdempotency.findUnique.mockResolvedValue({
      clientRequestId: CLIENT_REQUEST_ID,
      createdByAdminId: ADMIN_ID,
      uploadId: harness.rows.upload.id,
      requestFingerprint,
    });

    await expect(
      harness.createService().getUploadUrl(uploadRequest, ADMIN_ID),
    ).resolves.toEqual(
      expect.objectContaining({
        outcome: 'ready',
        uploadId: harness.rows.upload.id,
        expiresAt: '2026-07-12T13:00:00.000Z',
      }),
    );
    expect(harness.prisma.imageUpload.create).toHaveBeenCalledTimes(1);
    expect(harness.prisma.imageUploadIdempotency.create).toHaveBeenCalledTimes(
      1,
    );
    expect(harness.storage.signFixedExpiryPut).toHaveBeenCalledTimes(2);
    expect(harness.storage.signFixedExpiryPut.mock.calls[1][3]).toEqual(
      new Date('2026-07-12T13:00:00.000Z'),
    );
  });

  it('rejects owner or fingerprint mismatch without revealing the existing record', async () => {
    const harness = createHarness();
    harness.prisma.imageUploadIdempotency.findUnique.mockResolvedValue({
      clientRequestId: CLIENT_REQUEST_ID,
      createdByAdminId: 'different-admin',
      uploadId: 'secret-existing-upload',
      requestFingerprint: 'f'.repeat(64),
    });

    await expect(
      harness.createService().getUploadUrl(uploadRequest, ADMIN_ID),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'upload_request_conflict' }),
    });
    expect(harness.prisma.imageUpload.create).not.toHaveBeenCalled();
    expect(harness.storage.signFixedExpiryPut).not.toHaveBeenCalled();
  });

  it('counts completed images plus unexpired pending and every finalizing reservation', async () => {
    const harness = createHarness();
    harness.prisma.image.count.mockResolvedValue(49);
    harness.prisma.imageUpload.count.mockResolvedValue(1);

    await expect(
      harness.createService().getUploadUrl(uploadRequest, ADMIN_ID),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'upload_capacity_exceeded' }),
    });
    expect(harness.prisma.imageUpload.count).toHaveBeenCalledWith({
      where: {
        albumId: ALBUM_ID,
        OR: [
          {
            status: 'pending',
            expiresAt: { gt: NOW },
          },
          { status: 'finalizing' },
        ],
      },
    });
    expect(harness.prisma.imageUpload.create).not.toHaveBeenCalled();
  });

  it('terminalizes an existing pending retry at expiry without signing', async () => {
    const harness = createHarness();
    const requestFingerprint = createImageUploadRequestFingerprint({
      clientRequestId: CLIENT_REQUEST_ID,
      createdByAdminId: ADMIN_ID,
      albumId: ALBUM_ID,
      normalizedFilename: 'portrait.jpg',
      canonicalMime: 'image/jpeg',
      fileSize: 1024,
      processedSha256: PROCESSED_SHA256,
      policyVersion: POLICY_VERSION,
    });
    harness.prisma.imageUploadIdempotency.findUnique.mockResolvedValue({
      clientRequestId: CLIENT_REQUEST_ID,
      createdByAdminId: ADMIN_ID,
      uploadId: UPLOAD_ID,
      requestFingerprint,
    });
    harness.prisma.imageUpload.findUnique.mockResolvedValue({
      ...activeUpload(),
      clientRequestId: CLIENT_REQUEST_ID,
      createdByAdminId: ADMIN_ID,
      processedSha256: PROCESSED_SHA256,
      policyVersion: POLICY_VERSION,
      presignExpiresAt: NOW,
      expiresAt: NOW,
    });

    await expect(
      harness.createService().getUploadUrl(uploadRequest, ADMIN_ID),
    ).resolves.toMatchObject({
      outcome: 'failed',
      code: 'upload_failed',
      failureCode: 'upload_expired',
      uploadId: UPLOAD_ID,
    });
    expect(harness.storage.signFixedExpiryPut).not.toHaveBeenCalled();
    expect(harness.prisma.imageUpload.updateMany).toHaveBeenCalledWith({
      where: {
        id: UPLOAD_ID,
        createdByAdminId: ADMIN_ID,
        status: 'pending',
        presignExpiresAt: NOW,
      },
      data: expect.objectContaining({
        status: 'failed',
        failureCode: 'upload_expired',
        temporaryCleanupState: 'pending',
        temporaryCleanupNextAttemptAt: NOW,
      }),
    });
  });

  it('atomically terminalizes only its pending session and idempotency outcome when signing fails', async () => {
    const harness = createHarness();
    harness.storage.signFixedExpiryPut.mockRejectedValueOnce(
      new Error('provider unavailable'),
    );

    await expect(
      harness.createService().getUploadUrl(uploadRequest, ADMIN_ID),
    ).resolves.toEqual({
      outcome: 'failed',
      statusCode: 409,
      code: 'upload_failed',
      message: 'Upload session has failed',
      failureCode: 'upload_presign_failed',
      uploadId: expect.any(String),
    });
    expect(harness.prisma.$transaction).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      { isolationLevel: 'Serializable' },
    );
    expect(harness.prisma.imageUpload.updateMany).toHaveBeenCalledWith({
      where: {
        id: expect.any(String),
        createdByAdminId: ADMIN_ID,
        status: 'pending',
        presignExpiresAt: new Date('2026-07-12T13:00:00.000Z'),
      },
      data: expect.objectContaining({
        status: 'failed',
        failureCode: 'upload_presign_failed',
        terminalAt: NOW,
        resultRetentionExpiresAt: new Date('2026-08-11T12:00:00.000Z'),
        temporaryCleanupState: 'pending',
        temporaryCleanupNextAttemptAt: NOW,
      }),
    });
    expect(
      harness.prisma.imageUploadIdempotency.updateMany,
    ).toHaveBeenCalledWith({
      where: {
        clientRequestId: CLIENT_REQUEST_ID,
        createdByAdminId: ADMIN_ID,
        uploadId: expect.any(String),
        terminalOutcome: null,
      },
      data: {
        terminalOutcome: 'failed',
        failureCode: 'upload_presign_failed',
        terminalAt: NOW,
        resultRetentionExpiresAt: new Date('2026-08-11T12:00:00.000Z'),
      },
    });
  });

  it('re-reads and returns a concurrent finalizing winner when signing-failure CAS loses', async () => {
    const harness = createHarness();
    harness.storage.signFixedExpiryPut.mockRejectedValueOnce(
      new Error('provider unavailable'),
    );
    harness.prisma.imageUpload.updateMany.mockImplementationOnce(async () => {
      harness.rows.upload = {
        ...harness.rows.upload,
        status: 'finalizing',
        finalizationStartedAt: NOW,
      };
      return { count: 0 };
    });

    await expect(
      harness.createService().getUploadUrl(uploadRequest, ADMIN_ID),
    ).resolves.toEqual({
      outcome: 'finalizing',
      statusCode: 409,
      code: 'upload_finalizing',
      message: 'Upload session is being finalized',
      retryAfter: '2026-07-12T12:10:00.000Z',
      uploadId: expect.any(String),
    });
    expect(
      harness.prisma.imageUploadIdempotency.updateMany,
    ).not.toHaveBeenCalled();
  });

  it.each([
    ['pending', { outcome: 'pending', statusCode: 200 }],
    ['finalizing', { outcome: 'finalizing', statusCode: 409 }],
    ['failed', { outcome: 'failed', statusCode: 409 }],
  ])('returns the closed %s status outcome', async (status, expected) => {
    const harness = createHarness(
      activeUpload({
        status: status as UploadRow['status'],
        finalizationStartedAt: status === 'finalizing' ? NOW : null,
        ...(status === 'failed'
          ? { failureCode: 'upload_abandoned', terminalAt: NOW }
          : {}),
      } as Partial<UploadRow>),
    );

    await expect(
      harness.createService().getUploadStatus(UPLOAD_ID, ADMIN_ID),
    ).resolves.toEqual(expect.objectContaining(expected));
  });

  it('returns the same non-enumerating envelope for an unknown or foreign-owned session', async () => {
    const unknown = createHarness();
    unknown.prisma.imageUpload.findUnique.mockResolvedValueOnce(null);
    const foreign = createHarness({
      ...activeUpload(),
      createdByAdminId: 'another-admin',
    } as UploadRow);

    for (const harness of [unknown, foreign]) {
      await expect(
        harness.createService().getUploadStatus(UPLOAD_ID, ADMIN_ID),
      ).rejects.toMatchObject({
        response: {
          statusCode: 404,
          code: 'upload_not_found',
          message: 'Upload session was not found',
        },
      });
    }
  });

  it('replays consumed, deleted, unavailable, and gone outcomes from durable result facts', async () => {
    const retainedUntil = new Date('2026-08-11T12:00:00.000Z');
    const consumed = createHarness({
      ...activeUpload(),
      status: 'consumed',
      createdByAdminId: ADMIN_ID,
      resultImageId: 'image-1',
      terminalAt: NOW,
      resultRetentionExpiresAt: retainedUntil,
    } as UploadRow);
    consumed.prisma.image.findUnique.mockResolvedValueOnce({
      id: 'image-1',
      thumbnailUrl: 'stored://one',
    });
    await expect(
      consumed.createService().getUploadStatus(UPLOAD_ID, ADMIN_ID),
    ).resolves.toEqual(
      expect.objectContaining({
        outcome: 'consumed',
        resultImageId: 'image-1',
        retentionExpiresAt: retainedUntil.toISOString(),
        image: expect.objectContaining({ id: 'image-1' }),
      }),
    );

    const deleted = createHarness({
      ...consumed.rows.upload,
      resultDeletedAt: NOW,
    } as UploadRow);
    await expect(
      deleted.createService().getUploadStatus(UPLOAD_ID, ADMIN_ID),
    ).resolves.toEqual(
      expect.objectContaining({
        outcome: 'deleted',
        code: 'upload_result_deleted',
      }),
    );

    const unavailable = createHarness(consumed.rows.upload as UploadRow);
    unavailable.prisma.image.findUnique.mockResolvedValueOnce(null);
    await expect(
      unavailable.createService().getUploadStatus(UPLOAD_ID, ADMIN_ID),
    ).resolves.toEqual(
      expect.objectContaining({
        outcome: 'unavailable',
        code: 'upload_result_unavailable',
      }),
    );

    jest.setSystemTime(retainedUntil);
    await expect(
      consumed.createService().getUploadStatus(UPLOAD_ID, ADMIN_ID),
    ).resolves.toEqual(
      expect.objectContaining({
        outcome: 'gone',
        code: 'upload_session_gone',
      }),
    );
  });

  it('returns gone for idempotent presign at the retained-result boundary without replacement or signing', async () => {
    const retainedUntil = new Date('2026-07-12T12:00:00.000Z');
    const harness = createHarness({
      ...activeUpload(),
      status: 'consumed',
      createdByAdminId: ADMIN_ID,
      resultImageId: 'image-1',
      terminalAt: new Date('2026-06-12T12:00:00.000Z'),
      resultRetentionExpiresAt: retainedUntil,
    } as UploadRow);
    const requestFingerprint = createImageUploadRequestFingerprint({
      clientRequestId: CLIENT_REQUEST_ID,
      createdByAdminId: ADMIN_ID,
      albumId: ALBUM_ID,
      normalizedFilename: 'portrait.jpg',
      canonicalMime: 'image/jpeg',
      fileSize: 1024,
      processedSha256: PROCESSED_SHA256,
      policyVersion: POLICY_VERSION,
    });
    harness.prisma.imageUploadIdempotency.findUnique.mockResolvedValueOnce({
      clientRequestId: CLIENT_REQUEST_ID,
      createdByAdminId: ADMIN_ID,
      uploadId: UPLOAD_ID,
      requestFingerprint,
      terminalOutcome: 'consumed',
    });

    await expect(
      harness.createService().getUploadUrl(uploadRequest, ADMIN_ID),
    ).resolves.toEqual(
      expect.objectContaining({
        outcome: 'gone',
        code: 'upload_session_gone',
      }),
    );
    expect(harness.prisma.imageUpload.create).not.toHaveBeenCalled();
    expect(harness.storage.signFixedExpiryPut).not.toHaveBeenCalled();
  });

  it('abandons only an owned pending session and atomically records cleanup and idempotency outcome', async () => {
    const harness = createHarness({
      ...activeUpload(),
      createdByAdminId: ADMIN_ID,
      clientRequestId: CLIENT_REQUEST_ID,
      presignExpiresAt: new Date('2026-07-12T13:00:00.000Z'),
    } as UploadRow);

    await expect(
      harness.createService().abandonUpload(UPLOAD_ID, ADMIN_ID),
    ).resolves.toEqual(
      expect.objectContaining({
        outcome: 'abandoned',
        code: 'upload_abandoned',
      }),
    );
    expect(harness.prisma.imageUpload.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: UPLOAD_ID,
        createdByAdminId: ADMIN_ID,
        status: 'pending',
      }),
      data: expect.objectContaining({
        status: 'failed',
        failureCode: 'upload_abandoned',
        temporaryCleanupState: 'pending',
        temporaryCleanupNextAttemptAt: NOW,
      }),
    });
    expect(
      harness.prisma.imageUploadIdempotency.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          terminalOutcome: 'failed',
          failureCode: 'upload_abandoned',
        }),
      }),
    );
    expect(harness.rows.upload.presignExpiresAt).toEqual(
      new Date('2026-07-12T13:00:00.000Z'),
    );
  });

  it.each([
    ['finalizing', { outcome: 'finalizing', code: 'upload_finalizing' }],
    ['consumed', { outcome: 'consumed', code: 'upload_consumed' }],
    ['failed', { outcome: 'abandoned', code: 'upload_abandoned' }],
  ])('returns the stable %s abandon winner', async (status, expected) => {
    const harness = createHarness({
      ...activeUpload(),
      status: status as UploadRow['status'],
      createdByAdminId: ADMIN_ID,
      failureCode: status === 'failed' ? 'upload_abandoned' : null,
      finalizationStartedAt: status === 'finalizing' ? NOW : null,
    } as UploadRow);

    await expect(
      harness.createService().abandonUpload(UPLOAD_ID, ADMIN_ID),
    ).resolves.toEqual(expect.objectContaining(expected));
    expect(harness.prisma.imageUpload.updateMany).not.toHaveBeenCalled();
  });

  it('persists inspected promotion facts before the only CopyObject dispatch', async () => {
    const harness = createHarness();
    harness.storage.verifyObject.mockResolvedValue('source-etag');
    harness.storage.promoteObject.mockResolvedValue('destination-etag');
    const release = jest.fn();
    const semaphore = { acquire: jest.fn().mockResolvedValue(release) };
    const inspector = { inspect: jest.fn().mockResolvedValue({ digestSha256: 'b'.repeat(64), byteSize: 3, facts: { mime: 'image/jpeg', width: 10, height: 20 } }) };
    const promotions = {
      createDispatchedPromotion: jest.fn().mockResolvedValue({ uploadId: UPLOAD_ID }),
      settleCopyResponseAndCommit: jest.fn().mockResolvedValue({ uploadId: UPLOAD_ID, disposition: 'committed' }),
    };

    await harness.createCurrentService(promotions, semaphore, inspector).confirmUpload({ uploadId: UPLOAD_ID } as any);

    expect(promotions.createDispatchedPromotion.mock.invocationCallOrder[0]).toBeLessThan(harness.storage.promoteObject.mock.invocationCallOrder[0]);
    expect(promotions.createDispatchedPromotion).toHaveBeenCalledWith(expect.objectContaining({ uploadId: UPLOAD_ID, finalizationLeaseToken: expect.any(String), sourceEtag: 'source-etag', inspectedSha256: 'b'.repeat(64), inspectedWidth: 10, inspectedHeight: 20 }));
    expect(harness.storage.promoteObject).toHaveBeenCalledTimes(1);
    expect(promotions.settleCopyResponseAndCommit).toHaveBeenCalledWith(expect.objectContaining({ copyResponseEtag: 'destination-etag' }));
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('returns the consumed response envelope after current confirmation commits', async () => {
    const harness = createHarness();
    harness.storage.verifyObject.mockResolvedValue('source-etag');
    harness.storage.promoteObject.mockResolvedValue('destination-etag');
    const release = jest.fn();
    const semaphore = { acquire: jest.fn().mockResolvedValue(release) };
    const inspector = {
      inspect: jest.fn().mockResolvedValue({
        digestSha256: 'b'.repeat(64),
        byteSize: 3,
        facts: { mime: 'image/jpeg', width: 10, height: 20 },
      }),
    };
    const promotions = {
      createDispatchedPromotion: jest.fn().mockResolvedValue({
        id: 'promotion-1',
        uploadId: UPLOAD_ID,
      }),
      settleCopyResponseAndCommit: jest.fn().mockImplementation(
        async ({ image, observedAt, resultRetentionExpiresAt }: any) => {
          harness.rows.upload = {
            ...harness.rows.upload,
            status: 'consumed',
            consumedAt: observedAt,
            terminalAt: observedAt,
            resultImageId: image.id,
            resultDeletedAt: null,
            resultRetentionExpiresAt,
          };
          harness.prisma.image.findUnique.mockResolvedValue(image);
          return {
            uploadId: UPLOAD_ID,
            disposition: 'committed',
            committedResultImageId: image.id,
          };
        },
      ),
    };

    await expect(
      harness
        .createCurrentService(promotions, semaphore, inspector)
        .confirmUpload({ uploadId: UPLOAD_ID } as any, ADMIN_ID),
    ).resolves.toEqual(
      expect.objectContaining({
        outcome: 'consumed',
        statusCode: 200,
        uploadId: UPLOAD_ID,
        image: expect.objectContaining({
          id: expect.any(String),
          thumbnailUrl: expect.stringMatching(/^presented:\/\//),
        }),
        resultImageId: expect.any(String),
        resultDeletedAt: null,
        retentionExpiresAt: '2026-08-11T12:00:00.000Z',
      }),
    );
  });

  it('hides a session owned by another admin before HEAD or body access', async () => {
    const harness = createHarness();
    const service = harness.createCurrentService({}, { acquire: jest.fn() }, { inspect: jest.fn() });
    await expect(service.confirmUpload({ uploadId: UPLOAD_ID } as any, 'other-admin')).rejects.toThrow('Upload session not found');
    expect(harness.storage.verifyObject).not.toHaveBeenCalled();
    expect(harness.storage.readObjectBytes).not.toHaveBeenCalled();
  });

  it('terminalizes a definitive HEAD mismatch but leaves transient HEAD failure unchanged', async () => {
    const definitive = createHarness();
    definitive.storage.verifyObject.mockRejectedValueOnce(new BadRequestException('metadata mismatch'));
    await expect(definitive.createCurrentService({}, { acquire: jest.fn() }, { inspect: jest.fn() }).confirmUpload({ uploadId: UPLOAD_ID } as any, ADMIN_ID)).rejects.toBeInstanceOf(BadRequestException);
    expect(definitive.prisma.imageUpload.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ failureCode: 'upload_source_changed' }) }));
    expect(definitive.prisma.imageUploadIdempotency.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ terminalOutcome: 'failed', failureCode: 'upload_source_changed' }) }));

    const transient = createHarness();
    transient.storage.verifyObject.mockRejectedValueOnce(new Error('network timeout'));
    await expect(transient.createCurrentService({}, { acquire: jest.fn() }, { inspect: jest.fn() }).confirmUpload({ uploadId: UPLOAD_ID } as any, ADMIN_ID)).rejects.toThrow('network timeout');
    expect(transient.prisma.imageUpload.updateMany).not.toHaveBeenCalled();
  });

  it('survives a new ImagesService instance by loading and consuming the persisted session', async () => {
    const harness = createHarness();
    const restartedService = harness.createService();

    await expect(
      restartedService.confirmUpload({ uploadId: UPLOAD_ID } as any),
    ).resolves.toEqual(expect.objectContaining({ r2ObjectKey: FINAL_KEY }));

    expect(harness.prisma.imageUpload.findUnique).toHaveBeenCalledWith({
      where: { id: UPLOAD_ID },
    });
    expect(harness.storage.verifyObject).toHaveBeenCalledWith(UPLOAD_KEY, {
      contentType: 'image/jpeg',
      fileSize: 1024,
    });
    expect(harness.storage.promoteObject).toHaveBeenCalledWith(
      UPLOAD_KEY,
      FINAL_KEY,
      '"source-etag"',
      { contentType: 'image/jpeg', fileSize: 1024 },
    );
    expect(harness.prisma.image.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        albumId: ALBUM_ID,
        r2ObjectKey: FINAL_KEY,
        uploadStatus: 'completed',
      }),
    });
    expect(harness.prisma.album.update).toHaveBeenCalledWith({
      where: { id: ALBUM_ID },
      data: { imageCount: { increment: 1 } },
    });
    expect(harness.rows.images).toEqual([
      expect.objectContaining({ r2ObjectKey: FINAL_KEY }),
    ]);
  });

  it('rejects an expired session without reading or promoting its temporary object', async () => {
    const harness = createHarness(
      activeUpload({ expiresAt: new Date(NOW.getTime() - 1) }),
    );

    await expect(
      harness.createService().confirmUpload({ uploadId: UPLOAD_ID } as any),
    ).rejects.toThrow('Upload session has expired');

    expect(harness.prisma.imageUpload.findUnique).toHaveBeenCalledWith({
      where: { id: UPLOAD_ID },
    });
    expect(harness.storage.verifyObject).not.toHaveBeenCalled();
    expect(harness.storage.promoteObject).not.toHaveBeenCalled();
    expect(harness.rows.images).toHaveLength(0);
  });

  it('rejects an already consumed session without creating a second image row', async () => {
    const consumedAt = new Date(NOW.getTime() - 60_000);
    const harness = createHarness(
      activeUpload({ status: 'consumed', consumedAt }),
    );

    await expect(
      harness.createService().confirmUpload({ uploadId: UPLOAD_ID } as any),
    ).rejects.toThrow('Upload session has already been consumed');

    expect(harness.storage.promoteObject).not.toHaveBeenCalled();
    expect(harness.prisma.image.create).not.toHaveBeenCalled();
    expect(harness.rows.images).toEqual([]);
  });

  it('rejects a finalizing session while its ten-minute lease is still active', async () => {
    const harness = createHarness(
      activeUpload({
        status: 'finalizing',
        sourceEtag: '"source-etag"',
        finalizationStartedAt: new Date(NOW.getTime() - 9 * 60 * 1000),
      }),
    );

    await expect(
      harness.createService().confirmUpload({ uploadId: UPLOAD_ID } as any),
    ).rejects.toThrow('Upload session is already being finalized');

    expect(harness.storage.verifyObject).not.toHaveBeenCalled();
    expect(harness.storage.promoteObject).not.toHaveBeenCalled();
    expect(harness.prisma.imageUpload.updateMany).not.toHaveBeenCalled();
  });

  it('reclaims a stale finalizing session when its temporary object ETag still matches', async () => {
    const staleLeaseStartedAt = new Date(NOW.getTime() - 11 * 60 * 1000);
    const harness = createHarness(
      activeUpload({
        status: 'finalizing',
        sourceEtag: '"source-etag"',
        finalizationStartedAt: staleLeaseStartedAt,
      }),
    );
    harness.prisma.imageUpload.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    await expect(
      harness.createService().confirmUpload({ uploadId: UPLOAD_ID } as any),
    ).resolves.toEqual(expect.objectContaining({ r2ObjectKey: FINAL_KEY }));

    expect(harness.prisma.imageUpload.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: UPLOAD_ID,
        status: 'finalizing',
        sourceEtag: '"source-etag"',
        finalizationStartedAt: {
          lte: new Date(NOW.getTime() - 10 * 60 * 1000),
        },
      },
      data: {
        status: 'pending',
        sourceEtag: null,
        finalizationStartedAt: null,
      },
    });
    expect(harness.storage.promoteObject).toHaveBeenCalledTimes(1);
  });

  it('fails a stale finalizing session when its temporary object ETag changed', async () => {
    const harness = createHarness(
      activeUpload({
        status: 'finalizing',
        sourceEtag: '"original-etag"',
        finalizationStartedAt: new Date(NOW.getTime() - 11 * 60 * 1000),
      }),
    );
    harness.storage.verifyObject.mockResolvedValueOnce('"replacement-etag"');

    await expect(
      harness.createService().confirmUpload({ uploadId: UPLOAD_ID } as any),
    ).rejects.toThrow('Uploaded object ETag does not match finalizing lease');

    expect(harness.prisma.imageUpload.updateMany).toHaveBeenCalledWith({
      where: {
        id: UPLOAD_ID,
        status: 'finalizing',
        sourceEtag: '"original-etag"',
      },
      data: { status: 'failed' },
    });
    expect(harness.prisma.imageUpload.update).not.toHaveBeenCalled();
    expect(harness.storage.promoteObject).not.toHaveBeenCalled();
    expect(harness.prisma.image.create).not.toHaveBeenCalled();
  });

  it('rejects a missing temporary object and marks the persisted session failed', async () => {
    const harness = createHarness();
    harness.storage.verifyObject.mockRejectedValueOnce(
      new BadRequestException('Uploaded object not found'),
    );

    await expect(
      harness.createService().confirmUpload({ uploadId: UPLOAD_ID } as any),
    ).rejects.toThrow('Uploaded object not found');

    expect(harness.storage.verifyObject).toHaveBeenCalledWith(UPLOAD_KEY, {
      contentType: 'image/jpeg',
      fileSize: 1024,
    });
    expect(harness.prisma.imageUpload.update).toHaveBeenCalledWith({
      where: { id: UPLOAD_ID },
      data: { status: 'failed' },
    });
    expect(harness.storage.promoteObject).not.toHaveBeenCalled();
    expect(harness.rows.images).toEqual([]);
  });

  it.each([
    ['size', new BadRequestException('Uploaded object size does not match')],
    [
      'content type',
      new BadRequestException('Uploaded object content type does not match'),
    ],
  ])(
    'rejects a temporary object with mismatched %s metadata',
    async (_label, verificationError) => {
      const harness = createHarness();
      harness.storage.verifyObject.mockRejectedValueOnce(verificationError);

      await expect(
        harness.createService().confirmUpload({ uploadId: UPLOAD_ID } as any),
      ).rejects.toThrow(verificationError.message);

      expect(harness.storage.verifyObject).toHaveBeenCalledWith(UPLOAD_KEY, {
        contentType: 'image/jpeg',
        fileSize: 1024,
      });
      expect(harness.prisma.imageUpload.update).toHaveBeenCalledWith({
        where: { id: UPLOAD_ID },
        data: { status: 'failed' },
      });
      expect(harness.prisma.image.create).not.toHaveBeenCalled();
    },
  );

  it('copies with the verified ETag and persists only the immutable final object key on the image', async () => {
    const harness = createHarness();

    await harness.createService().confirmUpload({ uploadId: UPLOAD_ID } as any);

    expect(harness.prisma.imageUpload.updateMany).toHaveBeenCalledWith({
      where: { id: UPLOAD_ID, status: 'pending' },
      data: expect.objectContaining({
        status: 'finalizing',
        sourceEtag: '"source-etag"',
        finalizationStartedAt: expect.any(Date),
      }),
    });
    expect(harness.storage.promoteObject).toHaveBeenCalledWith(
      UPLOAD_KEY,
      FINAL_KEY,
      '"source-etag"',
      { contentType: 'image/jpeg', fileSize: 1024 },
    );
    expect(harness.prisma.image.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ r2ObjectKey: FINAL_KEY }),
    });
    expect(harness.prisma.image.create).not.toHaveBeenCalledWith({
      data: expect.objectContaining({ r2ObjectKey: UPLOAD_KEY }),
    });
    expect(harness.rows.images[0]).toEqual(
      expect.objectContaining({ r2ObjectKey: FINAL_KEY }),
    );
  });

  it('does not copy again or change the canonical final object when a presigned PUT is replayed', async () => {
    const harness = createHarness();
    harness.prisma.imageUpload.findUnique
      .mockResolvedValueOnce(activeUpload())
      .mockResolvedValueOnce(
        activeUpload({ status: 'consumed', consumedAt: NOW }),
      );

    await harness.createService().confirmUpload({ uploadId: UPLOAD_ID } as any);
    await expect(
      harness.createService().confirmUpload({ uploadId: UPLOAD_ID } as any),
    ).rejects.toThrow('Upload session has already been consumed');

    expect(harness.storage.promoteObject).toHaveBeenCalledTimes(1);
    expect(harness.prisma.image.create).toHaveBeenCalledTimes(1);
    expect(harness.rows.images).toEqual([
      expect.objectContaining({ r2ObjectKey: FINAL_KEY }),
    ]);
  });

  it('creates one image and increments imageCount once when the same session is confirmed twice', async () => {
    const harness = createHarness();
    harness.prisma.imageUpload.findUnique
      .mockResolvedValueOnce(activeUpload())
      .mockResolvedValueOnce(
        activeUpload({ status: 'consumed', consumedAt: NOW }),
      );

    await harness.createService().confirmUpload({ uploadId: UPLOAD_ID } as any);
    await expect(
      harness.createService().confirmUpload({ uploadId: UPLOAD_ID } as any),
    ).rejects.toThrow();

    expect(harness.prisma.image.create).toHaveBeenCalledTimes(1);
    expect(harness.prisma.album.update).toHaveBeenCalledTimes(1);
    expect(harness.rows.images).toHaveLength(1);
    expect(harness.rows.images[0]).toEqual(
      expect.objectContaining({ r2ObjectKey: FINAL_KEY }),
    );
  });

  it('allows only one of two concurrent confirms to reserve the fiftieth album slot', async () => {
    const first = activeUpload();
    const second = activeUpload({
      id: SECOND_UPLOAD_ID,
      uploadObjectKey: `uploads/${SECOND_UPLOAD_ID}/portrait.jpg`,
      finalObjectKey: `albums/${ALBUM_ID}/00000000-0000-4000-8000-000000000005-portrait.jpg`,
    });
    const harness = createHarness(first);
    harness.prisma.imageUpload.findUnique.mockImplementation(
      async ({ where }: any) =>
        where.id === SECOND_UPLOAD_ID ? second : first,
    );
    harness.prisma.image.count.mockResolvedValue(49);
    harness.prisma.imageUpload.count.mockResolvedValue(0);
    harness.prisma.imageUpload.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const results = await Promise.allSettled([
      harness.createService().confirmUpload({ uploadId: UPLOAD_ID } as any),
      harness
        .createService()
        .confirmUpload({ uploadId: SECOND_UPLOAD_ID } as any),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(harness.prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      {
        isolationLevel: 'Serializable',
      },
    );
    expect(harness.storage.promoteObject).toHaveBeenCalledTimes(1);
    expect(harness.rows.images).toHaveLength(1);
  });

  it('assigns distinct order indexes to concurrently successful confirms', async () => {
    const first = activeUpload();
    const second = activeUpload({
      id: SECOND_UPLOAD_ID,
      uploadObjectKey: `uploads/${SECOND_UPLOAD_ID}/portrait.jpg`,
      finalObjectKey: `albums/${ALBUM_ID}/00000000-0000-4000-8000-000000000005-portrait.jpg`,
    });
    const harness = createHarness(first);
    harness.prisma.imageUpload.findUnique.mockImplementation(
      async ({ where }: any) =>
        where.id === SECOND_UPLOAD_ID ? second : first,
    );
    harness.prisma.image.findFirst
      .mockResolvedValueOnce({ orderIndex: 50 })
      .mockResolvedValueOnce({ orderIndex: 51 });

    await Promise.all([
      harness.createService().confirmUpload({ uploadId: UPLOAD_ID } as any),
      harness
        .createService()
        .confirmUpload({ uploadId: SECOND_UPLOAD_ID } as any),
    ]);

    const orderIndexes = harness.rows.images.map((image) => image.orderIndex);
    expect(orderIndexes).toEqual(expect.arrayContaining([51, 52]));
    expect(new Set(orderIndexes).size).toBe(2);
    expect(harness.prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      {
        isolationLevel: 'Serializable',
      },
    );
  });

  it('keeps an active upload session when album deletion is rejected by the restrict foreign key', async () => {
    const harness = createHarness();
    const foreignKeyError = Object.assign(
      new Error('Foreign key constraint failed'),
      { code: 'P2003' },
    );
    harness.prisma.album.delete.mockRejectedValueOnce(foreignKeyError);

    await expect(
      harness.prisma.album.delete({ where: { id: ALBUM_ID } }),
    ).rejects.toMatchObject({
      code: 'P2003',
    });

    expect(harness.prisma.album.delete).toHaveBeenCalledWith({
      where: { id: ALBUM_ID },
    });
    expect(harness.rows.upload).toEqual(
      expect.objectContaining({
        id: UPLOAD_ID,
        albumId: ALBUM_ID,
        status: 'pending',
      }),
    );
  });
});
