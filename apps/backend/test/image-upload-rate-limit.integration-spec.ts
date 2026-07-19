import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { ImageUploadRateLimitService } from '../src/images/image-upload-rate-limit.service';

const execFileAsync = promisify(execFile);

describe('image upload rate ledger (PostgreSQL)', () => {
  let container: StartedPostgreSqlContainer;
  let first: PrismaClient;
  let second: PrismaClient;
  const now = new Date('2026-07-19T10:00:00.000Z');

  jest.setTimeout(120_000);

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const databaseUrl = container.getConnectionUri();
    await execFileAsync(
      process.execPath,
      [
        require.resolve('prisma/build/index.js'),
        'db',
        'push',
        '--force-reset',
        '--skip-generate',
        '--schema',
        resolve(__dirname, '../prisma/schema.prisma'),
      ],
      {
        cwd: resolve(__dirname, '..'),
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          DIRECT_URL: databaseUrl,
        },
      },
    );
    first = new PrismaClient({ datasourceUrl: databaseUrl });
    second = new PrismaClient({ datasourceUrl: databaseUrl });
    await Promise.all([first.$connect(), second.$connect()]);
  });

  afterEach(async () => {
    await first.$executeRawUnsafe('DELETE FROM "ImageUploadRateLimitEvent"');
  });

  afterAll(async () => {
    await Promise.all([first?.$disconnect(), second?.$disconnect()]);
    await container?.stop();
  });

  function service(client: PrismaClient, clock = now, batch = 100) {
    return new ImageUploadRateLimitService(client as never, () => clock, batch);
  }

  async function count(adminId: string, routeScope: string) {
    const [{ count }] = await first.$queryRawUnsafe<Array<{ count: bigint }>>(
      'SELECT COUNT(*)::bigint AS count FROM "ImageUploadRateLimitEvent" WHERE "createdByAdminId" = $1 AND "routeScope" = $2',
      adminId,
      routeScope,
    );
    return Number(count);
  }

  it('atomically admits exactly the limit across two independent connections', async () => {
    const a = service(first);
    const b = service(second);
    const results = await Promise.allSettled(
      Array.from({ length: 24 }, (_, index) =>
        (index % 2 === 0 ? a : b).admit('admin-concurrent', 'upload_url'),
      ),
    );

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(20);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(4);
    expect(await count('admin-concurrent', 'upload_url')).toBe(20);
  });

  it('uses a strict window boundary and returns the oldest plus window reset', async () => {
    const boundary = new Date(now.getTime() - 600_000);
    const oldestInside = new Date(now.getTime() - 599_000);
    await first.$executeRawUnsafe(
      `INSERT INTO "ImageUploadRateLimitEvent" ("createdByAdminId", "routeScope", "occurredAt")
       VALUES ('admin-boundary', 'upload_url', $1)`,
      boundary,
    );
    for (let index = 0; index < 20; index += 1) {
      await first.$executeRawUnsafe(
        `INSERT INTO "ImageUploadRateLimitEvent" ("createdByAdminId", "routeScope", "occurredAt")
         VALUES ('admin-boundary', 'upload_url', $1)`,
        new Date(oldestInside.getTime() + index),
      );
    }

    await expect(
      service(first).admit('admin-boundary', 'upload_url'),
    ).rejects.toMatchObject({
      response: {
        code: 'upload_rate_limited',
        retryAfter: new Date(oldestInside.getTime() + 600_000).toISOString(),
      },
    });
    expect(await count('admin-boundary', 'upload_url')).toBe(21);

    await expect(
      service(first, new Date(oldestInside.getTime() + 600_000)).admit(
        'admin-boundary',
        'upload_url',
      ),
    ).resolves.toEqual({ admitted: true });
  });

  it('isolates immutable admins and exact route scopes', async () => {
    const limiter = service(first);
    await Promise.all(
      Array.from({ length: 20 }, () => limiter.admit('admin-a', 'upload_url')),
    );

    await expect(limiter.admit('admin-b', 'upload_url')).resolves.toBeDefined();
    await expect(
      limiter.admit('admin-a', 'confirm_upload'),
    ).resolves.toBeDefined();
  });

  it('fails closed after the store connection is unavailable', async () => {
    const unavailable = new PrismaClient({
      datasourceUrl: 'postgresql://postgres:postgres@127.0.0.1:1/unavailable',
    });
    const limiter = service(unavailable);

    await expect(
      limiter.admit('admin-store', 'upload_url'),
    ).rejects.toMatchObject({
      response: { statusCode: 503, code: 'upload_rate_limit_unavailable' },
    });
    await unavailable.$disconnect();
  });

  it('deletes only the configured batch older than ten minutes', async () => {
    const rows = Array.from(
      { length: 105 },
      (_, index) =>
        `('cleanup-${index}', 'upload_url', '2026-07-19T09:49:00.000Z')`,
    ).join(',');
    await first.$executeRawUnsafe(
      `INSERT INTO "ImageUploadRateLimitEvent" ("createdByAdminId", "routeScope", "occurredAt") VALUES ${rows}`,
    );

    await expect(service(first, now, 100).cleanupExpired()).resolves.toBe(100);
    const [{ count }] = await first.$queryRawUnsafe<Array<{ count: bigint }>>(
      'SELECT COUNT(*)::bigint AS count FROM "ImageUploadRateLimitEvent"',
    );
    expect(count).toBe(5n);
  });
});
