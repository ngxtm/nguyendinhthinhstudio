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

function albumRecord(
  id: string,
  overrides: Record<string, unknown> = {},
) {
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

    expect(fresh[0].coverImage.thumbnailUrl).toBe(
      'presented://related-cover',
    );
    expect(cached[0].coverImage.thumbnailUrl).toBe(
      'presented://related-cover',
    );
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

  it('does not return soft-deleted albums from the fallback pool', async () => {
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

    await service.getRelatedAlbums('current-album', 1);

    // findMany is called twice: call 0 = candidate query, call 1 = fallback.
    expect(prisma.album.findMany).toHaveBeenCalledTimes(2);
    const fallbackCall = prisma.album.findMany.mock.calls[1][0];
    expect(fallbackCall.where).toMatchObject({
      status: 'published',
      deleteStatus: 'active',
    });
  });
});
