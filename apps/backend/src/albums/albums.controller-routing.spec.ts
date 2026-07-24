import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AlbumsController } from './albums.controller';
import { AlbumsService } from './albums.service';
import { RecommendationService } from './recommendation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

describe('AlbumsController route ordering', () => {
  let app: INestApplication;
  const albumsService = {
    findBySlug: jest.fn(),
    findAdminAll: jest.fn(),
    findAdminBySlug: jest.fn(),
  };

  beforeEach(async () => {
    albumsService.findBySlug.mockResolvedValue({ source: 'public' });
    albumsService.findAdminAll.mockResolvedValue({ source: 'admin' });
    albumsService.findAdminBySlug.mockResolvedValue({ source: 'admin-slug' });

    const moduleRef = await Test.createTestingModule({
      controllers: [AlbumsController],
      providers: [
        { provide: AlbumsService, useValue: albumsService },
        { provide: RecommendationService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  it('dispatches the static admin collection route before the public slug route', async () => {
    await request(app.getHttpServer())
      .get('/albums/admin')
      .expect(200)
      .expect({ source: 'admin' });

    expect(albumsService.findAdminAll).toHaveBeenCalledTimes(1);
    expect(albumsService.findBySlug).not.toHaveBeenCalled();
  });

  it('dispatches the authenticated admin slug route', async () => {
    await request(app.getHttpServer())
      .get('/albums/admin/slug/testing-223')
      .expect(200)
      .expect({ source: 'admin-slug' });

    expect(albumsService.findAdminBySlug).toHaveBeenCalledWith('testing-223');
  });
});
