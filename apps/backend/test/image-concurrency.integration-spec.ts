import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { ImagesService } from '../src/images/images.service';

const execFileAsync = promisify(execFile);
const CONTENT_TYPE = 'image/jpeg';
const FILE_SIZE = 1024;

type UploadFixture = {
  id: string;
  uploadObjectKey: string;
  finalObjectKey: string;
};

type MigrationJournalFixture = {
  imageId: string;
  legacyCloudflareImageId: string;
  targetR2ObjectKey: string;
};

describe('image confirmation concurrency (PostgreSQL)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;

  jest.setTimeout(120_000);

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const databaseUrl = container.getConnectionUri();
    process.env.DATABASE_URL = databaseUrl;
    process.env.DIRECT_URL = databaseUrl;

    const schemaPath = resolve(__dirname, '../prisma/schema.prisma');
    const runPrisma = async (args: string[]) =>
      execFileAsync(
        process.execPath,
        [require.resolve('prisma/build/index.js'), ...args],
        {
          cwd: resolve(__dirname, '..'),
          env: {
            ...process.env,
            DATABASE_URL: databaseUrl,
            DIRECT_URL: databaseUrl,
          },
        },
      );

    // This repository starts its migration history after the initial schema.
    // Build the existing pre-Phase-4/5 schema, remove the Phase-4/5 structures,
    // then apply the committed Phase-4/5 migrations exactly as production does.
    await runPrisma([
      'db',
      'push',
      '--force-reset',
      '--skip-generate',
      '--schema',
      schemaPath,
    ]);
    const baselineClient = new PrismaClient({ datasourceUrl: databaseUrl });
    await baselineClient.$executeRawUnsafe(
      'DROP TABLE "ImageStorageMigration"',
    );
    await baselineClient.$executeRawUnsafe('DROP TABLE "ImageObjectDeletion"');
    await baselineClient.$executeRawUnsafe('DROP TABLE "ImageUpload"');
    await baselineClient.$executeRawUnsafe(
      'ALTER TABLE "Album" DROP COLUMN "deleteStartedAt"',
    );
    await baselineClient.$executeRawUnsafe(
      'ALTER TABLE "Album" DROP COLUMN "deleteStatus"',
    );
    await baselineClient.$disconnect();

    await runPrisma([
      'migrate',
      'resolve',
      '--applied',
      '20251023120000_multi_category_albums',
      '--schema',
      schemaPath,
    ]);
    await runPrisma([
      'migrate',
      'resolve',
      '--applied',
      '20260301000000_rename_cloudflare_to_r2',
      '--schema',
      schemaPath,
    ]);
    await runPrisma(['migrate', 'deploy', '--schema', schemaPath]);

    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    await prisma.$connect();
  });

  afterEach(async () => {
    if (!prisma) return;
    await prisma.$executeRawUnsafe('DELETE FROM "ImageStorageMigration"');
    await prisma.imageUpload.deleteMany();
    await prisma.image.deleteMany();
    await prisma.album.deleteMany();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  async function createAlbumWithImages(imageCount: number) {
    const album = await prisma.album.create({
      data: {
        title: `Concurrency ${randomUUID()}`,
        slug: `concurrency-${randomUUID()}`,
        imageCount,
      },
    });
    if (imageCount > 0) {
      await prisma.image.createMany({
        data: Array.from({ length: imageCount }, (_, index) => ({
          albumId: album.id,
          filename: `existing-${index + 1}.jpg`,
          r2ObjectKey: `albums/${album.id}/existing-${index + 1}.jpg`,
          uploadStatus: 'completed',
          orderIndex: index + 1,
        })),
      });
    }
    return album;
  }

  async function createUpload(albumId: string): Promise<UploadFixture> {
    const id = randomUUID();
    const uploadObjectKey = `uploads/${id}/photo.jpg`;
    const finalObjectKey = `albums/${albumId}/${randomUUID()}-photo.jpg`;
    await prisma.imageUpload.create({
      data: {
        id,
        albumId,
        uploadObjectKey,
        finalObjectKey,
        filename: 'photo.jpg',
        contentType: CONTENT_TYPE,
        fileSize: FILE_SIZE,
        status: 'pending',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    return { id, uploadObjectKey, finalObjectKey };
  }

  async function createMigrationJournal(
    overrides: Partial<MigrationJournalFixture> = {},
  ): Promise<MigrationJournalFixture> {
    const row = {
      imageId: randomUUID(),
      legacyCloudflareImageId: `legacy-${randomUUID()}`,
      targetR2ObjectKey: `migration/${randomUUID()}.jpg`,
      ...overrides,
    };
    await prisma.$executeRawUnsafe(
      'INSERT INTO "ImageStorageMigration" ("imageId", "legacyCloudflareImageId", "targetR2ObjectKey", "updatedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
      row.imageId,
      row.legacyCloudflareImageId,
      row.targetR2ObjectKey,
    );
    return row;
  }

  function createService() {
    const storage = {
      verifyObject: jest.fn().mockResolvedValue('"source-etag"'),
      promoteObject: jest.fn().mockResolvedValue(undefined),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const imageUrl = {
      getVariantUrls: jest.fn().mockImplementation((objectKey: string) => ({
        thumbnailUrl: `https://img.test/thumbnail/${objectKey}`,
        smallUrl: `https://img.test/small/${objectKey}`,
        mediumUrl: `https://img.test/medium/${objectKey}`,
        largeUrl: `https://img.test/large/${objectKey}`,
        xlargeUrl: `https://img.test/xlarge/${objectKey}`,
      })),
    };
    return new ImagesService(prisma as any, storage as any, imageUrl as any);
  }

  it('allows exactly one confirm at 49 images and persists exactly 50 images', async () => {
    const album = await createAlbumWithImages(49);
    const [first, second] = await Promise.all([
      createUpload(album.id),
      createUpload(album.id),
    ]);
    const service = createService();

    const results = await Promise.allSettled([
      service.confirmUpload({ uploadId: first.id }),
      service.confirmUpload({ uploadId: second.id }),
    ]);

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<unknown> =>
        result.status === 'fulfilled',
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(BadRequestException);
    expect(rejected[0].reason.message).toContain(
      'maximum number of images (50)',
    );
    await expect(
      prisma.image.count({ where: { albumId: album.id } }),
    ).resolves.toBe(50);
    await expect(
      prisma.album.findUnique({
        where: { id: album.id },
        select: { imageCount: true },
      }),
    ).resolves.toEqual({ imageCount: 50 });
    await expect(
      prisma.imageUpload.groupBy({
        by: ['status'],
        where: { albumId: album.id },
        _count: { _all: true },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'consumed', _count: { _all: 1 } }),
        expect.objectContaining({ status: 'pending', _count: { _all: 1 } }),
      ]),
    );
  });

  it('assigns distinct orderIndex values to two concurrent successful confirms', async () => {
    const album = await createAlbumWithImages(0);
    const [first, second] = await Promise.all([
      createUpload(album.id),
      createUpload(album.id),
    ]);
    const service = createService();

    const results = await Promise.allSettled([
      service.confirmUpload({ uploadId: first.id }),
      service.confirmUpload({ uploadId: second.id }),
    ]);

    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    const images = await prisma.image.findMany({
      where: { albumId: album.id },
      orderBy: { orderIndex: 'asc' },
      select: { orderIndex: true },
    });
    expect(images).toEqual([{ orderIndex: 1 }, { orderIndex: 2 }]);
    expect(new Set(images.map((image) => image.orderIndex)).size).toBe(2);
  });

  it('keeps an upload session when the migrated album foreign key restricts deletion', async () => {
    const album = await createAlbumWithImages(0);
    const upload = await createUpload(album.id);

    await expect(
      prisma.album.delete({ where: { id: album.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.imageUpload.findUnique({ where: { id: upload.id } }),
    ).resolves.toEqual(expect.objectContaining({ albumId: album.id }));
  });

  describe('ImageStorageMigration journal', () => {
    it('defaults status to pending', async () => {
      const row = await createMigrationJournal();

      const stored = await prisma.$queryRawUnsafe<Array<{ status: string }>>(
        'SELECT "status" FROM "ImageStorageMigration" WHERE "imageId" = $1',
        row.imageId,
      );

      expect(stored).toEqual([{ status: 'pending' }]);
    });

    it('enforces unique legacy Cloudflare ids and target R2 object keys', async () => {
      const first = await createMigrationJournal();

      await expect(
        createMigrationJournal({
          legacyCloudflareImageId: first.legacyCloudflareImageId,
        }),
      ).rejects.toMatchObject({ code: 'P2010' });
      await expect(
        createMigrationJournal({
          targetR2ObjectKey: first.targetR2ObjectKey,
        }),
      ).rejects.toMatchObject({ code: 'P2010' });
    });

    it('accepts a nonexistent imageId and survives deletion of a later Image with that id', async () => {
      const imageId = randomUUID();
      const journal = await createMigrationJournal({ imageId });
      const beforeImageExists = await prisma.$queryRawUnsafe<
        Array<{ imageId: string }>
      >(
        'SELECT "imageId" FROM "ImageStorageMigration" WHERE "imageId" = $1',
        imageId,
      );
      expect(beforeImageExists).toEqual([{ imageId }]);

      const album = await createAlbumWithImages(0);
      await prisma.image.create({
        data: {
          id: imageId,
          albumId: album.id,
          filename: 'migration-source.jpg',
          r2ObjectKey: `albums/${album.id}/migration-source.jpg`,
          uploadStatus: 'completed',
        },
      });
      await prisma.image.delete({ where: { id: imageId } });

      const afterImageDeletion = await prisma.$queryRawUnsafe<
        Array<MigrationJournalFixture>
      >(
        'SELECT "imageId", "legacyCloudflareImageId", "targetR2ObjectKey" FROM "ImageStorageMigration" WHERE "imageId" = $1',
        imageId,
      );
      expect(afterImageDeletion).toEqual([journal]);
    });
  });
});
