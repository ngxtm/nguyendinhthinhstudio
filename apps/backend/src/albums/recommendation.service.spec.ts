import { RecommendationService } from './recommendation.service';

const NOW = new Date('2026-07-12T12:00:00.000Z');

function imageRecord(id: string) {
  return {
    id,
    albumId: 'candidate-album',
    filename: `${id}.jpg`,
    r2ObjectKey: `albums/candidate-album/${id}.jpg`,
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

function tagLinks(albumId: string) {
  return Array.from({ length: 4 }, (_, index) => {
    const tagId = `tag-${index + 1}`;

    return {
      albumId,
      tagId,
      tag: {
        id: tagId,
        name: `Tag ${index + 1}`,
        slug: tagId,
        description: null,
        type: 'sub_category',
        createdAt: NOW,
      },
    };
  });
}

function tagLink(albumId: string, slug: string, type: string) {
  return {
    albumId,
    tagId: `${albumId}-${slug}`,
    tag: {
      id: `${albumId}-${slug}`,
      name: slug,
      slug,
      description: null,
      type,
      createdAt: NOW,
    },
  };
}

function categoryLink(
  albumId: string,
  slug: string,
  options: { depth?: number; source?: string; parentId?: string | null } = {},
) {
  return {
    albumId,
    categoryId: `${albumId}-${slug}`,
    depth: options.depth ?? 0,
    source: options.source ?? 'manual',
    category: {
      id: `${albumId}-${slug}`,
      name: slug,
      slug,
      description: null,
      parentId: options.parentId ?? null,
      showInNavigation: false,
      navigationOrder: 0,
      createdAt: NOW,
      updatedAt: NOW,
    },
  };
}

function albumRecord(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Album ${id}`,
    slug: id,
    description: null,
    shootDate: null,
    coverImageId: null,
    status: 'published',
    publishedAt: NOW,
    scheduledPublishAt: null,
    isFeatured: false,
    featuredOrder: null,
    googleDriveLink: null,
    metaTitle: null,
    metaDescription: null,
    viewCount: 0,
    imageCount: 1,
    deleteStatus: 'active',
    deleteStartedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    category: null,
    tags: tagLinks(id),
    coverImage: null,
    ...overrides,
  };
}

describe('RecommendationService image presentation', () => {
  it('returns a category-aware mixed recommendation set without duplicates', async () => {
    const currentAlbum = albumRecord('current-album', {
      tags: [
        tagLink('current-album', 'nu', 'main_category'),
        tagLink('current-album', 'studio', 'style'),
      ],
      categories: [categoryLink('current-album', 'nu')],
    });
    const directAlbums = Array.from({ length: 6 }, (_, index) =>
      albumRecord(`direct-${index}`, {
        tags: [
          tagLink(`direct-${index}`, 'nu', 'main_category'),
          tagLink(`direct-${index}`, 'beauty', 'sub_category'),
        ],
        categories: [categoryLink(`direct-${index}`, 'nu')],
      }),
    );
    const adjacentAlbums = Array.from({ length: 3 }, (_, index) =>
      albumRecord(`adjacent-${index}`, {
        tags: [tagLink(`adjacent-${index}`, 'studio', 'style')],
        categories: [categoryLink(`adjacent-${index}`, 'nam')],
      }),
    );
    const discoveryAlbums = [
      albumRecord('featured-discovery', { isFeatured: true }),
      albumRecord('newest-discovery', {
        publishedAt: new Date('2026-07-13T12:00:00.000Z'),
      }),
      albumRecord('extra-discovery'),
    ];
    const candidates = [...directAlbums, ...adjacentAlbums, ...discoveryAlbums];
    const prisma: any = {
      album: {
        findUnique: jest.fn().mockResolvedValue(currentAlbum),
        findMany: jest.fn().mockResolvedValue(candidates),
      },
    };
    const imagePresenter = { presentImage: jest.fn((image: any) => image) };
    const service = new (RecommendationService as any)(
      prisma,
      imagePresenter,
    ) as RecommendationService;

    const result = await service.getRelatedAlbums('current-album', 12);
    const ids = result.map((album: any) => album.id);
    const visibleIds = ids.slice(0, 8);

    expect(result).toHaveLength(12);
    expect(new Set(ids).size).toBe(12);
    expect(ids).not.toContain('current-album');
    expect(
      visibleIds.slice(0, 2).every((id: string) => id.startsWith('direct-')),
    ).toBe(true);
    expect(
      visibleIds.filter((id: string) => id.startsWith('direct-')),
    ).toHaveLength(4);
    expect(
      visibleIds.filter((id: string) => id.startsWith('adjacent-')),
    ).toHaveLength(2);
    expect(visibleIds).toContain('featured-discovery');
    expect(visibleIds).toContain('newest-discovery');
    const presentedDirect = result.find((album: any) =>
      album.id.startsWith('direct-'),
    );
    expect(presentedDirect.categories).toEqual([
      expect.objectContaining({ slug: 'nu', source: 'manual', depth: 0 }),
    ]);

    const candidateQuery = prisma.album.findMany.mock.calls[0][0];
    expect(candidateQuery.include.categories).toBeDefined();
  });

  it('keeps a weekly recommendation stable but rotates the selected set next week', async () => {
    const currentAlbum = albumRecord('current-album', {
      tags: [tagLink('current-album', 'nu', 'main_category')],
      categories: [categoryLink('current-album', 'nu')],
    });
    const candidates = Array.from({ length: 10 }, (_, index) =>
      albumRecord(`direct-${index}`, {
        tags: [tagLink(`direct-${index}`, 'nu', 'main_category')],
        categories: [categoryLink(`direct-${index}`, 'nu')],
      }),
    );
    const prisma: any = {
      album: {
        findUnique: jest.fn().mockResolvedValue(currentAlbum),
        findMany: jest.fn().mockResolvedValue(candidates),
      },
    };
    const imagePresenter = { presentImage: jest.fn((image: any) => image) };
    const service = new (RecommendationService as any)(
      prisma,
      imagePresenter,
    ) as RecommendationService;
    const nowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-09-01T12:00:00.000Z').getTime());

    try {
      const firstWeek = await service.getRelatedAlbums('current-album', 8);
      const sameWeek = await service.getRelatedAlbums('current-album', 8);

      nowSpy.mockReturnValue(new Date('2026-09-08T12:00:00.000Z').getTime());
      const nextWeek = await service.getRelatedAlbums('current-album', 8);

      expect(sameWeek).toEqual(firstWeek);
      expect(nextWeek.map((album: any) => album.id)).not.toEqual(
        firstWeek.map((album: any) => album.id),
      );
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('caches recommendations only after presenting every cover image', async () => {
    const coverImage = imageRecord('related-cover');
    const currentAlbum = albumRecord('current-album');
    const candidate = albumRecord('candidate-album', {
      coverImageId: coverImage.id,
      coverImage,
    });
    const prisma: any = {
      album: {
        findUnique: jest.fn().mockResolvedValue(currentAlbum),
        findMany: jest.fn().mockResolvedValue([candidate]),
      },
    };
    const imagePresenter = {
      presentImage: jest.fn((image: Record<string, unknown>) => ({
        ...image,
        thumbnailUrl: `presented://${String(image.id)}`,
      })),
    };
    const service = new (RecommendationService as any)(
      prisma,
      imagePresenter,
    ) as RecommendationService;

    const fresh = await service.getRelatedAlbums('current-album', 1);
    const cached = await service.getRelatedAlbums('current-album', 1);

    expect(fresh[0].coverImage.thumbnailUrl).toBe('presented://related-cover');
    expect(cached[0].coverImage.thumbnailUrl).toBe('presented://related-cover');
    expect(cached).toEqual(fresh);
    expect(imagePresenter.presentImage).toHaveBeenCalledTimes(1);
    expect(prisma.album.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.album.findMany).toHaveBeenCalledTimes(1);
  });

  it('only queries active (non-soft-deleted) albums for the current album, candidates, and fallbacks', async () => {
    const currentAlbum = albumRecord('current-album');
    const candidate = albumRecord('candidate-album');
    const prisma: any = {
      album: {
        findUnique: jest.fn().mockResolvedValue(currentAlbum),
        findMany: jest.fn().mockResolvedValue([candidate]),
      },
    };
    const imagePresenter = { presentImage: jest.fn((image: any) => image) };
    const service = new (RecommendationService as any)(
      prisma,
      imagePresenter,
    ) as RecommendationService;

    await service.getRelatedAlbums('current-album', 1);

    // current album lookup must require an active published album
    const currentCall = prisma.album.findUnique.mock.calls[0][0];
    expect(currentCall.where).toMatchObject({
      slug: 'current-album',
      status: 'published',
      deleteStatus: 'active',
    });

    // candidate query must exclude soft-deleted albums
    const candidateCall = prisma.album.findMany.mock.calls[0][0];
    expect(candidateCall.where).toMatchObject({
      status: 'published',
      deleteStatus: 'active',
    });
  });

  it('uses one active candidate pool instead of a separate fallback query', async () => {
    const currentAlbum = albumRecord('current-album');
    const prisma: any = {
      album: {
        findUnique: jest.fn().mockResolvedValue(currentAlbum),
        findMany: jest.fn().mockResolvedValue([]), // no qualified candidates → triggers fallback
      },
    };
    const imagePresenter = { presentImage: jest.fn((image: any) => image) };
    const service = new (RecommendationService as any)(
      prisma,
      imagePresenter,
    ) as RecommendationService;

    const result = await service.getRelatedAlbums('current-album', 1);

    expect(result).toEqual([]);
    expect(prisma.album.findMany).toHaveBeenCalledTimes(1);
    const candidateCall = prisma.album.findMany.mock.calls[0][0];
    expect(candidateCall.where).toMatchObject({
      status: 'published',
      deleteStatus: 'active',
    });
  });
});
