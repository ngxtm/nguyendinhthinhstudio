import { BadRequestException } from '@nestjs/common';
import { ImagesService } from './images.service';

const ALBUM_ID = '00000000-0000-4000-8000-000000000001';
const UPLOAD_ID = '00000000-0000-4000-8000-000000000002';
const SECOND_UPLOAD_ID = '00000000-0000-4000-8000-000000000003';
const UPLOAD_KEY = `uploads/${UPLOAD_ID}/portrait.jpg`;
const FINAL_KEY = `albums/${ALBUM_ID}/00000000-0000-4000-8000-000000000004-portrait.jpg`;
const NOW = new Date('2026-07-12T12:00:00.000Z');

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
};

const uploadRequest = {
  albumId: ALBUM_ID,
  filename: 'portrait.jpg',
  contentType: 'image/jpeg',
  fileSize: 1024,
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

    await expect(harness.createService().findByAlbum(ALBUM_ID)).resolves.toEqual([
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
    createService: () =>
      new (ImagesService as any)(prisma, storage, imageUrl, imagePresenter),
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
      harness.createService().getUploadUrl(uploadRequest),
    ).resolves.toEqual({
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
        expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
      }),
    });
    expect(harness.storage.getPresignedUploadUrl).toHaveBeenCalledWith(
      UPLOAD_KEY,
      'image/jpeg',
      1024,
    );
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
