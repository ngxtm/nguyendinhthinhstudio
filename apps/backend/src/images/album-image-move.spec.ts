import { BadRequestException } from '@nestjs/common';
import { ImagesService } from './images.service';

const SOURCE_ALBUM_ID = '00000000-0000-4000-8000-000000000001';
const TARGET_ALBUM_ID = '00000000-0000-4000-8000-000000000002';

function image(
  id: string,
  albumId: string,
  orderIndex: number,
  uploadStatus = 'completed',
) {
  return {
    id,
    albumId,
    filename: `${id}.webp`,
    r2ObjectKey: `albums/${albumId}/${id}.webp`,
    uploadStatus,
    orderIndex,
  };
}

function album(
  id: string,
  images: Array<Record<string, unknown>>,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    status: 'published',
    coverImageId: null,
    deleteStatus: 'active',
    imageCount: images.length,
    images,
    ...overrides,
  };
}

function createMoveHarness(
  options: {
    sourceImages?: Array<Record<string, unknown>>;
    targetImages?: Array<Record<string, unknown>>;
    sourceOverrides?: Record<string, unknown>;
    targetOverrides?: Record<string, unknown>;
  } = {},
) {
  const source = album(
    SOURCE_ALBUM_ID,
    options.sourceImages ?? [
      image('source-cover', SOURCE_ALBUM_ID, 1),
      image('source-selected', SOURCE_ALBUM_ID, 2),
      image('source-remaining', SOURCE_ALBUM_ID, 3),
    ],
    {
      coverImageId: 'source-cover',
      ...options.sourceOverrides,
    },
  );
  const target = album(
    TARGET_ALBUM_ID,
    options.targetImages ?? [image('target-existing', TARGET_ALBUM_ID, 1)],
    options.targetOverrides,
  );

  const tx: any = {
    $executeRawUnsafe: jest.fn(),
    album: {
      findUnique: jest.fn().mockImplementation(({ where }: any) => {
        if (where.id === SOURCE_ALBUM_ID) return source;
        if (where.id === TARGET_ALBUM_ID) return target;
        return null;
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    image: {
      update: jest.fn().mockResolvedValue({}),
    },
    imageUpload: {
      count: jest.fn().mockResolvedValue(0),
    },
  };
  const prisma: any = {
    $transaction: jest.fn(async (work: (client: typeof tx) => unknown) =>
      work(tx),
    ),
  };
  const service = new ImagesService(
    prisma,
    {} as any,
    {} as any,
    { presentImage: jest.fn((value: unknown) => value) } as any,
    {} as any,
    {} as any,
    {} as any,
  );

  return { prisma, service, source, target, tx };
}

describe('ImagesService atomic album image move', () => {
  it('moves selected images, appends them in source order, and updates source invariants', async () => {
    const { service, tx } = createMoveHarness();

    await expect(
      (service as any).moveMany(SOURCE_ALBUM_ID, {
        imageIds: ['source-cover', 'source-selected'],
        targetAlbumId: TARGET_ALBUM_ID,
      }),
    ).resolves.toEqual({ movedCount: 2 });

    expect(tx.image.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'source-remaining' },
      data: { orderIndex: 1 },
    });
    expect(tx.image.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'source-cover' },
      data: { albumId: TARGET_ALBUM_ID, orderIndex: 2 },
    });
    expect(tx.image.update).toHaveBeenNthCalledWith(3, {
      where: { id: 'source-selected' },
      data: { albumId: TARGET_ALBUM_ID, orderIndex: 3 },
    });
    expect(tx.album.update).toHaveBeenCalledWith({
      where: { id: SOURCE_ALBUM_ID },
      data: { coverImageId: null, imageCount: 1, status: 'draft' },
    });
    expect(tx.album.update).toHaveBeenCalledWith({
      where: { id: TARGET_ALBUM_ID },
      data: { imageCount: 3 },
    });
  });

  it('drafts a scheduled source album when its cover is moved', async () => {
    const { service, tx } = createMoveHarness({
      sourceOverrides: { status: 'scheduled' },
    });

    await expect(
      (service as any).moveMany(SOURCE_ALBUM_ID, {
        imageIds: ['source-cover'],
        targetAlbumId: TARGET_ALBUM_ID,
      }),
    ).resolves.toEqual({ movedCount: 1 });

    expect(tx.album.update).toHaveBeenCalledWith({
      where: { id: SOURCE_ALBUM_ID },
      data: { coverImageId: null, imageCount: 2, status: 'draft' },
    });
  });

  it('rejects invalid selections but allows a destination above the former capacity', async () => {
    const { service, tx } = createMoveHarness({
      targetImages: Array.from({ length: 49 }, (_, index) =>
        image(`target-${index}`, TARGET_ALBUM_ID, index + 1),
      ),
    });

    await expect(
      (service as any).moveMany(SOURCE_ALBUM_ID, {
        imageIds: ['missing-image'],
        targetAlbumId: TARGET_ALBUM_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.image.update).not.toHaveBeenCalled();
    expect(tx.album.update).not.toHaveBeenCalled();

    await expect(
      (service as any).moveMany(SOURCE_ALBUM_ID, {
        imageIds: ['source-selected', 'source-remaining'],
        targetAlbumId: TARGET_ALBUM_ID,
      }),
    ).resolves.toEqual({ movedCount: 2 });

    expect(tx.image.update).toHaveBeenCalled();
    expect(tx.album.update).toHaveBeenCalled();
  });
});
