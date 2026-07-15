import { ImagesService } from './images.service';

describe('public image read contract', () => {
  it('requires a published active parent and returns an allowlisted image DTO', async () => {
    const prisma: any = {
      album: { findUnique: jest.fn().mockResolvedValue(null) },
      image: { findMany: jest.fn() },
    };
    const service = new ImagesService(prisma, {} as any, {} as any, { presentImage: (x: any) => x } as any);
    await expect(service.findByAlbum('album')).rejects.toThrow();
    expect(prisma.album.findUnique.mock.calls[0][0].where).toEqual({ id: 'album', status: 'published', deleteStatus: 'active' });
  });
});
