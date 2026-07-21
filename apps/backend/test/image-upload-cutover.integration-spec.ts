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
      databaseIdentitySha256: 'c'.repeat(64),
      backupSha256: 'd'.repeat(64),
      backupPathSha256: 'e'.repeat(64),
      quiescedAt: new Date('2026-07-20T21:00:00.000Z'),
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

    await pool.query(`
      ALTER TABLE "ImageUpload"
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
      CREATE TABLE "ImageUploadPromotion" (
        "uploadId" text PRIMARY KEY,
        "finalizationLeaseToken" text NOT NULL,
        "origin" text NOT NULL,
        "disposition" text NOT NULL
      );
    `);

    const approval = service.approve(
      audit,
      'operator-fingerprint',
      new Date('2026-07-21T00:00:31.000Z'),
    );
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
      `SELECT "status", "failureCode", "temporaryCleanupState"
       FROM "ImageUpload"`,
    );
    expect(terminal.rows).toEqual([
      {
        status: 'failed',
        failureCode: 'upload_cutover_aborted',
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
  });
});
