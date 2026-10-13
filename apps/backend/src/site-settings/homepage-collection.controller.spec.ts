import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { HomepageCollectionController } from './homepage-collection.controller';
import { HomepageCollectionService } from './homepage-collection.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditService } from '../audit/audit.service';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';

describe('HomepageCollectionController access and validation', () => {
  let app: INestApplication;
  const ids = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
  ];
  const collection = {
    getPublicCollection: jest.fn().mockResolvedValue({ albums: [] }),
    getConfiguration: jest
      .fn()
      .mockResolvedValue({ configured: true, albumIds: ids, albums: [] }),
    search: jest.fn().mockResolvedValue({
      albums: [],
      pagination: { page: 1, hasMore: false },
    }),
    save: jest
      .fn()
      .mockResolvedValue({ configured: true, albumIds: ids, albums: [] }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HomepageCollectionController],
      providers: [
        { provide: HomepageCollectionService, useValue: collection },
        { provide: AuditService, useValue: { emit: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          if (
            new Reflector().getAllAndOverride(IS_PUBLIC_KEY, [
              context.getHandler(),
              context.getClass(),
            ])
          )
            return true;
          const req = context.switchToHttp().getRequest();
          if (!req.headers.authorization) throw new UnauthorizedException();
          req.user = {
            role:
              req.headers.authorization === 'Bearer admin' ? 'admin' : 'staff',
          };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
  });
  afterEach(() => {
    jest.clearAllMocks();
  });

  async function http(
    method: 'GET' | 'PATCH',
    url: string,
    role?: string,
    body?: unknown,
  ) {
    const response = await fetch(`${await app.getUrl()}${url}`, {
      method,
      headers: {
        Connection: 'close',
        ...(role ? { Authorization: `Bearer ${role}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  }

  it('exposes only the public collection without authentication', async () => {
    expect(await http('GET', '/homepage-collection')).toEqual({
      status: 200,
      body: { albums: [] },
    });
    expect((await http('GET', '/homepage-collection/admin')).status).toBe(401);
    expect((await http('GET', '/homepage-collection/options')).status).toBe(
      401,
    );
    expect(
      (
        await http('PATCH', '/homepage-collection/admin', undefined, {
          albumIds: ids,
        })
      ).status,
    ).toBe(401);
  });

  it('denies non-admin reads and writes using the actual RolesGuard', async () => {
    expect(
      (await http('GET', '/homepage-collection/admin', 'staff')).status,
    ).toBe(403);
    expect(
      (await http('GET', '/homepage-collection/options', 'staff')).status,
    ).toBe(403);
    expect(
      (
        await http('PATCH', '/homepage-collection/admin', 'staff', {
          albumIds: ids,
        })
      ).status,
    ).toBe(403);
    expect(collection.save).not.toHaveBeenCalled();
  });

  it('accepts exactly three UUIDs and preserves their submitted order', async () => {
    expect(
      (
        await http('PATCH', '/homepage-collection/admin', 'admin', {
          albumIds: [...ids].reverse(),
        })
      ).status,
    ).toBe(200);
    expect(collection.save).toHaveBeenCalledWith([...ids].reverse());
  });

  it.each([
    { albumIds: [ids[0], ids[1]] },
    { albumIds: [ids[0], ids[0], ids[1]] },
    { albumIds: ['not-a-uuid', ids[1], ids[2]] },
    { albumIds: ids, isFeatured: true },
  ])('rejects invalid bodies before invoking persistence: %j', async (body) => {
    expect(
      (await http('PATCH', '/homepage-collection/admin', 'admin', body)).status,
    ).toBe(400);
    expect(collection.save).not.toHaveBeenCalled();
  });

  it('bounds and converts search pagination', async () => {
    expect(
      (
        await http(
          'GET',
          '/homepage-collection/options?search=nang&page=2',
          'admin',
        )
      ).status,
    ).toBe(200);
    expect(collection.search).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'nang', page: 2 }),
    );
    expect(
      (await http('GET', '/homepage-collection/options?page=0', 'admin'))
        .status,
    ).toBe(400);
    expect(
      (await http('GET', '/homepage-collection/options?page=1.5', 'admin'))
        .status,
    ).toBe(400);
  });
});
