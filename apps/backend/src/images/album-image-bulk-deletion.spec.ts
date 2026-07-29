import { BadRequestException } from '@nestjs/common';
import { ImagesService } from './images.service';

const ALBUM_ID = '00000000-0000-4000-8000-000000000001';

function image(
  id: string,
  orderIndex: number,
  r2ObjectKey = `albums/${ALBUM_ID}/${id}.webp`,
) {
  return {
    id,
    albumId: ALBUM_ID,
    filename: `${id}.webp`,
    r2ObjectKey,
    uploadStatus: 'completed',
    orderIndex,
  };
}

function createDeletionHarness() {
  const cover = image('cover-image', 1);
  const selected = image('selected-image', 2);
  const remaining = image('remaining-image', 3);
  const album = {
    id: ALBUM_ID,
    status: 'published',
    coverImageId: cover.id,
    deleteStatus: 'active',
    images: [cover, selected, remaining],
  };

  const tx: any = {
    $executeRawUnsafe: jest.fn(),
    album: {
      findUnique: jest.fn().mockResolvedValue(album),
      update: jest.fn().mockResolvedValue({}),
    },
    image: {
      deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      update: jest.fn().mockResolvedValue({}),
    },
    imageObjectDeletion: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    imageUploadPromotion: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    imageUpload: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    imageUploadIdempotency: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma: any = {
    image: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(async (work: (client: typeof tx) => unknown) =>
      work(tx),
    ),
  };
  const storage = { deleteObject: jest.fn() };
  const service = new ImagesService(
    prisma,
    storage as any,
    {} as any,
    { presentImage: jest.fn((value: unknown) => value) } as any,
    {} as any,
    {} as any,
    {} as any,
  );

  return { album, cover, selected, remaining, prisma, service, storage, tx };
}

describe('ImagesService atomic album image deletion', () => {
  it('deletes the selected snapshot, clears a deleted cover, drafts the album, and compacts order', async () => {
    const { cover, selected, remaining, service, storage, tx } =
      createDeletionHarness();

    await expect(
      (service as any).removeMany(ALBUM_ID, {
        imageIds: [cover.id, selected.id],
      }),
    ).resolves.toEqual({ deletedCount: 2 });

    expect(tx.image.deleteMany).toHaveBeenCalledWith({
      where: {
        albumId: ALBUM_ID,
        id: { in: [cover.id, selected.id] },
      },
    });
    expect(tx.album.update).toHaveBeenCalledWith({
      where: { id: ALBUM_ID },
      data: {
        coverImageId: null,
        imageCount: 1,
        status: 'draft',
      },
    });
    expect(tx.image.update).toHaveBeenCalledWith({
      where: { id: remaining.id },
      data: { orderIndex: 1 },
    });
    expect(tx.imageObjectDeletion.upsert).toHaveBeenCalledTimes(2);
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('allows deleting every image, leaving no cover and a draft album', async () => {
    const { album, service, tx } = createDeletionHarness();
    tx.image.deleteMany.mockResolvedValueOnce({ count: album.images.length });

    await expect(
      (service as any).removeMany(ALBUM_ID, {
        imageIds: album.images.map((item) => item.id),
      }),
    ).resolves.toEqual({ deletedCount: 3 });

    expect(tx.album.update).toHaveBeenCalledWith({
      where: { id: ALBUM_ID },
      data: {
        coverImageId: null,
        imageCount: 0,
        status: 'draft',
      },
    });
    expect(tx.image.update).not.toHaveBeenCalled();
  });

  it('rejects the whole request before writes when any selected image is outside the album snapshot', async () => {
    const { cover, service, tx } = createDeletionHarness();

    await expect(
      (service as any).removeMany(ALBUM_ID, {
        imageIds: [cover.id, 'missing-image'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.imageObjectDeletion.upsert).not.toHaveBeenCalled();
    expect(tx.image.deleteMany).not.toHaveBeenCalled();
    expect(tx.album.update).not.toHaveBeenCalled();
  });
});
