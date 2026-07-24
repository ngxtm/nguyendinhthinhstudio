import { AlbumsService } from './albums.service';

describe('album public/admin read contracts', () => {
  it('public list rejects privileged status and always queries published active albums', async () => {
    const prisma: any = { album: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new AlbumsService(prisma, {} as any, {} as any, { presentImage: (x: any) => x } as any);
    await expect(service.findAll({ status: 'draft' } as any)).rejects.toThrow();
    await service.findAll({ status: 'published' } as any);
    expect(prisma.album.findMany.mock.calls[0][0].where).toEqual({ AND: [{ status: 'published' }, { deleteStatus: 'active' }] });
  });

  it('public detail returns only published active album and strips private fields', async () => {
    const row: any = { id: 'a', title: 'A', slug: 'a', status: 'draft', deleteStatus: 'active', googleDriveLink: 'secret', tags: [], categories: [], images: [] };
    const prisma: any = { album: { findUnique: jest.fn().mockResolvedValue(row), update: jest.fn() } };
    const service = new AlbumsService(prisma, {} as any, {} as any, { presentImage: (x: any) => x } as any);
    await expect(service.findBySlug('a')).rejects.toThrow();
    expect(prisma.album.findUnique.mock.calls[0][0].where).toEqual({ slug: 'a', status: 'published', deleteStatus: 'active' });
  });

  it('provides an admin album read path without view increment', async () => {
    const row: any = { id: 'a', title: 'A', slug: 'a', status: 'draft', deleteStatus: 'active', googleDriveLink: 'secret', tags: [], categories: [], images: [] };
    const prisma: any = { album: { findUnique: jest.fn().mockResolvedValue(row), findMany: jest.fn().mockResolvedValue([row]) } };
    const service = new AlbumsService(prisma, {} as any, {} as any, { presentImage: (x: any) => x } as any);
    await expect(service.findAdminById('a')).resolves.toMatchObject({ googleDriveLink: 'secret' });
    expect(prisma.album.findUnique).toHaveBeenCalled();
  });

  it('provides an admin slug read path for draft albums', async () => {
    const row: any = {
      id: 'album-id',
      title: 'Draft album',
      slug: 'testing-223',
      status: 'draft',
      deleteStatus: 'active',
      googleDriveLink: 'secret',
      tags: [],
      categories: [],
      images: [],
    };
    const prisma: any = {
      album: { findUnique: jest.fn().mockResolvedValue(row) },
    };
    const service = new AlbumsService(
      prisma,
      {} as any,
      {} as any,
      { presentImage: (x: any) => x } as any,
    );

    await expect(service.findAdminBySlug('testing-223')).resolves.toMatchObject({
      status: 'draft',
      googleDriveLink: 'secret',
    });
    expect(prisma.album.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'testing-223' } }),
    );
  });
});
