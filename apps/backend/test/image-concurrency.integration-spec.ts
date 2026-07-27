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
import { ImageUploadPromotionRepository } from '../src/images/image-upload-promotion.repository';

const execFileAsync = promisify(execFile);
const CONTENT_TYPE = 'image/webp';
const FILE_SIZE = 1024;
const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const PROCESSED_SHA256 = 'a'.repeat(64);

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
    // Build the current schema, remove rollout-only structures, then replay the
    // committed rollout migrations exactly as production does.
    await runPrisma([
      'db',
      'push',
      '--force-reset',
      '--skip-generate',
      '--schema',
      schemaPath,
    ]);
    // Admission/confirmation concurrency targets the current schema. Migration
    // replay is covered by image-upload-schema.integration-spec.ts.
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    await prisma.$connect();
  });

  afterEach(async () => {
    if (!prisma) return;
    await prisma.$executeRawUnsafe('DELETE FROM "ImageStorageMigration"');
    await prisma.imageUploadIdempotency.deleteMany();
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
    await prisma.imageUploadIdempotency.create({
      data: {
        clientRequestId: randomUUID(),
        createdByAdminId: ADMIN_ID,
        uploadId: id,
        requestFingerprint: 'f'.repeat(64),
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

  function createService(prismaClient: any = prisma) {
    const storage = {
      createUploadObjectKey: jest
        .fn()
        .mockImplementation(
          (uploadId: string, filename: string) =>
            `uploads/${uploadId}/${filename}`,
        ),
      createFinalObjectKey: jest
        .fn()
        .mockImplementation(
          (albumId: string, filename: string) =>
            `albums/${albumId}/${randomUUID()}-${filename}`,
        ),
      signFixedExpiryPut: jest
        .fn()
        .mockResolvedValue('https://r2.test/presigned-upload'),
      verifyObject: jest.fn().mockResolvedValue('source-etag'),
      readObjectBytes: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      promoteObject: jest.fn().mockResolvedValue('destination-etag'),
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
    const imagePresenter = {
      presentImage: jest.fn((image: unknown) => image),
    };
    const service = new ImagesService(
      prismaClient,
      storage as any,
      imageUrl as any,
      imagePresenter as any,
      new ImageUploadPromotionRepository(prismaClient),
      { acquire: jest.fn().mockResolvedValue(jest.fn()) } as any,
      { inspect: jest.fn().mockResolvedValue({ digestSha256: PROCESSED_SHA256, byteSize: FILE_SIZE, facts: { mime: 'image/webp', width: 10, height: 20 } }) } as any,
    );
    return { service, storage };
  }

  function presignRequest(albumId: string, clientRequestId = randomUUID()) {
    return {
      clientRequestId,
      albumId,
      filename: 'photo.webp',
      contentType: CONTENT_TYPE as 'image/webp',
      fileSize: FILE_SIZE,
      processedSha256: PROCESSED_SHA256,
    };
  }

  it('creates one session for two simultaneous same-request presign calls', async () => {
    const album = await createAlbumWithImages(0);
    const request = presignRequest(album.id);
    const { service, storage } = createService();

    const [first, second] = await Promise.all([
      service.getUploadUrl(request, ADMIN_ID),
      service.getUploadUrl(request, ADMIN_ID),
    ]);

    expect(first).toEqual(expect.objectContaining({ outcome: 'ready' }));
    expect(second).toEqual(
      expect.objectContaining({
        outcome: 'ready',
        uploadId: (first as { uploadId: string }).uploadId,
        expiresAt: (first as { expiresAt: string }).expiresAt,
      }),
    );
    await expect(
      prisma.imageUpload.count({
        where: { clientRequestId: request.clientRequestId },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.imageUploadIdempotency.count({
        where: { clientRequestId: request.clientRequestId },
      }),
    ).resolves.toBe(1);
    expect(storage.signFixedExpiryPut).toHaveBeenCalledTimes(2);
  });

  it('allows only one of two presign admissions at 49 completed images', async () => {
    const album = await createAlbumWithImages(49);
    const { service, storage } = createService();

    const results = await Promise.allSettled([
      service.getUploadUrl(presignRequest(album.id), ADMIN_ID),
      service.getUploadUrl(presignRequest(album.id), ADMIN_ID),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({
      response: expect.objectContaining({ code: 'upload_capacity_exceeded' }),
    });
    await expect(
      prisma.imageUpload.count({ where: { albumId: album.id } }),
    ).resolves.toBe(1);
    expect(storage.signFixedExpiryPut).toHaveBeenCalledTimes(1);
  });

  it('excludes expired pending reservations from presign capacity', async () => {
    const album = await createAlbumWithImages(49);
    await prisma.imageUpload.create({
      data: {
        id: randomUUID(),
        albumId: album.id,
        uploadObjectKey: `uploads/${randomUUID()}/expired.jpg`,
        finalObjectKey: `albums/${album.id}/${randomUUID()}-expired.jpg`,
        filename: 'expired.jpg',
        contentType: CONTENT_TYPE,
        fileSize: FILE_SIZE,
        status: 'pending',
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    const { service } = createService();

    await expect(
      service.getUploadUrl(presignRequest(album.id), ADMIN_ID),
    ).resolves.toEqual(expect.objectContaining({ outcome: 'ready' }));
  });

  it.each([
    ['stale', new Date(Date.now() - 11 * 60 * 1000)],
    ['fresh', new Date(Date.now() - 60 * 1000)],
  ])(
    'includes %s finalizing reservations in presign capacity',
    async (_label, finalizationStartedAt) => {
      const album = await createAlbumWithImages(49);
      await prisma.imageUpload.create({
        data: {
          id: randomUUID(),
          albumId: album.id,
          uploadObjectKey: `uploads/${randomUUID()}/finalizing.jpg`,
          finalObjectKey: `albums/${album.id}/${randomUUID()}-finalizing.jpg`,
          filename: 'finalizing.jpg',
          contentType: CONTENT_TYPE,
          fileSize: FILE_SIZE,
          status: 'finalizing',
          finalizationStartedAt,
          finalizationLeaseToken: randomUUID(),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      const { service, storage } = createService();

      await expect(
        service.getUploadUrl(presignRequest(album.id), ADMIN_ID),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'upload_capacity_exceeded' }),
      });
      expect(storage.signFixedExpiryPut).not.toHaveBeenCalled();
    },
  );

  it('creates and signs nothing after bounded P2034 retry exhaustion', async () => {
    const transaction = jest
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('serialization failure'), { code: 'P2034' }),
      );
    const fakePrisma = {
      $transaction: transaction,
    };
    const { service, storage } = createService(fakePrisma);

    await expect(
      service.getUploadUrl(presignRequest(randomUUID()), ADMIN_ID),
    ).rejects.toMatchObject({ code: 'P2034' });

    expect(transaction).toHaveBeenCalledTimes(3);
    expect(storage.signFixedExpiryPut).not.toHaveBeenCalled();
  });

  it('allows exactly one confirm at 49 images and persists exactly 50 images', async () => {
    const album = await createAlbumWithImages(49);
    const [first, second] = await Promise.all([
      createUpload(album.id),
      createUpload(album.id),
    ]);
    const { service } = createService();

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
    const { service } = createService();

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
