import { ConflictException } from '@nestjs/common';
import { AlbumsService } from './albums.service';

const ALBUM_ID = '00000000-0000-4000-8000-000000000001';
const r2Image = { id: 'image-1', r2ObjectKey: 'albums/a/photo.jpg' };
const lateConfirmedImage = {
  id: 'image-2',
  r2ObjectKey: 'albums/a/late-confirm.jpg',
};

function createHarness(
  options: {
    activeUploads?: number;
    images?: Array<{ id: string; r2ObjectKey: string | null }>;
    lockCount?: number;
    persistedDeleteStatus?: string;
  } = {},
) {
  const queuedObjects = new Map<string, Record<string, unknown>>();
  const tx: any = {
    imageObjectDeletion: {
      upsert: jest.fn().mockImplementation(async ({ create }: any) => {
        queuedObjects.set(`${create.provider}:${create.objectKey}`, create);
        return create;
      }),
    },
    imageUpload: {
      count: jest.fn().mockResolvedValue(options.activeUploads ?? 0),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    album: {
      findUnique: jest.fn().mockResolvedValue({
        id: ALBUM_ID,
        deleteStatus: 'deleting',
        images: options.images ?? [r2Image],
      }),
      delete: jest.fn(),
    },
  };
  const prisma: any = {
    album: {
      updateMany: jest
        .fn()
        .mockResolvedValue({ count: options.lockCount ?? 1 }),
      findUnique: jest.fn().mockResolvedValue({
        id: ALBUM_ID,
        deleteStatus: options.persistedDeleteStatus ?? 'deleting',
        images: [r2Image],
      }),
    },
    imageUpload: {
      count: jest.fn().mockResolvedValue(options.activeUploads ?? 0),
    },
    $transaction: jest.fn(async (work: (client: typeof tx) => unknown) =>
      work(tx),
    ),
  };
  const uploadCleanup = { cleanupExpired: jest.fn().mockResolvedValue({}) };
  return {
    prisma,
    tx,
    uploadCleanup,
    queuedObjects,
    service: new AlbumsService(prisma, {} as any, uploadCleanup as any),
  };
}

describe('AlbumsService durable deletion', () => {
  it('locks the album before cleanup and returns 409 when the transaction sees an active upload', async () => {
    const { prisma, tx, uploadCleanup, service } = createHarness({
      activeUploads: 1,
    });

    await expect(service.remove(ALBUM_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(prisma.album.updateMany).toHaveBeenCalledWith({
      where: { id: ALBUM_ID, deleteStatus: 'active' },
      data: {
        deleteStatus: 'deleting',
        deleteStartedAt: expect.any(Date),
      },
    });
    expect(prisma.album.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      uploadCleanup.cleanupExpired.mock.invocationCallOrder[0],
    );
    expect(tx.imageUpload.count).toHaveBeenCalledWith({
      where: {
        albumId: ALBUM_ID,
        status: { in: ['pending', 'finalizing'] },
      },
    });
    expect(tx.imageObjectDeletion.upsert).not.toHaveBeenCalled();
    expect(tx.album.delete).not.toHaveBeenCalled();
  });

  it('queues an image confirmed after the deletion lock by reading a fresh snapshot in the transaction', async () => {
    const { prisma, tx, queuedObjects, service } = createHarness({
      images: [r2Image, lateConfirmedImage],
    });

    await expect(service.remove(ALBUM_ID)).resolves.toEqual({
      message: 'Album deleted successfully',
      imagesDeleted: 2,
    });

    expect(prisma.album.findUnique).not.toHaveBeenCalled();
    expect(tx.album.findUnique).toHaveBeenCalledWith({
      where: { id: ALBUM_ID },
      include: { images: { where: { r2ObjectKey: { not: null } } } },
    });
    expect([...queuedObjects.keys()]).toEqual([
      `r2:${r2Image.r2ObjectKey}`,
      `r2:${lateConfirmedImage.r2ObjectKey}`,
    ]);
    expect(tx.album.delete).toHaveBeenCalledWith({ where: { id: ALBUM_ID } });
  });

  it('retries a P2034 deletion transaction without creating duplicate queue identities', async () => {
    const { prisma, tx, queuedObjects, service } = createHarness({
      images: [r2Image],
    });
    let attempts = 0;
    prisma.$transaction.mockImplementation(
      async (work: (client: typeof tx) => unknown) => {
        attempts++;
        const result = await work(tx);
        if (attempts === 1) {
          throw Object.assign(new Error('write conflict'), { code: 'P2034' });
        }
        return result;
      },
    );

    await expect(service.remove(ALBUM_ID)).resolves.toEqual(
      expect.objectContaining({ imagesDeleted: 1 }),
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.imageObjectDeletion.upsert).toHaveBeenCalledTimes(2);
    expect(queuedObjects.size).toBe(1);
    expect([...queuedObjects.keys()]).toEqual([`r2:${r2Image.r2ObjectKey}`]);
  });

  it('continues a retry when the album is already persisted as deleting', async () => {
    const { prisma, tx, service } = createHarness({
      lockCount: 0,
      persistedDeleteStatus: 'deleting',
    });

    await expect(service.remove(ALBUM_ID)).resolves.toEqual(
      expect.objectContaining({ imagesDeleted: 1 }),
    );

    expect(prisma.album.findUnique).toHaveBeenCalledWith({
      where: { id: ALBUM_ID },
      select: { deleteStatus: true },
    });
    expect(tx.album.delete).toHaveBeenCalledTimes(1);
  });
});
