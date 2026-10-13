import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ImagePresenterService } from '../images/image-presenter.service';
import {
  HOMEPAGE_COLLECTION_KEY,
  HomepageCollectionService,
  normalizeCollectionSearch,
} from './homepage-collection.service';
import { SiteSettingsService } from './site-settings.service';

function album(id: string) {
  return {
    id,
    title: `Bộ ảnh ${id}`,
    slug: id,
    description: null,
    coverImage: {
      id: `cover-${id}`,
      albumId: id,
      smallUrl: 'legacy-url',
      r2ObjectKey: 'private-key',
    },
    categories: [{ category: { name: 'Beauty' } }],
  };
}

describe('HomepageCollectionService', () => {
  const prisma = {
    siteSettings: { findUnique: jest.fn(), upsert: jest.fn() },
    album: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const presenter = {
    presentImage: jest.fn((image: { id: string }) => ({
      id: image.id,
      smallUrl: `presented://${image.id}`,
    })),
  };
  const service = new HomepageCollectionService(
    prisma as unknown as PrismaService,
    presenter as unknown as ImagePresenterService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.siteSettings.findUnique.mockResolvedValue(null);
    prisma.siteSettings.upsert.mockResolvedValue({});
    prisma.album.findMany.mockResolvedValue([
      album('a'),
      album('b'),
      album('c'),
    ]);
    prisma.$transaction.mockImplementation(
      (operation: (tx: typeof prisma) => unknown) => operation(prisma),
    );
  });

  it('uses the newest eligible albums until an administrator saves a selection', async () => {
    const result = await service.getConfiguration();
    expect(result.configured).toBe(false);
    expect(result.albumIds).toEqual(['a', 'b', 'c']);
    expect(prisma.album.findMany.mock.calls[0][0]).toMatchObject({
      where: {
        status: 'published',
        deleteStatus: 'active',
        coverImage: { is: { uploadStatus: 'completed' } },
      },
      take: 3,
    });
  });

  it('reads the saved order, presents covers, and does not expose storage details', async () => {
    prisma.siteSettings.findUnique.mockResolvedValue({
      value: JSON.stringify(['c', 'a', 'b']),
    });
    const result = await service.getPublicCollection();
    expect(result.albums.map((item) => item.id)).toEqual(['c', 'a', 'b']);
    expect(result.albums[0].coverImage.smallUrl).toBe('presented://cover-c');
    expect(result.albums[0].coverImage).not.toHaveProperty('r2ObjectKey');
    expect(result).not.toHaveProperty('albumIds');
    expect(result.albums[0].categories).toEqual([{ name: 'Beauty' }]);
  });

  it('keeps missing saved positions visible to the admin without replacing them with unrelated albums', async () => {
    prisma.siteSettings.findUnique.mockResolvedValue({
      value: JSON.stringify(['c', 'a', 'b']),
    });
    prisma.album.findMany.mockResolvedValue([album('b'), album('c')]);
    const result = await service.getConfiguration();
    expect(result.albumIds).toEqual(['c', 'a', 'b']);
    expect(result.albums.map((item) => item.id)).toEqual(['c', 'b']);
    expect(result.configured).toBe(true);
    expect(prisma.album.findMany.mock.calls[0][0]).not.toHaveProperty('take');
  });

  it.each([
    { ids: [] },
    { ids: ['a', 'b'] },
    { ids: ['a', 'a', 'b'] },
    { ids: ['a', 'b', 'c', 'd'] },
  ])('rejects an incomplete or duplicate selection $ids', async ({ ids }) => {
    await expect(service.save(ids)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.siteSettings.upsert).not.toHaveBeenCalled();
  });

  it('rejects albums that became unpublished, deleted, or lost a usable cover before saving', async () => {
    prisma.album.findMany.mockResolvedValue([album('a'), album('b')]);
    await expect(service.save(['a', 'b', 'c'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.siteSettings.upsert).not.toHaveBeenCalled();
  });

  it('rejects a cover belonging to a different album', async () => {
    const invalid = album('c');
    invalid.coverImage.albumId = 'another-album';
    prisma.album.findMany.mockResolvedValue([album('a'), album('b'), invalid]);
    await expect(service.save(['a', 'b', 'c'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.siteSettings.upsert).not.toHaveBeenCalled();
  });

  it('saves all three IDs atomically in their selected order without changing featured flags', async () => {
    const result = await service.save(['c', 'a', 'b']);
    expect(result.albumIds).toEqual(['c', 'a', 'b']);
    expect(result.albums.map((item) => item!.id)).toEqual(['c', 'a', 'b']);
    expect(prisma.$transaction.mock.calls[0][1]).toEqual({
      isolationLevel: 'Serializable',
    });
    expect(prisma.siteSettings.upsert).toHaveBeenCalledWith({
      where: { key: HOMEPAGE_COLLECTION_KEY },
      create: { key: HOMEPAGE_COLLECTION_KEY, value: '["c","a","b"]' },
      update: { value: '["c","a","b"]' },
    });
  });

  it('retries a serializable write conflict', async () => {
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2034' });
    await service.save(['a', 'b', 'c']);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('searches normalized name tokens as bound parameters and pages the results', async () => {
    prisma.$queryRaw.mockResolvedValue(
      Array.from({ length: 21 }, (_, i) => ({ id: String(i) })),
    );
    prisma.album.findMany.mockResolvedValue([album('1'), album('0')]);
    const result = await service.search({ search: ' NẮNG  tháng ', page: 2 });
    const sql = prisma.$queryRaw.mock.calls[0][0];
    expect(sql.values).toEqual(
      expect.arrayContaining(['nang', 'thang', 21, 20]),
    );
    expect(sql.text).toContain('translate(lower(a.title)');
    expect(sql.text).not.toContain('nang');
    expect(result.albums.map((item) => item.id)).toEqual(['0', '1']);
    expect(result.pagination).toEqual({ page: 2, hasMore: true });
  });

  it('treats SQL wildcard characters and quotes as literal search text', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    await service.search({ search: "%'_" });
    const sql = prisma.$queryRaw.mock.calls[0][0];
    expect(sql.values).toContain("%'_");
    expect(sql.text).not.toContain("%'_");
    expect(prisma.album.findMany).not.toHaveBeenCalled();
  });

  it('normalizes Vietnamese names, case and whitespace', () => {
    expect(normalizeCollectionSearch('  ĐƯỜNG  NẮNG  ')).toBe('duong nang');
  });

  it('prevents the generic settings endpoint from bypassing collection validation', async () => {
    const settings = new SiteSettingsService(
      prisma as unknown as PrismaService,
    );
    await expect(
      settings.upsert(HOMEPAGE_COLLECTION_KEY, ['a']),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.siteSettings.upsert).not.toHaveBeenCalled();
  });
});
