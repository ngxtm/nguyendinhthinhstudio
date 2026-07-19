import { ServiceUnavailableException } from '@nestjs/common';
import {
  IMAGE_UPLOAD_ROUTE_LIMITS,
  ImageUploadRateLimitService,
  UploadRateLimitedException,
} from './image-upload-rate-limit.service';

describe('ImageUploadRateLimitService', () => {
  const now = new Date('2026-07-19T10:00:00.000Z');

  it('defines the exact closed route scopes and operational limits', () => {
    expect(IMAGE_UPLOAD_ROUTE_LIMITS).toEqual({
      upload_url: { limit: 20, windowMs: 600_000 },
      confirm_upload: { limit: 60, windowMs: 600_000 },
      upload_status: { limit: 120, windowMs: 60_000 },
      abandon_upload: { limit: 30, windowMs: 600_000 },
    });
  });

  it('takes an advisory lock and inserts one event for an admitted attempt', async () => {
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValue([{ count: 0n, oldest: null }]),
    };
    const prisma = {
      $transaction: jest.fn((work: (tx: unknown) => unknown) => work(tx)),
    };
    const service = new ImageUploadRateLimitService(prisma as never, () => now);

    await expect(service.admit('admin-1', 'upload_url')).resolves.toEqual({
      admitted: true,
    });

    expect(tx.$executeRawUnsafe.mock.calls[0][0]).toContain(
      'pg_advisory_xact_lock(hashtextextended',
    );
    expect(tx.$executeRawUnsafe.mock.calls[0].slice(1)).toEqual([
      'admin-1',
      'upload_url',
    ]);
    expect(tx.$executeRawUnsafe.mock.calls[1].slice(1)).toEqual([
      'admin-1',
      'upload_url',
      now,
    ]);
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'Serializable' }),
    );
  });

  it('rejects at the limit without inserting and returns the absolute reset', async () => {
    const oldest = new Date('2026-07-19T09:51:00.000Z');
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ count: 20n, oldest }]),
    };
    const prisma = {
      $transaction: jest.fn((work: (tx: unknown) => unknown) => work(tx)),
    };
    const service = new ImageUploadRateLimitService(prisma as never, () => now);

    await expect(service.admit('admin-1', 'upload_url')).rejects.toMatchObject({
      response: {
        statusCode: 429,
        code: 'upload_rate_limited',
        retryAfter: '2026-07-19T10:01:00.000Z',
      },
    });
    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it('retries PostgreSQL serialization errors surfaced by raw queries', async () => {
    const serialization = Object.assign(new Error('Raw query failed'), {
      code: 'P2010',
      meta: {
        message:
          'ERROR: could not serialize access due to read/write dependencies among transactions',
      },
    });
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValue([{ count: 0n, oldest: null }]),
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockRejectedValueOnce(serialization)
        .mockImplementation((work: (tx: unknown) => unknown) => work(tx)),
    };
    const service = new ImageUploadRateLimitService(prisma as never, () => now);

    await expect(service.admit('admin-1', 'upload_url')).resolves.toEqual({
      admitted: true,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('fails closed when PostgreSQL is unavailable', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(new Error('database offline')),
    };
    const service = new ImageUploadRateLimitService(prisma as never, () => now);

    await expect(service.admit('admin-1', 'upload_url')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(service.admit('admin-1', 'upload_url')).rejects.toMatchObject({
      response: {
        statusCode: 503,
        code: 'upload_rate_limit_unavailable',
      },
    });
  });

  it('does not translate a deliberate rate rejection into store unavailable', async () => {
    const rejection = new UploadRateLimitedException(
      '2026-07-19T10:01:00.000Z',
    );
    const prisma = { $transaction: jest.fn().mockRejectedValue(rejection) };
    const service = new ImageUploadRateLimitService(prisma as never, () => now);

    await expect(service.admit('admin-1', 'upload_url')).rejects.toBe(
      rejection,
    );
  });

  it('uses the validated cleanup batch environment value by default', async () => {
    const previous = process.env.IMAGE_UPLOAD_RATE_LIMIT_CLEANUP_BATCH;
    process.env.IMAGE_UPLOAD_RATE_LIMIT_CLEANUP_BATCH = '250';
    const prisma = { $executeRawUnsafe: jest.fn().mockResolvedValue(0) };
    try {
      const service = new ImageUploadRateLimitService(
        prisma as never,
        () => now,
      );
      await service.cleanupExpired();
      expect(prisma.$executeRawUnsafe.mock.calls[0][2]).toBe(250);
    } finally {
      if (previous === undefined) {
        delete process.env.IMAGE_UPLOAD_RATE_LIMIT_CLEANUP_BATCH;
      } else {
        process.env.IMAGE_UPLOAD_RATE_LIMIT_CLEANUP_BATCH = previous;
      }
    }
  });

  it('bounds cleanup to the configured batch and ten-minute horizon', async () => {
    const prisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(37),
    };
    const service = new ImageUploadRateLimitService(
      prisma as never,
      () => now,
      100,
    );

    await expect(service.cleanupExpired()).resolves.toBe(37);
    expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain('LIMIT $2');
    expect(prisma.$executeRawUnsafe.mock.calls[0].slice(1)).toEqual([
      new Date('2026-07-19T09:50:00.000Z'),
      100,
    ]);
  });
});
