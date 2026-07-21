import { AlbumsService } from './albums.service';

const ALBUM_ID = '00000000-0000-4000-8000-000000000001';
const r2Image = { id: 'image-1', r2ObjectKey: 'albums/a/photo.jpg' };
const lateConfirmedImage = {
  id: 'image-2',
  r2ObjectKey: 'albums/a/late-confirm.jpg',
};

const NOW = new Date('2026-07-12T12:00:00.000Z');

function imageRecord(id: string) {
  return {
    id,
    albumId: ALBUM_ID,
    filename: `${id}.jpg`,
    r2ObjectKey: `albums/${ALBUM_ID}/${id}.jpg`,
    uploadStatus: 'completed',
    thumbnailUrl: `stored://${id}/thumbnail`,
    smallUrl: `stored://${id}/small`,
    mediumUrl: `stored://${id}/medium`,
    largeUrl: `stored://${id}/large`,
    xlargeUrl: `stored://${id}/xlarge`,
    altText: id,
    orderIndex: 1,
    width: 2400,
    height: 1600,
    fileSizeKb: 512,
    createdAt: NOW,
  };
}

function albumRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: ALBUM_ID,
    title: 'Wedding album',
    slug: 'wedding-album',
    description: null,
    shootDate: null,
    coverImageId: null,
    status: 'draft',
    publishedAt: null,
    scheduledPublishAt: null,
    isFeatured: false,
    featuredOrder: null,
    googleDriveLink: null,
    metaTitle: null,
    metaDescription: null,
    viewCount: 0,
    imageCount: 0,
    deleteStatus: 'active',
    deleteStartedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    categories: [],
    tags: [],
    ...overrides,
  };
}

function createPresentationHarness() {
  const prisma: any = {
    album: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    image: {
      findUnique: jest.fn(),
    },
    tag: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    category: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
    },
  };
  const imagePresenter = {
    presentImage: jest.fn((image: Record<string, unknown>) => ({
      ...image,
      thumbnailUrl: `presented://${String(image.id)}`,
    })),
  };
  const uploadCleanup = { cleanupExpired: jest.fn().mockResolvedValue({}) };

  return {
    prisma,
    imagePresenter,
    service: new (AlbumsService as any)(
      prisma,
      {} as any,
      uploadCleanup,
      imagePresenter,
    ) as AlbumsService,
  };
}

function createHarness(
  options: {
    activeUploads?: number;
    images?: Array<{ id: string; r2ObjectKey: string | null }>;
    lockCount?: number;
    persistedDeleteStatus?: string;
    pendingPromotions?: number;
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
    imageUploadPromotion: {
      count: jest.fn().mockResolvedValue(options.pendingPromotions ?? 0),
    },
    album: {
      update: jest.fn(),
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
    service: new (AlbumsService as any)(
      prisma,
      {} as any,
      uploadCleanup as any,
      { presentImage: jest.fn() },
    ) as AlbumsService,
  };
}

describe('AlbumsService durable deletion', () => {
  it('locks the album before cleanup and returns 409 when the transaction sees an active upload', async () => {
    const { prisma, tx, uploadCleanup, service } = createHarness({
      activeUploads: 1,
    });

    await expect(service.remove(ALBUM_ID)).rejects.toMatchObject({
      response: {
        statusCode: 409,
        code: 'album_cleanup_pending',
      },
    });

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

  it('blocks deletion while a promotion disposition still needs cleanup', async () => {
    const { service } = createHarness({ pendingPromotions: 1 });

    await expect(service.remove(ALBUM_ID)).rejects.toMatchObject({
      response: {
        statusCode: 409,
        code: 'album_cleanup_pending',
      },
    });
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
    expect(tx.album.update).toHaveBeenCalledWith({
      where: { id: ALBUM_ID },
      data: { deleteStatus: 'deleted' },
    });
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
    expect(tx.album.update).toHaveBeenCalledWith({
      where: { id: ALBUM_ID },
      data: { deleteStatus: 'deleted' },
    });
  });
});

describe('AlbumsService image presentation', () => {
  it('presents a nested cover and every gallery image without mutating query rows', () => {
    const { imagePresenter, service } = createPresentationHarness();
    const coverImage = imageRecord('cover');
    const images = [imageRecord('image-1'), imageRecord('image-2')];
    const album = albumRecord({ coverImage, images });
    const snapshot = {
      coverImage: { ...coverImage },
      images: images.map((image) => ({ ...image })),
    };

    const result = service.presentAlbum(album as any);

    expect(result.coverImage.thumbnailUrl).toBe('presented://cover');
    expect(result.images.map((image: any) => image.thumbnailUrl)).toEqual([
      'presented://image-1',
      'presented://image-2',
    ]);
    expect(imagePresenter.presentImage).toHaveBeenCalledTimes(3);
    expect({ coverImage, images }).toEqual(snapshot);
  });

  it('does not add image relations to an object that did not query them', () => {
    const { imagePresenter, service } = createPresentationHarness();

    const result = service.presentAlbum(albumRecord() as any);

    expect(result).not.toHaveProperty('coverImage');
    expect(result).not.toHaveProperty('images');
    expect(imagePresenter.presentImage).not.toHaveBeenCalled();
  });

  it('presents the cover returned by create', async () => {
    const { prisma, imagePresenter, service } = createPresentationHarness();
    const coverImage = imageRecord('create-cover');
    prisma.album.findUnique.mockResolvedValueOnce(null);
    prisma.album.create.mockResolvedValueOnce(
      albumRecord({ coverImageId: coverImage.id, coverImage }),
    );

    const result = await service.create({
      title: 'Wedding album',
      status: 'draft',
    } as any);

    expect(result.coverImage.thumbnailUrl).toBe('presented://create-cover');
    expect(imagePresenter.presentImage).toHaveBeenCalledWith(coverImage);
  });

  it('presents every cover returned by findAll', async () => {
    const { prisma, imagePresenter, service } = createPresentationHarness();
    const firstCover = imageRecord('list-cover-1');
    const secondCover = imageRecord('list-cover-2');
    prisma.album.findMany.mockResolvedValueOnce([
      albumRecord({ id: 'album-1', coverImage: firstCover }),
      albumRecord({ id: 'album-2', coverImage: secondCover }),
    ]);

    const result = await service.findAll({} as any);

    expect(result.data.map((album: any) => album.coverImage.thumbnailUrl)).toEqual([
      'presented://list-cover-1',
      'presented://list-cover-2',
    ]);
    expect(imagePresenter.presentImage).toHaveBeenCalledTimes(2);
  });

  it('presents the cover and gallery returned by findBySlug', async () => {
    const { prisma, imagePresenter, service } = createPresentationHarness();
    const coverImage = imageRecord('detail-cover');
    const images = [imageRecord('detail-1'), imageRecord('detail-2')];
    prisma.album.findUnique.mockResolvedValueOnce(
      albumRecord({ coverImage, images }),
    );

    const result = await service.findBySlug('wedding-album', true);

    expect(result.coverImage.thumbnailUrl).toBe('presented://detail-cover');
    expect(result.images.map((image: any) => image.thumbnailUrl)).toEqual([
      'presented://detail-1',
      'presented://detail-2',
    ]);
    expect(imagePresenter.presentImage).toHaveBeenCalledTimes(3);
  });

  it('presents the cover returned by update', async () => {
    const { prisma, imagePresenter, service } = createPresentationHarness();
    const coverImage = imageRecord('update-cover');
    prisma.album.findUnique.mockResolvedValueOnce(albumRecord());
    prisma.album.update.mockResolvedValueOnce(
      albumRecord({ coverImageId: coverImage.id, coverImage }),
    );

    const result = await service.update(ALBUM_ID, {
      title: 'Updated album',
    } as any);

    expect(result.coverImage.thumbnailUrl).toBe('presented://update-cover');
    expect(imagePresenter.presentImage).toHaveBeenCalledWith(coverImage);
  });

  it('presents the cover and gallery returned by setCover', async () => {
    const { prisma, imagePresenter, service } = createPresentationHarness();
    const coverImage = imageRecord('set-cover');
    const images = [coverImage, imageRecord('set-cover-gallery')];
    prisma.album.findUnique.mockResolvedValueOnce(albumRecord());
    prisma.image.findUnique.mockResolvedValueOnce(coverImage);
    prisma.album.update.mockResolvedValueOnce(
      albumRecord({ coverImageId: coverImage.id, coverImage, images }),
    );

    const result = await service.setCover(ALBUM_ID, {
      imageId: coverImage.id,
    });

    expect(result.coverImage.thumbnailUrl).toBe('presented://set-cover');
    expect(result.images.map((image: any) => image.thumbnailUrl)).toEqual([
      'presented://set-cover',
      'presented://set-cover-gallery',
    ]);
    expect(imagePresenter.presentImage).toHaveBeenCalledTimes(3);
  });

  it('presents the cover returned by toggleFeatured', async () => {
    const { prisma, imagePresenter, service } = createPresentationHarness();
    const coverImage = imageRecord('featured-cover');
    prisma.album.findUnique.mockResolvedValueOnce(albumRecord());
    prisma.album.update.mockResolvedValueOnce(
      albumRecord({
        coverImageId: coverImage.id,
        coverImage,
        isFeatured: true,
        featuredOrder: 1,
      }),
    );

    const result = await service.toggleFeatured(ALBUM_ID);

    expect(result.coverImage.thumbnailUrl).toBe('presented://featured-cover');
    expect(imagePresenter.presentImage).toHaveBeenCalledWith(coverImage);
  });
});
