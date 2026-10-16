import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditService } from '../audit/audit.service';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';

describe('pricing HTTP access and request validation', () => {
  let app: INestApplication;
  const pricing = {
    getPublished: jest
      .fn()
      .mockResolvedValue({ prices: { 'premium-i': 3500000 } }),
    getConfiguration: jest
      .fn()
      .mockResolvedValue({ revision: 'initial', draft: {} }),
    save: jest.fn().mockResolvedValue({ revision: 'next' }),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PricingController],
      providers: [
        { provide: PricingService, useValue: pricing },
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
          const request = context.switchToHttp().getRequest<{
            headers: { authorization?: string };
            user?: { role: string };
          }>();
          if (!request.headers.authorization) throw new UnauthorizedException();
          request.user = {
            role:
              request.headers.authorization === 'Bearer admin'
                ? 'admin'
                : 'staff',
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => {
    await app.close();
  });
  afterEach(() => jest.clearAllMocks());

  async function http(
    method: string,
    path: string,
    role?: string,
    body?: unknown,
  ) {
    return fetch(`${await app.getUrl()}/pricing/${path}`, {
      method,
      headers: {
        Connection: 'close',
        ...(role ? { Authorization: `Bearer ${role}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }

  it('permits public reads and disables intermediary caching', async () => {
    const response = await http('GET', 'ca-nhan');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).not.toHaveProperty('draft');
  });

  it.each([
    ['GET', 'admin/ca-nhan'],
    ['PUT', 'admin/ca-nhan/draft'],
    ['POST', 'admin/ca-nhan/publish'],
  ])(
    'protects %s %s with authentication and the real role guard',
    async (method, path) => {
      const body =
        method === 'GET' ? undefined : { revision: 'initial', prices: {} };
      expect((await http(method, path, undefined, body)).status).toBe(401);
      expect((await http(method, path, 'staff', body)).status).toBe(403);
      expect(pricing.save).not.toHaveBeenCalled();
      expect(pricing.getConfiguration).not.toHaveBeenCalled();
    },
  );

  it('distinguishes admin draft saves from publishing', async () => {
    const body = { revision: 'initial', prices: { 'premium-i': 3900000 } };
    expect((await http('GET', 'admin/ca-nhan', 'admin')).status).toBe(200);
    expect(
      (await http('PUT', 'admin/ca-nhan/draft', 'admin', body)).status,
    ).toBe(200);
    expect(pricing.save).toHaveBeenLastCalledWith('ca-nhan', body, false);
    expect(
      (await http('POST', 'admin/ca-nhan/publish', 'admin', body)).status,
    ).toBe(200);
    expect(pricing.save).toHaveBeenLastCalledWith('ca-nhan', body, true);
  });

  it.each([
    { prices: {} },
    { revision: '', prices: {} },
    { revision: 'initial', prices: [] },
    { revision: 'initial', prices: null },
    { revision: 'initial', prices: {}, published: {} },
  ])('rejects malformed request bodies %j', async (body) => {
    expect(
      (await http('PUT', 'admin/ca-nhan/draft', 'admin', body)).status,
    ).toBe(400);
    expect(pricing.save).not.toHaveBeenCalled();
  });
});
