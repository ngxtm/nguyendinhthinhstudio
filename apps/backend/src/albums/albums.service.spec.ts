import { ConflictException } from '@nestjs/common';
import { AlbumsService } from './albums.service';

const ALBUM_ID = '00000000-0000-4000-8000-000000000001';
const r2Image = { id: 'image-1', r2ObjectKey: 'albums/a/photo.jpg' };

function createHarness(activeUploads = 0) {
  const tx: any = {
    imageObjectDeletion: { upsert: jest.fn() },
    imageUpload: { deleteMany: jest.fn() },
    album: { delete: jest.fn() },
  };
  const prisma: any = {
    album: {
      findUnique: jest
        .fn()
        .mockResolvedValue({
          id: ALBUM_ID,
          deleteStatus: 'active',
          images: [r2Image],
        }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    imageUpload: { count: jest.fn().mockResolvedValue(activeUploads) },
    $transaction: jest.fn(async (work: (client: typeof tx) => unknown) =>
      work(tx),
    ),
  };
  return {
    prisma,
    tx,
    service: new AlbumsService(
      prisma,
      {} as any,
      { cleanupExpired: jest.fn() } as any,
    ),
  };
}

describe('AlbumsService durable deletion', () => {
  it('locks an album and returns 409 while a presigned upload session remains active', async () => {
    const { prisma, tx, service } = createHarness(1);

    await expect(service.remove(ALBUM_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.album.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ALBUM_ID, deleteStatus: 'active' },
        data: expect.objectContaining({
          deleteStatus: 'deleting',
          deleteStartedAt: expect.any(Date),
        }),
      }),
    );
    expect(tx.album.delete).not.toHaveBeenCalled();
  });

  it('queues every object before deleting an album once uploads are inactive', async () => {
    const { tx, service } = createHarness(0);

    await expect(service.remove(ALBUM_ID)).resolves.toEqual(
      expect.objectContaining({ imagesDeleted: 1 }),
    );
    expect(tx.imageObjectDeletion.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          provider: 'r2',
          objectKey: r2Image.r2ObjectKey,
          status: 'pending',
        }),
      }),
    );
    expect(tx.imageUpload.deleteMany).toHaveBeenCalledWith({
      where: { albumId: ALBUM_ID, status: { in: ['consumed', 'failed'] } },
    });
    expect(tx.album.delete).toHaveBeenCalledWith({ where: { id: ALBUM_ID } });
  });
});
