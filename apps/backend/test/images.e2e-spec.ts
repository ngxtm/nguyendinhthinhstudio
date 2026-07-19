import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHmac } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ImagesService } from '../src/images/images.service';
import { PrismaService } from '../src/prisma/prisma.service';

const TEST_JWT_SECRET = 'test-jwt-secret';

function signJwt(role: 'admin' | 'user'): string {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({
    sub:
      role === 'admin'
        ? '00000000-0000-4000-8000-000000000001'
        : '00000000-0000-4000-8000-000000000002',
    iss: 'https://project-ref.supabase.co/auth/v1',
    aud: 'authenticated',
    email: `${role}@example.com`,
    user_role: role === 'admin' ? 'admin' : 'user',
    iat: now,
    exp: now + 60,
  });
  const signature = createHmac('sha256', TEST_JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

describe('Images authorization (e2e)', () => {
  let app: INestApplication;
  const imagesService = {
    getUploadUrl: jest.fn(),
    confirmUpload: jest.fn(),
    findByAlbum: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    reorder: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    imagesService.getUploadUrl.mockResolvedValue({
      uploadUrl: 'https://example.com/upload',
    });
    imagesService.confirmUpload.mockResolvedValue({ id: 'image-id' });
    imagesService.findByAlbum.mockResolvedValue([]);
    imagesService.update.mockResolvedValue({ id: 'image-id' });
    imagesService.remove.mockResolvedValue({ id: 'image-id' });
    imagesService.reorder.mockResolvedValue([]);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(ImagesService)
      .useValue(imagesService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each([
    ['POST', '/images/upload-url'],
    ['POST', '/images/confirm-upload'],
  ])('%s %s rejects a request without a JWT', async (method, path) => {
    await request(app.getHttpServer())
      [method.toLowerCase() as 'post'](path)
      .send({})
      .expect(401);
  });

  it.each([
    ['POST', '/images/upload-url'],
    ['POST', '/images/confirm-upload'],
    ['PATCH', '/images/image-id'],
    ['DELETE', '/images/image-id'],
    ['PATCH', '/images/album/album-id/reorder'],
  ])('%s %s rejects a non-admin JWT', async (method, path) => {
    const httpRequest = request(app.getHttpServer())
      [method.toLowerCase() as 'post' | 'patch' | 'delete'](path)
      .set('Authorization', `Bearer ${signJwt('user')}`);

    await httpRequest.send({}).expect(403);
  });

  it('allows public reads without a JWT', async () => {
    await request(app.getHttpServer())
      .get('/images/album/album-id')
      .expect(200)
      .expect([]);

    expect(imagesService.findByAlbum).toHaveBeenCalledWith('album-id');
  });

  it('allows an admin JWT to reach the upload handler', async () => {
    const uploadRequest = {
      albumId: 'album-id',
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      fileSize: 1024,
    };

    await request(app.getHttpServer())
      .post('/images/upload-url')
      .set('Authorization', `Bearer ${signJwt('admin')}`)
      .send(uploadRequest)
      .expect(201)
      .expect({ uploadUrl: 'https://example.com/upload' });

    expect(imagesService.getUploadUrl).toHaveBeenCalledWith(uploadRequest);
  });
});
