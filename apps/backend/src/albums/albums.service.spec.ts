import { AlbumsService } from './albums.service';
import { ImagesService } from '../images/images.service';

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
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _sum: {} }),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
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
    $executeRawUnsafe: jest.fn(),
  };
  prisma.$transaction = jest.fn(
    async (work: (client: typeof prisma) => unknown) => work(prisma),
  );
  const imagePresenter = {
    presentImage: jest.fn((image: Record<string, unknown>) => ({
      ...image,
      thumbnailUrl: `presented://${String(image.id)}`,
    })),
  };
  const uploadCleanup = { cleanupExpired: jest.fn().mockResolvedValue({}) };
  const recommendationService = { clearCache: jest.fn() };
  const imagesService = { removeMany: jest.fn() };

  return {
    prisma,
    imagePresenter,
    imagesService,
    service: new (AlbumsService as any)(
      prisma,
      {} as any,
      uploadCleanup,
      imagePresenter,
      recommendationService,
      imagesService,
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
      findFirst: jest.fn().mockResolvedValue(null),
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
  const recommendationService = { clearCache: jest.fn() };
  const imagesService = new ImagesService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  jest.spyOn(imagesService, 'queueImageDeletion');
  return {
    prisma,
    tx,
    uploadCleanup,
    queuedObjects,
    imagesService,
    service: new (AlbumsService as any)(
      prisma,
      {} as any,
      uploadCleanup as any,
      { presentImage: jest.fn() },
      recommendationService,
      imagesService,
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
    const { prisma, tx, queuedObjects, imagesService, service } = createHarness(
      {
        images: [r2Image, lateConfirmedImage],
      },
    );

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
    expect(queuedObjects.get(`r2:${r2Image.r2ObjectKey}`)).toEqual(
      expect.objectContaining({
        authority: 'legacy_image',
        objectKeyHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        legacyImageSnapshotSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        providerDisposition: null,
      }),
    );
    expect(imagesService.queueImageDeletion).toHaveBeenNthCalledWith(
      1,
      tx,
      r2Image,
    );
    expect(imagesService.queueImageDeletion).toHaveBeenNthCalledWith(
      2,
      tx,
      lateConfirmedImage,
    );
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

  it('rejects creating an already-published album before it can have images or a cover', async () => {
    const { prisma, service } = createPresentationHarness();
    prisma.album.findUnique.mockResolvedValueOnce(null);
    prisma.album.create.mockResolvedValueOnce(
      albumRecord({ status: 'published' }),
    );

    await expect(
      service.create({ title: 'Wedding album', status: 'published' } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        statusCode: 400,
        code: 'album_not_publishable',
      }),
    });

    expect(prisma.album.create).not.toHaveBeenCalled();
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

    expect(
      result.data.map((album: any) => album.coverImage.thumbnailUrl),
    ).toEqual(['presented://list-cover-1', 'presented://list-cover-2']);
    expect(imagePresenter.presentImage).toHaveBeenCalledTimes(2);
  });

  it('applies admin status, search, sorting, active-state, and numbered pagination filters', async () => {
    const { prisma, service } = createPresentationHarness();
    prisma.album.findMany.mockResolvedValueOnce([
      albumRecord({ id: 'album-2', title: 'Testing 223' }),
    ]);
    prisma.album.count.mockResolvedValueOnce(49);

    const result = await service.findAdminAll({
      status: 'draft',
      search: ' testing ',
      sortBy: 'newest',
      limit: 1,
      page: 2,
    } as any);

    expect(prisma.album.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            { deleteStatus: 'active' },
            { status: 'draft' },
            {
              OR: expect.arrayContaining([
                { title: { contains: 'testing', mode: 'insensitive' } },
                { slug: { contains: 'testing', mode: 'insensitive' } },
              ]),
            },
          ]),
        },
        orderBy: [
          { publishedAt: 'desc' },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        skip: 1,
        take: 1,
      }),
    );
    expect(prisma.album.count).toHaveBeenCalledWith({
      where: {
        AND: expect.arrayContaining([
          { deleteStatus: 'active' },
          { status: 'draft' },
          {
            OR: expect.arrayContaining([
              { title: { contains: 'testing', mode: 'insensitive' } },
              { slug: { contains: 'testing', mode: 'insensitive' } },
            ]),
          },
        ]),
      },
    });
    expect(result.data).toHaveLength(1);
    expect(result.pagination).toEqual({
      hasMore: true,
      nextCursor: null,
      limit: 1,
      page: 2,
      total: 49,
      totalPages: 49,
    });
  });

  it('keeps the Admin decimal-page floor-to-one compatibility behavior', async () => {
    const { prisma, service } = createPresentationHarness();
    prisma.album.findMany.mockResolvedValueOnce([
      albumRecord({ id: 'admin-floor-page-one' }),
    ]);
    prisma.album.count.mockResolvedValueOnce(1);

    const result = await service.findAdminAll({
      limit: 1,
      page: 1.5,
    } as any);

    expect(prisma.album.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 1 }),
    );
    expect(result.pagination).toEqual({
      hasMore: false,
      nextCursor: null,
      limit: 1,
      page: 1,
      total: 1,
      totalPages: 1,
    });
  });

  it('loads the curated gallery page in sorted order and keeps the public batch small', async () => {
    const { prisma, service } = createPresentationHarness();
    const candidates = [
      albumRecord({
        id: 'older-featured',
        isFeatured: true,
        featuredOrder: 2,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        categories: [],
      }),
      albumRecord({
        id: 'new-featured',
        isFeatured: true,
        featuredOrder: 3,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        categories: [],
      }),
      albumRecord({
        id: 'beauty',
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        categories: [{ category: { slug: 'beauty' } }],
      }),
    ];
    const hydrated = candidates.map((album) => ({ ...album }));
    prisma.album.findMany
      .mockResolvedValueOnce(candidates)
      .mockResolvedValueOnce(hydrated);

    const result = await service.findAll({
      limit: 2,
      sortBy: 'gallery',
    } as any);

    expect(prisma.album.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        AND: [{ status: 'published' }, { deleteStatus: 'active' }],
      },
      select: expect.objectContaining({
        id: true,
        featuredOrder: true,
        categories: expect.any(Object),
      }),
    });
    expect(prisma.album.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: { in: ['new-featured', 'older-featured'] } },
      }),
    );
    expect(result.data.map((album: any) => album.id)).toEqual([
      'new-featured',
      'older-featured',
    ]);
    expect(result.pagination).toEqual({
      hasMore: true,
      nextCursor: 'older-featured',
      limit: 2,
    });
  });

  it('serves explicit gallery pages from the same sorted, filtered candidate set', async () => {
    const { prisma, service } = createPresentationHarness();
    const eligibleCandidates = Array.from({ length: 17 }, (_, index) =>
      albumRecord({
        id: `wedding-${String(index + 1).padStart(2, '0')}`,
        status: 'published',
        deleteStatus: 'active',
        createdAt: new Date(Date.UTC(2026, 6, 17 - index)),
        categories: [{ category: { slug: 'wedding' } }],
      }),
    );
    const candidates = [
      ...eligibleCandidates,
      albumRecord({
        id: 'portrait-published',
        status: 'published',
        deleteStatus: 'active',
        createdAt: new Date(Date.UTC(2026, 6, 19)),
        categories: [{ category: { slug: 'portrait' } }],
      }),
      albumRecord({
        id: 'wedding-draft',
        status: 'draft',
        deleteStatus: 'active',
        createdAt: new Date(Date.UTC(2026, 6, 20)),
        categories: [{ category: { slug: 'wedding' } }],
      }),
      albumRecord({
        id: 'wedding-archived',
        status: 'published',
        deleteStatus: 'deleted',
        createdAt: new Date(Date.UTC(2026, 6, 21)),
        categories: [{ category: { slug: 'wedding' } }],
      }),
    ];

    const matchesGalleryWhere = (candidate: any, where: any) => {
      const clauses = where?.AND ?? [where];
      return clauses.every((clause: any) => {
        if (clause?.status && candidate.status !== clause.status) return false;
        if (clause?.deleteStatus && candidate.deleteStatus !== clause.deleteStatus) {
          return false;
        }

        const categoryOr = clause?.categories?.some?.category?.OR;
        if (categoryOr) {
          return candidate.categories.some(({ category }: any) =>
            categoryOr.some(
              ({ id, slug }: any) =>
                (id !== undefined && category?.id === id) ||
                (slug !== undefined && category?.slug === slug),
            ),
          );
        }

        return true;
      });
    };

    prisma.album.findMany.mockImplementation(async (args: any) => {
      if (args.select) {
        return candidates.filter((candidate) =>
          matchesGalleryWhere(candidate, args.where),
        );
      }
      const ids = args.where?.id?.in ?? [];
      return candidates.filter((candidate) => ids.includes(candidate.id));
    });

    const pages = [];
    for (const page of [1, 2, 3]) {
      pages.push(
        await service.findAll({
          category: 'wedding',
          limit: 8,
          page,
          sortBy: 'gallery',
        } as any),
      );
    }

    expect(pages.map((result: any) => result.data.length)).toEqual([8, 8, 1]);
    expect(pages.map((result: any) => result.pagination)).toEqual([
      {
        hasMore: true,
        nextCursor: 'wedding-08',
        limit: 8,
        page: 1,
        total: 17,
        totalPages: 3,
      },
      {
        hasMore: true,
        nextCursor: 'wedding-16',
        limit: 8,
        page: 2,
        total: 17,
        totalPages: 3,
      },
      {
        hasMore: false,
        nextCursor: null,
        limit: 8,
        page: 3,
        total: 17,
        totalPages: 3,
      },
    ]);

    const ids = pages.flatMap((result: any) => result.data.map((album: any) => album.id));
    expect(ids).toEqual(eligibleCandidates.map((candidate) => candidate.id));
    expect(new Set(ids).size).toBe(17);
    expect(ids).not.toEqual(
      expect.arrayContaining(['portrait-published', 'wedding-draft', 'wedding-archived']),
    );
    expect(prisma.album.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          AND: [
            { status: 'published' },
            { deleteStatus: 'active' },
            {
              categories: {
                some: {
                  category: { OR: [{ id: 'wedding' }, { slug: 'wedding' }] },
                },
              },
            },
          ],
        },
      }),
    );

    const candidateCalls = prisma.album.findMany.mock.calls.filter(
      ([args]: [any]) => Boolean(args.select),
    );
    expect(candidateCalls).toHaveLength(3);
    for (const [args] of candidateCalls) {
      expect(args.where).toEqual({
        AND: [
          { status: 'published' },
          { deleteStatus: 'active' },
          {
            categories: {
              some: {
                category: { OR: [{ id: 'wedding' }, { slug: 'wedding' }] },
              },
            },
          },
        ],
      });
    }

    const hydrationCalls = prisma.album.findMany.mock.calls.filter(
      ([args]: [any]) => Boolean(args.where?.id?.in),
    );
    expect(hydrationCalls.map(([args]: [any]) => args.where.id.in)).toEqual([
      eligibleCandidates.slice(0, 8).map((candidate) => candidate.id),
      eligibleCandidates.slice(8, 16).map((candidate) => candidate.id),
      eligibleCandidates.slice(16).map((candidate) => candidate.id),
    ]);
  });

  it('rejects invalid public gallery pages and page/cursor combinations', async () => {
    const { service } = createPresentationHarness();

    for (const page of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, [2]]) {
      await expect(
        service.findAll({ page, sortBy: 'gallery', limit: 8 } as any),
      ).rejects.toMatchObject({ response: { statusCode: 400 } });
    }

    await expect(
      service.findAll({ page: 2, cursor: 'cursor', sortBy: 'gallery', limit: 8 } as any),
    ).rejects.toMatchObject({ response: { statusCode: 400 } });
  });

  it('counts only active albums in dashboard statistics', async () => {
    const { prisma, service } = createPresentationHarness();
    prisma.album.count
      .mockResolvedValueOnce(162)
      .mockResolvedValueOnce(120)
      .mockResolvedValueOnce(42);
    prisma.album.aggregate.mockResolvedValueOnce({
      _sum: { imageCount: 800, viewCount: 1400 },
    });

    await expect(service.getDashboardStats()).resolves.toEqual({
      totalAlbums: 162,
      publishedAlbums: 120,
      draftAlbums: 42,
      totalImages: 800,
      totalViews: 1400,
    });

    expect(prisma.album.count).toHaveBeenNthCalledWith(1, {
      where: { deleteStatus: 'active' },
    });
    expect(prisma.album.count).toHaveBeenNthCalledWith(2, {
      where: { status: 'published', deleteStatus: 'active' },
    });
    expect(prisma.album.count).toHaveBeenNthCalledWith(3, {
      where: { status: 'draft', deleteStatus: 'active' },
    });
    expect(prisma.album.aggregate).toHaveBeenCalledWith({
      where: { deleteStatus: 'active' },
      _sum: { imageCount: true, viewCount: true },
    });
  });

  it('presents the cover without hydrating the full public gallery in findBySlug', async () => {
    const { prisma, imagePresenter, service } = createPresentationHarness();
    const coverImage = imageRecord('detail-cover');
    prisma.album.findUnique.mockResolvedValueOnce(albumRecord({ coverImage }));

    const result = await service.findBySlug('wedding-album');

    expect(result.coverImage.thumbnailUrl).toBe('presented://detail-cover');
    expect(result.images).toBeUndefined();
    expect(prisma.album.findUnique.mock.calls[0][0].include).not.toHaveProperty(
      'images',
    );
    expect(imagePresenter.presentImage).toHaveBeenCalledTimes(1);
  });

  it('incrementView increments viewCount for an active published album via a single guarded updateMany', async () => {
    const { prisma, service } = createPresentationHarness();
    prisma.album.updateMany.mockResolvedValueOnce({ count: 1 });

    await service.incrementView('album-1');

    expect(prisma.album.updateMany).toHaveBeenCalledWith({
      where: { slug: 'album-1', status: 'published', deleteStatus: 'active' },
      data: { viewCount: { increment: 1 } },
    });
    expect(prisma.album.findUnique).not.toHaveBeenCalled();
  });

  it('incrementView is a no-op when the album is missing or deleted', async () => {
    const { prisma, service } = createPresentationHarness();
    prisma.album.updateMany.mockResolvedValueOnce({ count: 0 });

    await service.incrementView('missing');

    expect(prisma.album.updateMany).toHaveBeenCalledTimes(1);
  });

  it('findBySlug does not increment view count (delegated to incrementView)', async () => {
    const { prisma, service } = createPresentationHarness();
    prisma.album.findUnique.mockResolvedValueOnce(albumRecord());

    await service.findBySlug('wedding-album');

    expect(prisma.album.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { viewCount: { increment: 1 } } }),
    );
  });

  it('rejects publishing an album without a completed image and cover', async () => {
    const { prisma, service } = createPresentationHarness();
    prisma.album.findUnique.mockResolvedValue(
      albumRecord({ coverImageId: null, _count: { images: 0 } }),
    );
    prisma.album.update.mockResolvedValue(albumRecord({ status: 'published' }));

    await expect(
      service.update(ALBUM_ID, { status: 'published' } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        statusCode: 400,
        code: 'album_not_publishable',
      }),
    });

    expect(prisma.album.update).not.toHaveBeenCalled();
  });

  it('returns a hydrated, ordered gallery after publishing', async () => {
    const { prisma, imagePresenter, service } = createPresentationHarness();
    const coverImage = imageRecord('publish-cover');
    const images = [
      coverImage,
      { ...imageRecord('publish-gallery'), orderIndex: 2 },
    ];
    prisma.album.findUnique.mockResolvedValue(
      albumRecord({
        coverImageId: coverImage.id,
        coverImage,
        images,
        imageCount: images.length,
        _count: { images: images.length },
      }),
    );
    prisma.album.update.mockResolvedValue(
      albumRecord({
        status: 'published',
        coverImageId: coverImage.id,
        coverImage,
        images,
        imageCount: images.length,
      }),
    );

    const result = await service.update(ALBUM_ID, {
      status: 'published',
    } as any);

    expect(result.images.map((image: any) => image.thumbnailUrl)).toEqual([
      'presented://publish-cover',
      'presented://publish-gallery',
    ]);
    expect(imagePresenter.presentImage).toHaveBeenCalledTimes(3);
    expect(prisma.album.update).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          images: {
            where: { uploadStatus: 'completed' },
            orderBy: { orderIndex: 'asc' },
          },
        }),
      }),
    );
  });

  it('returns the refreshed admin album after bulk image deletion', async () => {
    const { prisma, imagesService, service } = createPresentationHarness();
    const remainingImage = imageRecord('remaining');
    imagesService.removeMany.mockResolvedValue({ deletedCount: 2 });
    prisma.album.findUnique.mockResolvedValueOnce(
      albumRecord({
        status: 'draft',
        coverImageId: null,
        coverImage: null,
        images: [remainingImage],
        imageCount: 1,
      }),
    );

    const result = await (service as any).bulkDeleteImages(ALBUM_ID, {
      imageIds: ['image-1', 'image-2'],
    });

    expect(imagesService.removeMany).toHaveBeenCalledWith(ALBUM_ID, {
      imageIds: ['image-1', 'image-2'],
    });
    expect(result).toMatchObject({
      status: 'draft',
      coverImage: null,
      imageCount: 1,
    });
    expect(result.images).toHaveLength(1);
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
