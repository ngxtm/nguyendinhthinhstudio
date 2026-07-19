import {
  BadRequestException,
  ConflictException,
  INestApplication,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHmac } from 'crypto';
import request from 'supertest';
import * as bodyParser from 'body-parser';
import { AppModule } from '../src/app.module';
import { ImageUploadPolicyService } from '../src/images/image-upload-policy.service';
import {
  ImageUploadRateLimitService,
  UploadRateLimitedException,
} from '../src/images/image-upload-rate-limit.service';
import { ImagesService } from '../src/images/images.service';
import { PrismaService } from '../src/prisma/prisma.service';

const TEST_JWT_SECRET = 'test-jwt-secret';
const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const POLICY_VERSION = 'policy-v1';

function signJwt(role: 'admin' | 'user'): string {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({
    sub: role === 'admin' ? ADMIN_ID : '00000000-0000-4000-8000-000000000002',
    iss: 'https://project-ref.supabase.co/auth/v1',
    aud: 'authenticated',
    email: `${role}@example.com`,
    user_role: role,
    iat: now,
    exp: now + 60,
  });
  const signature = createHmac('sha256', TEST_JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

describe('Images current upload routes (e2e)', () => {
  let app: INestApplication;
  const imagesService = {
    getUploadUrl: jest.fn(),
    confirmUpload: jest.fn(),
    getUploadStatus: jest.fn(),
    abandonUpload: jest.fn(),
    findByAlbum: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    reorder: jest.fn(),
  };
  const rateLimit = { admit: jest.fn() };
  const policy = {
    policyVersion: POLICY_VERSION,
    getPolicy: jest.fn(() => ({
      policyVersion: POLICY_VERSION,
      policy: { maxStoredBytes: 5_242_880 },
    })),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    process.env.IMAGE_UPLOAD_PRESIGN_ENABLED = 'true';
    imagesService.getUploadUrl.mockResolvedValue({ uploadId: 'upload-id' });
    imagesService.confirmUpload.mockResolvedValue({ outcome: 'finalizing' });
    imagesService.getUploadStatus.mockResolvedValue({
      outcome: 'pending',
      statusCode: 200,
      uploadId: '00000000-0000-4000-8000-000000000030',
      expiresAt: '2026-07-12T13:00:00.000Z',
    });
    imagesService.abandonUpload.mockResolvedValue({
      outcome: 'abandoned',
      statusCode: 200,
      uploadId: '00000000-0000-4000-8000-000000000030',
      code: 'upload_abandoned',
      message: 'Upload session was abandoned',
    });
    imagesService.findByAlbum.mockResolvedValue([]);
    imagesService.update.mockResolvedValue({ id: 'image-id' });
    imagesService.remove.mockResolvedValue({ id: 'image-id' });
    imagesService.reorder.mockResolvedValue([]);
    rateLimit.admit.mockResolvedValue({ admitted: true });
    policy.getPolicy.mockReturnValue({
      policyVersion: POLICY_VERSION,
      policy: { maxStoredBytes: 5_242_880 },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(ImagesService)
      .useValue(imagesService)
      .overrideProvider(ImageUploadRateLimitService)
      .useValue(rateLimit)
      .overrideProvider(ImageUploadPolicyService)
      .useValue(policy)
      .compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    app.use(bodyParser.json({ limit: '1mb' }));
    app.use(bodyParser.urlencoded({ limit: '1mb', extended: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.IMAGE_UPLOAD_PRESIGN_ENABLED;
  });

  it.each([
    ['GET', '/images/upload-policy'],
    ['POST', '/images/upload-url'],
    ['POST', '/images/confirm-upload'],
    ['GET', '/images/upload-sessions/00000000-0000-4000-8000-000000000030'],
    [
      'POST',
      '/images/upload-sessions/00000000-0000-4000-8000-000000000030/abandon',
    ],
  ])('%s %s requires authentication', async (method, path) => {
    const response = await request(app.getHttpServer())
      [method.toLowerCase() as 'get' | 'post'](path)
      .send({});
    expect(response.status).toBe(401);
    expect(response.body).toEqual(
      expect.objectContaining({
        statusCode: 401,
        code: 'upload_authentication_required',
      }),
    );
  });

  it.each([
    ['GET', '/images/upload-policy'],
    ['POST', '/images/upload-url'],
    ['POST', '/images/confirm-upload'],
    ['GET', '/images/upload-sessions/00000000-0000-4000-8000-000000000030'],
    [
      'POST',
      '/images/upload-sessions/00000000-0000-4000-8000-000000000030/abandon',
    ],
  ])('%s %s requires admin authorization', async (method, path) => {
    const response = await request(app.getHttpServer())
      [method.toLowerCase() as 'get' | 'post'](path)
      .set('Authorization', `Bearer ${signJwt('user')}`)
      .send({});
    expect(response.status).toBe(403);
    expect(response.body).toEqual(
      expect.objectContaining({
        statusCode: 403,
        code: 'upload_admin_required',
      }),
    );
  });

  it('returns policy to an authenticated admin', async () => {
    await request(app.getHttpServer())
      .get('/images/upload-policy')
      .set('Authorization', `Bearer ${signJwt('admin')}`)
      .expect(200)
      .expect({
        policyVersion: POLICY_VERSION,
        policy: { maxStoredBytes: 5_242_880 },
      });
  });

  it.each(['clientRequestId', 'processedSha256', 'policyVersion'])(
    'admits then returns policy_refresh_required when %s is missing',
    async (field) => {
      const body: Record<string, unknown> = {
        clientRequestId: '00000000-0000-4000-8000-000000000010',
        albumId: '00000000-0000-4000-8000-000000000020',
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        fileSize: 1024,
        processedSha256: 'a'.repeat(64),
        policyVersion: POLICY_VERSION,
      };
      delete body[field];

      const response = await request(app.getHttpServer())
        .post('/images/upload-url')
        .set('Authorization', `Bearer ${signJwt('admin')}`)
        .send(body)
        .expect(409);
      expect(response.body).toEqual(
        expect.objectContaining({
          statusCode: 409,
          code: 'policy_refresh_required',
        }),
      );
      expect(rateLimit.admit).toHaveBeenCalledWith(ADMIN_ID, 'upload_url');
      expect(imagesService.getUploadUrl).not.toHaveBeenCalled();
    },
  );

  it('returns rate limiting before malformed request validation', async () => {
    rateLimit.admit.mockRejectedValueOnce(
      new UploadRateLimitedException('2026-07-19T10:01:00.000Z'),
    );

    const response = await request(app.getHttpServer())
      .post('/images/upload-url')
      .set('Authorization', `Bearer ${signJwt('admin')}`)
      .send({})
      .expect(429);
    expect(response.body).toEqual(
      expect.objectContaining({
        code: 'upload_rate_limited',
        retryAfter: '2026-07-19T10:01:00.000Z',
      }),
    );
  });

  it('accepts bodies below 1 MiB for validation and rejects bodies above 1 MiB', async () => {
    const token = `Bearer ${signJwt('admin')}`;
    const below = await request(app.getHttpServer())
      .post('/images/upload-url')
      .set('Authorization', token)
      .send({ padding: 'x'.repeat(512 * 1024) })
      .expect(409);
    expect(below.body).toEqual(
      expect.objectContaining({ code: 'policy_refresh_required' }),
    );

    await request(app.getHttpServer())
      .post('/images/upload-url')
      .set('Authorization', token)
      .send({ padding: 'x'.repeat(1024 * 1024 + 1) })
      .expect(413);
  });

  it('returns upload_invalid_request after rate admission', async () => {
    const response = await request(app.getHttpServer())
      .post('/images/upload-url')
      .set('Authorization', `Bearer ${signJwt('admin')}`)
      .send({
        clientRequestId: '00000000-0000-4000-8000-000000000010',
        albumId: '00000000-0000-4000-8000-000000000020',
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        fileSize: 0,
        processedSha256: 'a'.repeat(64),
        policyVersion: POLICY_VERSION,
      })
      .expect(400);
    expect(response.body).toEqual(
      expect.objectContaining({ code: 'upload_invalid_request' }),
    );
  });

  it.each([
    [new NotFoundException('opaque'), 'upload_not_found'],
    [new ConflictException('opaque'), 'upload_request_conflict'],
    [new BadRequestException('opaque'), 'upload_capacity_exceeded'],
  ])('returns closed business error %s', async (businessError, code) => {
    imagesService.getUploadUrl.mockRejectedValueOnce(businessError);
    const response = await request(app.getHttpServer())
      .post('/images/upload-url')
      .set('Authorization', `Bearer ${signJwt('admin')}`)
      .send({
        clientRequestId: '00000000-0000-4000-8000-000000000010',
        albumId: '00000000-0000-4000-8000-000000000020',
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        fileSize: 1024,
        processedSha256: 'a'.repeat(64),
        policyVersion: POLICY_VERSION,
      })
      .expect(code === 'upload_not_found' ? 404 : 409);
    expect(response.body).toEqual(expect.objectContaining({ code }));
  });

  it('returns closed status and abandon outcomes for the authenticated owner', async () => {
    const uploadId = '00000000-0000-4000-8000-000000000030';

    const status = await request(app.getHttpServer())
      .get(`/images/upload-sessions/${uploadId}`)
      .set('Authorization', `Bearer ${signJwt('admin')}`)
      .expect(200);
    expect(status.body).toEqual(
      expect.objectContaining({ outcome: 'pending', uploadId }),
    );
    expect(imagesService.getUploadStatus).toHaveBeenCalledWith(
      uploadId,
      ADMIN_ID,
    );

    const abandon = await request(app.getHttpServer())
      .post(`/images/upload-sessions/${uploadId}/abandon`)
      .set('Authorization', `Bearer ${signJwt('admin')}`)
      .send({})
      .expect(200);
    expect(abandon.body).toEqual(
      expect.objectContaining({
        outcome: 'abandoned',
        code: 'upload_abandoned',
        uploadId,
      }),
    );
    expect(imagesService.abandonUpload).toHaveBeenCalledWith(
      uploadId,
      ADMIN_ID,
    );
  });

  it('returns upload_rate_limit_unavailable without business admission', async () => {
    rateLimit.admit.mockRejectedValueOnce(
      new ServiceUnavailableException({
        statusCode: 503,
        code: 'upload_rate_limit_unavailable',
        message: 'Upload rate limit store is unavailable',
      }),
    );
    const response = await request(app.getHttpServer())
      .post('/images/confirm-upload')
      .set('Authorization', `Bearer ${signJwt('admin')}`)
      .send({ uploadId: '00000000-0000-4000-8000-000000000030' })
      .expect(503);
    expect(response.body).toEqual(
      expect.objectContaining({ code: 'upload_rate_limit_unavailable' }),
    );
    expect(imagesService.confirmUpload).not.toHaveBeenCalled();
  });

  it('never uses an untrusted forwarded IP as the admission identity', async () => {
    await request(app.getHttpServer())
      .post('/images/upload-url')
      .set('Authorization', `Bearer ${signJwt('admin')}`)
      .set('X-Forwarded-For', '203.0.113.99')
      .send({
        clientRequestId: '00000000-0000-4000-8000-000000000010',
        albumId: '00000000-0000-4000-8000-000000000020',
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        fileSize: 1024,
        processedSha256: 'a'.repeat(64),
        policyVersion: POLICY_VERSION,
      })
      .expect(200);
    expect(rateLimit.admit).toHaveBeenCalledWith(ADMIN_ID, 'upload_url');
  });

  it('returns presign disabled before admission', async () => {
    process.env.IMAGE_UPLOAD_PRESIGN_ENABLED = 'false';

    const response = await request(app.getHttpServer())
      .post('/images/upload-url')
      .set('Authorization', `Bearer ${signJwt('admin')}`)
      .send({})
      .expect(503);
    expect(response.body).toEqual(
      expect.objectContaining({ code: 'upload_presign_disabled' }),
    );
    expect(rateLimit.admit).not.toHaveBeenCalled();
  });

  it('allows public album reads without a JWT', async () => {
    await request(app.getHttpServer())
      .get('/images/album/album-id')
      .expect(200)
      .expect([]);
  });
});
