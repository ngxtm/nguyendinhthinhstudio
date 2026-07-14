import { Test, TestingModule } from '@nestjs/testing';
import { AlbumsService } from '../albums/albums.service';
import { PrismaService } from '../prisma/prisma.service';
import { TagsService } from './tags.service';

describe('TagsService', () => {
  let service: TagsService;
  let prisma: any;
  let albumsService: any;

  beforeEach(async () => {
    prisma = {
      tag: { findUnique: jest.fn() },
      album: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
    };
    albumsService = { presentAlbum: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AlbumsService, useValue: albumsService },
      ],
    }).compile();

    service = module.get<TagsService>(TagsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('presents every album returned for a tag through AlbumsService', async () => {
    const tag = {
      id: 'tag-1',
      name: 'Wedding',
      slug: 'wedding',
      description: null,
    };
    const album = {
      id: 'album-1',
      title: 'Wedding album',
      slug: 'wedding-album',
      coverImage: {
        id: 'cover-1',
        thumbnailUrl: 'stored://cover-1',
      },
    };
    prisma.tag.findUnique.mockResolvedValueOnce(tag);
    prisma.album.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    prisma.album.findMany.mockResolvedValueOnce([album]);
    albumsService.presentAlbum.mockImplementation((value: any) => ({
      ...value,
      coverImage: {
        ...value.coverImage,
        thumbnailUrl: 'presented://cover-1',
      },
    }));

    const result = await service.getAlbumsBySlug('wedding', {
      limit: 1,
      offset: 0,
    });

    expect(result.data[0].coverImage.thumbnailUrl).toBe(
      'presented://cover-1',
    );
    expect(albumsService.presentAlbum).toHaveBeenCalledWith(album);
  });
});
