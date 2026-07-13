import { ConflictException } from '@nestjs/common';
import { ImagesService } from './images.service';

const imagePresenter = {
  presentImage: jest.fn((image: unknown) => image),
};

describe('ImagesService deletion guard and queue', () => {
  it('rejects a new presigned upload when its album is deleting', async () => {
    const prisma: any = {
      album: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            id: 'album-1',
            deleteStatus: 'deleting',
            _count: { images: 0 },
          }),
      },
    };
    const service = new ImagesService(
      prisma,
      {} as any,
      {} as any,
      imagePresenter as any,
    );

    await expect(
      service.getUploadUrl({
        albumId: 'album-1',
        filename: 'x.jpg',
        contentType: 'image/jpeg',
        fileSize: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('queues an R2 object, clears cover, and decrements album count without deleting from R2 inline', async () => {
    const tx: any = {
      imageObjectDeletion: { upsert: jest.fn() },
      image: { delete: jest.fn() },
      album: { update: jest.fn() },
    };
    const prisma: any = {
      image: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
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
    );

    await service.remove('image-1');

    expect(tx.imageObjectDeletion.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ provider: 'r2', status: 'pending' }),
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
});
