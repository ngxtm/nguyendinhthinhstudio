import { Pool } from 'pg';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  ImageUploadCutoverService,
  type CutoverObjectIdentity,
  type CutoverObjectStore,
  type PollingGateSnapshot,
} from '../src/images/image-upload-cutover.service';
import { PgCutoverRepository } from '../src/images/image-upload-cutover.pg';

class MemoryObjectStore implements CutoverObjectStore {
  readonly objects = new Map<string, CutoverObjectIdentity>();
  readonly operations: string[] = [];

  head(key: string) {
    this.operations.push(`HEAD:${key}`);
    return Promise.resolve(this.objects.get(key) ?? null);
  }

  delete(key: string, expectedEtag?: string) {
    this.operations.push(`DELETE:${key}`);
    const current = this.objects.get(key);
    if (expectedEtag && current?.etag !== expectedEtag) {
      return Promise.reject(new Error('conditional delete ETag mismatch'));
    }
    this.objects.delete(key);
    return Promise.resolve();
  }
}

const cleanSnapshot = (observedAt: Date): PollingGateSnapshot => ({
  observedAt,
  activeUploads: 0,
  expiredUploads: 0,
  unresolvedPromotions: 0,
  invalidResponseHeadSettlement: 0,
  openConflicts: 0,
  dueTemporaryCleanup: 0,
  applicableImageDeletion: 0,
  invalidLegacyAuthority: 0,
  corsMismatch: 0,
});

describe('image upload one-shot cold cutover (PostgreSQL)', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  jest.setTimeout(120_000);

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(`
      CREATE TABLE "Album" (
        "id" text PRIMARY KEY,
        "imageCount" integer NOT NULL DEFAULT 0
      );
      CREATE TABLE "Image" (
        "id" text PRIMARY KEY,
        "albumId" text NOT NULL,
        "filename" text NOT NULL,
        "r2ObjectKey" text UNIQUE,
        "uploadStatus" text NOT NULL DEFAULT 'pending',
        "thumbnailUrl" text NOT NULL DEFAULT '',
        "smallUrl" text NOT NULL DEFAULT '',
        "mediumUrl" text NOT NULL DEFAULT '',
        "largeUrl" text NOT NULL DEFAULT '',
        "xlargeUrl" text NOT NULL DEFAULT '',
        "orderIndex" integer NOT NULL DEFAULT 0,
        "fileSizeKb" integer,
        "fileSizeBytes" integer,
        "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE "ImageUpload" (
        "id" text PRIMARY KEY,
        "albumId" text NOT NULL,
        "uploadObjectKey" text NOT NULL UNIQUE,
        "finalObjectKey" text NOT NULL UNIQUE,
        "filename" text NOT NULL,
        "contentType" text NOT NULL,
        "fileSize" integer NOT NULL,
        "status" text NOT NULL DEFAULT 'pending',
        "sourceEtag" text,
        "finalizationStartedAt" timestamp(3),
        "expiresAt" timestamp(3) NOT NULL,
        "consumedAt" timestamp(3),
        "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO "Album" ("id")
      VALUES ('20000000-0000-4000-8000-000000000001');
      INSERT INTO "ImageUpload" (
        "id", "albumId", "uploadObjectKey", "finalObjectKey", "filename",
        "contentType", "fileSize", "status", "expiresAt", "createdAt"
      ) VALUES (
        '10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        'uploads/private/source.webp',
        'albums/private/final.webp',
        'final.webp',
        'image/webp',
        123,
        'pending',
        '2026-07-20T23:00:00.000Z',
        '2026-07-20T22:00:00.000Z'
      );
    `);
  });

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it('audits legacy columns read-only, then applies after migration and restarts idempotently', async () => {
    const repository = new PgCutoverRepository(
      pool,
      'account',
      'production-images',
    );
    const objects = new MemoryObjectStore();
    objects.objects.set('uploads/private/source.webp', {
      etag: '0123456789abcdef0123456789abcdef',
      bytes: 123,
      mime: 'image/webp',
      metadataSha256: 'f'.repeat(64),
    });
    const service = new ImageUploadCutoverService(repository, objects);
    const first = cleanSnapshot(new Date('2026-07-21T00:00:00.000Z'));
    const second = cleanSnapshot(new Date('2026-07-21T00:00:30.000Z'));
    const backup = {
      receiptSha256: 'a'.repeat(64),
      approvalSha256: 'b'.repeat(64),
      receiptPathSha256: '7'.repeat(64),
      approvalPathSha256: '8'.repeat(64),
      databaseIdentitySha256: 'c'.repeat(64),
      backupSha256: 'd'.repeat(64),
      backupPathSha256: 'e'.repeat(64),
      quiescedAt: new Date('2026-07-20T23:30:00.000Z'),
    };

    const audit = await service.audit({
      now: second.observedAt,
      firstSnapshot: first,
      secondSnapshot: second,
      backup,
      dispositions: [],
    });
    expect(audit.rows[0].classification).toBe('legacy_pre_dispatch');
    const unchanged = await pool.query(
      `SELECT "status", "sourceEtag", "finalizationStartedAt"
       FROM "ImageUpload"`,
    );
    expect(unchanged.rows).toEqual([
      {
        status: 'pending',
        sourceEtag: null,
        finalizationStartedAt: null,
      },
    ]);

    const approval = service.approve(
      audit,
      'a'.repeat(64),
      new Date('2026-07-21T00:00:31.000Z'),
    );
    await expect(
      service.apply({
        now: new Date('2026-07-21T00:02:00.000Z'),
        receipt: audit,
        approval,
        backup,
        dispositions: [],
        presignClockSkewSeconds: 60,
      }),
    ).rejects.toThrow(/post-migration schema preflight/);
    expect(
      objects.operations.some((operation) => operation.startsWith('DELETE:')),
    ).toBe(false);

    await pool.query(`
      ALTER TABLE "ImageUpload"
        ADD COLUMN "clientRequestId" text,
        ADD COLUMN "createdByAdminId" text,
        ADD COLUMN "presignExpiresAt" timestamp(3),
        ADD COLUMN "finalizationLeaseToken" text,
        ADD COLUMN "resultImageId" text,
        ADD COLUMN "terminalAt" timestamp(3),
        ADD COLUMN "resultRetentionExpiresAt" timestamp(3),
        ADD COLUMN "failureCode" text,
        ADD COLUMN "temporaryCleanupState" text,
        ADD COLUMN "temporaryCleanupNextAttemptAt" timestamp(3),
        ADD COLUMN "temporaryCleanupVerifiedAt" timestamp(3),
        ADD COLUMN "temporaryCleanupLastErrorCategory" text;
      CREATE TABLE "ImageUploadIdempotency" (
        "clientRequestId" text PRIMARY KEY,
        "createdByAdminId" text NOT NULL,
        "uploadId" text NOT NULL UNIQUE,
        "requestFingerprint" text NOT NULL,
        "terminalOutcome" text,
        "resultImageId" text,
        "resultDeletedAt" timestamp(3),
        "failureCode" text,
        "terminalAt" timestamp(3),
        "resultRetentionExpiresAt" timestamp(3),
        "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "archivedAt" timestamp(3)
      );
      CREATE TABLE "ImageUploadPromotion" (
        "id" text PRIMARY KEY,
        "uploadId" text NOT NULL UNIQUE,
        "origin" text NOT NULL,
        "albumId" text NOT NULL,
        "finalizationLeaseToken" text NOT NULL,
        "accountId" text NOT NULL,
        "bucket" text NOT NULL,
        "sourceObjectKey" text NOT NULL,
        "sourceEtag" text,
        "destinationObjectKey" text NOT NULL UNIQUE,
        "committedResultImageId" text,
        "copyState" text NOT NULL,
        "disposition" text NOT NULL,
        "providerSettlementObservedAt" timestamp(3),
        "destinationHeadObservedAt" timestamp(3),
        "destinationHeadEtag" text,
        "destinationHeadBytes" integer,
        "destinationHeadMime" text,
        "destinationHeadMetadataSha256" text,
        "dispatchAttempts" integer NOT NULL DEFAULT 0,
        "reconcileAttempts" integer NOT NULL DEFAULT 0,
        "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" timestamp(3) NOT NULL
      );
    `);
    const applied = await service.apply({
      now: new Date('2026-07-21T00:02:00.000Z'),
      receipt: audit,
      approval,
      backup,
      dispositions: [],
      presignClockSkewSeconds: 60,
    });
    expect(applied).toEqual({
      failed: 1,
      bridged: 0,
      preserved: 0,
      cleaned: 1,
    });
    const terminal = await pool.query(
      `SELECT "status", "failureCode", "presignExpiresAt", "temporaryCleanupState"
       FROM "ImageUpload"`,
    );
    expect(terminal.rows).toEqual([
      {
        status: 'failed',
        failureCode: 'upload_cutover_aborted',
        presignExpiresAt: backup.quiescedAt,
        temporaryCleanupState: 'verified_deleted',
      },
    ]);
    expect(objects.objects.has('uploads/private/source.webp')).toBe(false);

    const restarted = await service.apply({
      now: new Date('2026-07-21T00:03:00.000Z'),
      receipt: audit,
      approval,
      backup,
      dispositions: [],
      presignClockSkewSeconds: 60,
    });
    expect(restarted.failed).toBe(0);
    expect(
      objects.operations.filter(
        (operation) => operation === 'DELETE:albums/private/final.webp',
      ),
    ).toHaveLength(0);

    const preservedImageId = '30000000-0000-4000-8000-000000000003';
    const preservedRow = {
      id: '10000000-0000-4000-8000-000000000003',
      albumId: '20000000-0000-4000-8000-000000000001',
      uploadObjectKey: 'uploads/private/preserved-source.webp',
      finalObjectKey: 'albums/private/preserved-final.webp',
      filename: 'preserved-final.webp',
      contentType: 'image/webp',
      fileSize: 222,
      status: 'pending',
      sourceEtag: null,
      finalizationStartedAt: null,
      expiresAt: new Date('2026-07-20T23:00:00.000Z'),
      consumedAt: null,
      createdAt: new Date('2026-07-20T22:00:00.000Z'),
      image: {
        id: preservedImageId,
        albumId: '20000000-0000-4000-8000-000000000001',
        r2ObjectKey: 'albums/private/preserved-final.webp',
      },
    };
    await pool.query(
      `INSERT INTO "Image" (
        "id", "albumId", "filename", "r2ObjectKey", "uploadStatus"
      ) VALUES ($1, $2, $3, $4, 'completed')`,
      [
        preservedImageId,
        preservedRow.albumId,
        preservedRow.filename,
        preservedRow.finalObjectKey,
      ],
    );
    await pool.query(
      `INSERT INTO "ImageUpload" (
        "id", "albumId", "uploadObjectKey", "finalObjectKey", "filename",
        "contentType", "fileSize", "status", "expiresAt", "createdAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        preservedRow.id,
        preservedRow.albumId,
        preservedRow.uploadObjectKey,
        preservedRow.finalObjectKey,
        preservedRow.filename,
        preservedRow.contentType,
        preservedRow.fileSize,
        preservedRow.status,
        preservedRow.expiresAt,
        preservedRow.createdAt,
      ],
    );
    await expect(
      repository.preserveLegacyImageAuthority({
        uploadId: preservedRow.id,
        now: new Date('2026-07-21T00:03:30.000Z'),
        presignExpiresAt: backup.quiescedAt,
        cleanupNotBefore: new Date('2026-07-20T23:31:00.000Z'),
        row: preservedRow,
      }),
    ).resolves.toBe('applied');
    const preserved = await pool.query(
      `SELECT "status", "resultImageId", "temporaryCleanupState"
       FROM "ImageUpload" WHERE "id" = $1`,
      [preservedRow.id],
    );
    expect(preserved.rows).toEqual([
      {
        status: 'consumed',
        resultImageId: preservedImageId,
        temporaryCleanupState: 'pending',
      },
    ]);
    const preservedPromotion = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS "count" FROM "ImageUploadPromotion"
       WHERE "uploadId" = $1`,
      [preservedRow.id],
    );
    expect(preservedPromotion.rows[0].count).toBe(0);

    const bridgeRow = {
      id: '10000000-0000-4000-8000-000000000002',
      albumId: '20000000-0000-4000-8000-000000000001',
      uploadObjectKey: 'uploads/private/bridge-source.webp',
      finalObjectKey: 'albums/private/bridge-final.webp',
      filename: 'bridge-final.webp',
      contentType: 'image/webp',
      fileSize: 321,
      status: 'finalizing',
      sourceEtag: 'abcdefabcdefabcdefabcdefabcdefab',
      finalizationStartedAt: new Date('2026-07-20T22:30:00.000Z'),
      expiresAt: new Date('2026-07-20T23:00:00.000Z'),
      consumedAt: null,
      createdAt: new Date('2026-07-20T22:00:00.000Z'),
      image: null,
    };
    await pool.query(
      `INSERT INTO "ImageUpload" (
        "id", "albumId", "uploadObjectKey", "finalObjectKey", "filename",
        "contentType", "fileSize", "status", "sourceEtag",
        "finalizationStartedAt", "expiresAt", "createdAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        bridgeRow.id,
        bridgeRow.albumId,
        bridgeRow.uploadObjectKey,
        bridgeRow.finalObjectKey,
        bridgeRow.filename,
        bridgeRow.contentType,
        bridgeRow.fileSize,
        bridgeRow.status,
        bridgeRow.sourceEtag,
        bridgeRow.finalizationStartedAt,
        bridgeRow.expiresAt,
        bridgeRow.createdAt,
      ],
    );
    await expect(
      repository.commitLegacyBridge({
        uploadId: bridgeRow.id,
        rowEvidenceSha256: '1'.repeat(64),
        receiptSha256: '2'.repeat(64),
        finalizationToken: '30000000-0000-5000-8000-000000000001',
        now: new Date('2026-07-21T00:04:00.000Z'),
        presignExpiresAt: bridgeRow.expiresAt,
        cleanupNotBefore: new Date('2026-07-20T23:01:00.000Z'),
        row: bridgeRow,
        destination: {
          etag: bridgeRow.sourceEtag,
          bytes: bridgeRow.fileSize,
          mime: bridgeRow.contentType,
          metadataSha256: '3'.repeat(64),
        },
        committedAuthorized: true,
      }),
    ).rejects.toThrow(/pre-existing Image authority/);
    const unexpectedImage = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS "count" FROM "Image"
       WHERE "r2ObjectKey" = $1`,
      [bridgeRow.finalObjectKey],
    );
    expect(unexpectedImage.rows[0].count).toBe(0);

    const imageId = '30000000-0000-4000-8000-000000000002';
    await pool.query(
      `INSERT INTO "Image" (
        "id", "albumId", "filename", "r2ObjectKey", "uploadStatus"
      ) VALUES ($1, $2, $3, $4, 'completed')`,
      [
        imageId,
        bridgeRow.albumId,
        bridgeRow.filename,
        bridgeRow.finalObjectKey,
      ],
    );
    await expect(
      repository.commitLegacyBridge({
        uploadId: bridgeRow.id,
        rowEvidenceSha256: '1'.repeat(64),
        receiptSha256: '2'.repeat(64),
        finalizationToken: '30000000-0000-5000-8000-000000000001',
        now: new Date('2026-07-21T00:05:00.000Z'),
        presignExpiresAt: bridgeRow.expiresAt,
        cleanupNotBefore: new Date('2026-07-20T23:01:00.000Z'),
        row: {
          ...bridgeRow,
          image: {
            id: imageId,
            albumId: bridgeRow.albumId,
            r2ObjectKey: bridgeRow.finalObjectKey,
          },
        },
        destination: {
          etag: bridgeRow.sourceEtag,
          bytes: bridgeRow.fileSize,
          mime: bridgeRow.contentType,
          metadataSha256: '3'.repeat(64),
        },
        committedAuthorized: true,
      }),
    ).resolves.toBe('applied');
    const compactEvidence = await pool.query<{
      clientRequestId: string;
      createdByAdminId: string;
      terminalOutcome: string;
      resultImageId: string;
      retentionSeconds: string;
    }>(
      `SELECT
        upload."clientRequestId",
        upload."createdByAdminId",
        evidence."terminalOutcome",
        evidence."resultImageId",
        extract(epoch FROM (
          evidence."resultRetentionExpiresAt" - evidence."terminalAt"
        ))::text AS "retentionSeconds"
       FROM "ImageUpload" AS upload
       JOIN "ImageUploadIdempotency" AS evidence
         ON evidence."uploadId" = upload."id"
       WHERE upload."id" = $1`,
      [bridgeRow.id],
    );
    expect(compactEvidence.rows).toHaveLength(1);
    expect(compactEvidence.rows[0].clientRequestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(compactEvidence.rows[0]).toMatchObject({
      createdByAdminId: 'legacy-cutover',
      terminalOutcome: 'consumed',
      resultImageId: imageId,
      retentionSeconds: '2592000.000000',
    });
  });
});
