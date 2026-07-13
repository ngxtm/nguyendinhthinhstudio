import { UploadCleanupService } from './upload-cleanup.service';

const NOW = new Date('2026-07-13T12:00:00.000Z');
const ONE_HOUR_MS = 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * ONE_HOUR_MS;

function createHarness(
  options: {
    expired?: Array<Record<string, unknown>>;
    consumed?: Array<Record<string, unknown>>;
    referencedFinalObjects?: number;
  } = {},
) {
  const prisma: any = {
    imageUpload: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce(options.expired ?? [])
        .mockResolvedValueOnce(options.consumed ?? []),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    image: {
      count: jest.fn().mockResolvedValue(options.referencedFinalObjects ?? 0),
    },
  };
  const storage: any = {
    deleteObject: jest.fn().mockResolvedValue(undefined),
  };
  return {
    prisma,
    storage,
    service: new UploadCleanupService(prisma, storage),
  };
}

describe('UploadCleanupService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('uses a one-hour grace period for pending/failed expiry and the finalizing lease timestamp', async () => {
    const session = {
      id: 'u1',
      status: 'pending',
      uploadObjectKey: 'uploads/u1/a.jpg',
      finalObjectKey: 'albums/a/a.jpg',
    };
    const { prisma, storage, service } = createHarness({
      expired: [session],
    });

    await expect(service.cleanupExpired()).resolves.toEqual({
      scanned: 1,
      objectsDeleted: 2,
      sessionsDeleted: 1,
      failed: 0,
    });

    const graceCutoff = new Date(NOW.getTime() - ONE_HOUR_MS);
    expect(prisma.imageUpload.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        OR: [
          {
            status: { in: ['pending', 'failed'] },
            expiresAt: { lt: graceCutoff },
          },
          {
            status: 'finalizing',
            finalizationStartedAt: { lt: graceCutoff },
          },
        ],
      },
      take: 100,
    });
    expect(prisma.imageUpload.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'u1',
        status: 'pending',
        expiresAt: { lt: graceCutoff },
      },
    });
    expect(storage.deleteObject).toHaveBeenCalledWith('uploads/u1/a.jpg');
    expect(storage.deleteObject).toHaveBeenCalledWith('albums/a/a.jpg');
  });

  it('leaves pending and finalizing sessions inside the cleanup grace window untouched', async () => {
    const { prisma, storage, service } = createHarness();

    await expect(service.cleanupExpired('album-1')).resolves.toEqual({
      scanned: 0,
      objectsDeleted: 0,
      sessionsDeleted: 0,
      failed: 0,
    });

    const graceCutoff = new Date(NOW.getTime() - ONE_HOUR_MS);
    expect(prisma.imageUpload.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        albumId: 'album-1',
        OR: [
          {
            status: { in: ['pending', 'failed'] },
            expiresAt: { lt: graceCutoff },
          },
          {
            status: 'finalizing',
            finalizationStartedAt: { lt: graceCutoff },
          },
        ],
      },
      take: 100,
    });
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(prisma.imageUpload.deleteMany).not.toHaveBeenCalled();
  });

  it('uses the stale finalizing lease in its conditional session delete', async () => {
    const session = {
      id: 'u-finalizing',
      status: 'finalizing',
      uploadObjectKey: 'uploads/u-finalizing/a.jpg',
      finalObjectKey: 'albums/a/finalizing.jpg',
    };
    const { prisma, service } = createHarness({ expired: [session] });

    await service.cleanupExpired();

    expect(prisma.imageUpload.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'u-finalizing',
        status: 'finalizing',
        finalizationStartedAt: {
          lt: new Date(NOW.getTime() - ONE_HOUR_MS),
        },
      },
    });
  });

  it('never deletes a canonical final object referenced by an Image row', async () => {
    const session = {
      id: 'u-referenced',
      status: 'failed',
      uploadObjectKey: 'uploads/u-referenced/a.jpg',
      finalObjectKey: 'albums/a/referenced.jpg',
    };
    const { storage, service } = createHarness({
      expired: [session],
      referencedFinalObjects: 1,
    });

    await service.cleanupExpired();

    expect(storage.deleteObject).toHaveBeenCalledWith(
      'uploads/u-referenced/a.jpg',
    );
    expect(storage.deleteObject).not.toHaveBeenCalledWith(
      'albums/a/referenced.jpg',
    );
  });

  it('treats already-missing R2 objects as cleaned and still deletes the session', async () => {
    const session = {
      id: 'u-missing',
      status: 'failed',
      uploadObjectKey: 'uploads/u-missing/a.jpg',
      finalObjectKey: 'albums/a/missing.jpg',
    };
    const { prisma, storage, service } = createHarness({ expired: [session] });
    storage.deleteObject.mockRejectedValue(
      Object.assign(new Error('The specified key does not exist'), {
        name: 'NoSuchKey',
        $metadata: { httpStatusCode: 404 },
      }),
    );

    await expect(service.cleanupExpired()).resolves.toEqual({
      scanned: 1,
      objectsDeleted: 0,
      sessionsDeleted: 1,
      failed: 0,
    });
    expect(storage.deleteObject).toHaveBeenCalledTimes(2);
    expect(prisma.imageUpload.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('cleans only the temporary key for consumed sessions older than seven days', async () => {
    const session = {
      id: 'u2',
      status: 'consumed',
      uploadObjectKey: 'uploads/u2/a.jpg',
      finalObjectKey: 'albums/a/a.jpg',
    };
    const { prisma, storage, service } = createHarness({
      consumed: [session],
    });

    await service.cleanupExpired();

    const consumedCutoff = new Date(NOW.getTime() - SEVEN_DAYS_MS);
    expect(prisma.imageUpload.findMany).toHaveBeenNthCalledWith(2, {
      where: {
        status: 'consumed',
        consumedAt: { lt: consumedCutoff },
      },
      take: 100,
    });
    expect(storage.deleteObject).toHaveBeenCalledWith('uploads/u2/a.jpg');
    expect(storage.deleteObject).not.toHaveBeenCalledWith('albums/a/a.jpg');
    expect(prisma.imageUpload.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'u2',
        status: 'consumed',
        consumedAt: { lt: consumedCutoff },
      },
    });
  });

  it('is idempotent when the cleanup is run again after the session is gone', async () => {
    const session = {
      id: 'u-rerun',
      status: 'pending',
      uploadObjectKey: 'uploads/u-rerun/a.jpg',
      finalObjectKey: 'albums/a/rerun.jpg',
    };
    const { prisma, storage, service } = createHarness({ expired: [session] });
    prisma.imageUpload.findMany
      .mockReset()
      .mockResolvedValueOnce([session])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await service.cleanupExpired();
    const firstRunDeletionCount = storage.deleteObject.mock.calls.length;
    await expect(service.cleanupExpired()).resolves.toEqual({
      scanned: 0,
      objectsDeleted: 0,
      sessionsDeleted: 0,
      failed: 0,
    });

    expect(storage.deleteObject).toHaveBeenCalledTimes(firstRunDeletionCount);
    expect(prisma.imageUpload.deleteMany).toHaveBeenCalledTimes(1);
  });
});
