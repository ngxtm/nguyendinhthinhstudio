import { compareGalleryAlbums } from './gallery-sort';

function album(overrides: Record<string, unknown> = {}) {
  return {
    id: 'album-1',
    isFeatured: false,
    featuredOrder: null,
    shootDate: null,
    publishedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    categories: [],
    ...overrides,
  };
}

describe('gallery album ordering', () => {
  it('puts newly featured albums first, then uses latest activity and Beauty as a tie-breaker', () => {
    const newlyFeatured = album({
      id: 'newly-featured',
      isFeatured: true,
      featuredOrder: 8,
      publishedAt: new Date('2026-02-01T00:00:00.000Z'),
    });
    const olderFeatured = album({
      id: 'older-featured',
      isFeatured: true,
      featuredOrder: 3,
      publishedAt: new Date('2026-05-01T00:00:00.000Z'),
    });
    const recentNonBeauty = album({
      id: 'recent-non-beauty',
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
    });
    const sameDateBeauty = album({
      id: 'same-date-beauty',
      categories: [{ category: { slug: 'beauty' } }],
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
    });
    const sameDateOther = album({
      id: 'same-date-other',
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
    });

    const sorted = [
      olderFeatured,
      sameDateOther,
      recentNonBeauty,
      sameDateBeauty,
      newlyFeatured,
    ].sort(compareGalleryAlbums);

    expect(sorted.map((item) => item.id)).toEqual([
      'newly-featured',
      'older-featured',
      'recent-non-beauty',
      'same-date-beauty',
      'same-date-other',
    ]);
  });

  it('uses the latest shoot, publish, or create date as the activity date', () => {
    const recentlyShot = album({
      id: 'recently-shot',
      shootDate: new Date('2026-08-01T00:00:00.000Z'),
      publishedAt: new Date('2026-02-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const recentlyPublished = album({
      id: 'recently-published',
      publishedAt: new Date('2026-07-15T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(
      [recentlyPublished, recentlyShot]
        .sort(compareGalleryAlbums)
        .map((item) => item.id),
    ).toEqual(['recently-shot', 'recently-published']);
  });
});
