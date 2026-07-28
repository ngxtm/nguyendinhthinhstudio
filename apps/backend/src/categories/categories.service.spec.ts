import { NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

describe('CategoriesService public gallery navigation', () => {
  const category = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  };
  const prisma = { category } as any;
  let service: CategoriesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CategoriesService(prisma);
  });

  it('returns an ordered public navigation tree backed by published active albums', async () => {
    category.findMany.mockResolvedValue([
      {
        id: 'nu',
        name: 'Nữ',
        slug: 'nu',
        description: null,
        parentId: null,
        navigationOrder: 10,
        updatedAt: new Date('2026-07-28T00:00:00.000Z'),
        _count: { albums: 2 },
      },
      {
        id: 'beauty',
        name: 'Beauty',
        slug: 'beauty',
        description: 'Album beauty',
        parentId: 'nu',
        navigationOrder: 20,
        updatedAt: new Date('2026-07-28T00:00:00.000Z'),
        _count: { albums: 1 },
      },
    ]);

    await expect((service as any).findPublicNavigation()).resolves.toEqual([
      expect.objectContaining({
        id: 'nu',
        slug: 'nu',
        albumCount: 2,
        children: [
          expect.objectContaining({
            id: 'beauty',
            slug: 'beauty',
            albumCount: 1,
            children: [],
          }),
        ],
      }),
    ]);

    expect(category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          showInNavigation: true,
          albums: {
            some: {
              album: { status: 'published', deleteStatus: 'active' },
            },
          },
        }),
      }),
    );
  });

  it('returns public category facts with a published album count', async () => {
    category.findUnique.mockResolvedValue({
      id: 'beauty',
      name: 'Beauty',
      slug: 'beauty',
      description: 'Album beauty',
      parentId: 'nu',
      parent: { id: 'nu', name: 'Nữ', slug: 'nu' },
      navigationOrder: 20,
      updatedAt: new Date('2026-07-28T00:00:00.000Z'),
      _count: { albums: 3 },
    });

    await expect((service as any).findPublicBySlug('beauty')).resolves.toEqual(
      expect.objectContaining({
        slug: 'beauty',
        albumCount: 3,
        parent: { id: 'nu', name: 'Nữ', slug: 'nu' },
      }),
    );
  });

  it('throws a real 404 for an unknown category slug', async () => {
    category.findUnique.mockResolvedValue(null);

    await expect(
      (service as any).findPublicBySlug('missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
