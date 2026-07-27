import { ConflictException } from '@nestjs/common';
import { ImagesService } from './images.service';

const imagePresenter = {
  presentImage: jest.fn((image: unknown) => image),
};

describe('ImagesService deletion guard and queue', () => {
  it('rejects a new presigned upload when its album is deleting', async () => {
    const prisma: any = {
      album: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'album-1',
          deleteStatus: 'deleting',
          _count: { images: 0 },
        }),
      },
    };
    prisma.$transaction = jest.fn(
      async (work: (client: typeof prisma) => unknown) => work(prisma),
    );
    prisma.$executeRawUnsafe = jest.fn();
    const storage = {
      createUploadObjectKey: jest.fn().mockReturnValue('uploads/id/x.webp'),
      createFinalObjectKey: jest.fn().mockReturnValue('albums/album-1/x.webp'),
    };
    const service = new ImagesService(
      prisma,
      storage as any,
      {} as any,
      imagePresenter as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.getUploadUrl(
        {
          clientRequestId: '00000000-0000-4000-8000-000000000001',
          albumId: 'album-1',
          filename: 'x.webp',
          contentType: 'image/webp',
          fileSize: 1,
          processedSha256: 'a'.repeat(64),
        },
        '00000000-0000-4000-8000-000000000002',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('queues an R2 object, clears cover, and decrements album count without deleting from R2 inline', async () => {
    const tx: any = {
      imageObjectDeletion: { upsert: jest.fn() },
      imageUploadPromotion: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      imageUpload: { updateMany: jest.fn() },
      imageUploadIdempotency: { updateMany: jest.fn() },
      image: { delete: jest.fn() },
      album: { update: jest.fn() },
    };
    const prisma: any = {
      image: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'image-1',
          albumId: 'album-1',
          r2ObjectKey: 'albums/album-1/photo.jpg',
          album: { coverImageId: 'image-1' },
        }),
      },
      $transaction: jest.fn(async (work: (client: typeof tx) => unknown) =>
        work(tx),
      ),
    };
    const storage: any = { deleteObject: jest.fn() };
    const service = new ImagesService(
      prisma,
      storage,
      {} as any,
      imagePresenter as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.remove('image-1');

    expect(tx.imageObjectDeletion.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          provider: 'r2',
          status: 'pending',
          authority: 'legacy_image',
          objectKeyHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          legacyImageSnapshotSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
          providerDisposition: null,
        }),
      }),
    );
    expect(tx.album.update).toHaveBeenCalledWith({
      where: { id: 'album-1' },
      data: { coverImageId: null },
    });
    expect(tx.album.update).toHaveBeenCalledWith({
      where: { id: 'album-1' },
      data: { imageCount: { decrement: 1 } },
    });
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('stamps committed result tombstones and current-result deletion authority atomically', async () => {
    const tx: any = {
      imageObjectDeletion: { upsert: jest.fn() },
      imageUploadPromotion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'promotion-1',
          committedResultImageId: 'image-1',
          disposition: 'committed',
        }),
      },
      imageUpload: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      imageUploadIdempotency: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      image: { delete: jest.fn() },
      album: { update: jest.fn() },
    };
    const prisma: any = {
      image: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'image-1',
          albumId: 'album-1',
          r2ObjectKey: 'albums/album-1/photo.jpg',
          album: { coverImageId: null },
        }),
      },
      $transaction: jest.fn(async (work: (client: typeof tx) => unknown) =>
        work(tx),
      ),
    };

    const service = new ImagesService(
      prisma,
      { deleteObject: jest.fn() } as any,
      {} as any,
      imagePresenter as any,
      {} as any,
      {} as any,
      {} as any,
    );
    await service.remove('image-1');

    expect(tx.imageObjectDeletion.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          authority: 'current_result',
          objectKeyHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          legacyImageSnapshotSha256: null,
          providerDisposition: null,
        }),
      }),
    );
    expect(tx.imageUpload.updateMany).toHaveBeenCalledWith({
      where: { resultImageId: 'image-1' },
      data: { resultDeletedAt: expect.any(Date) },
    });
    expect(tx.imageUploadIdempotency.updateMany).toHaveBeenCalledWith({
      where: { resultImageId: 'image-1' },
      data: { resultDeletedAt: expect.any(Date) },
    });
  });
});
