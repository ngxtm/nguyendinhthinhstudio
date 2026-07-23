import { Pool } from 'pg';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  ProductionSmokePgAdapter,
  type ProductionSmokePgBinding,
} from '../src/scripts/image-upload-production-smoke-pg';

describe('production smoke PostgreSQL mutation boundary', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let adapter: ProductionSmokePgAdapter;
  const releaseFingerprint = `sha256:${'a'.repeat(64)}`;
  const binding: ProductionSmokePgBinding = {
    uploadId: 'upload-owned',
    adminId: 'admin-owned',
    clientRequestId: 'request-owned',
    promotionId: 'promotion-owned',
    sourceObjectKey: 'uploads/upload-owned/smoke.webp',
    destinationObjectKey: 'albums/album-owned/smoke.webp',
    releaseFingerprint,
    runStartedAt: '2026-07-23T08:00:00.000Z',
  };

  jest.setTimeout(120_000);

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    adapter = new ProductionSmokePgAdapter(pool, releaseFingerprint);
    await pool.query(`
      CREATE TABLE "ImageUpload" (
        "id" text PRIMARY KEY,
        "createdByAdminId" text NOT NULL,
        "clientRequestId" text NOT NULL UNIQUE,
        "uploadObjectKey" text NOT NULL UNIQUE,
        "finalObjectKey" text NOT NULL UNIQUE,
        "status" text NOT NULL,
        "presignExpiresAt" timestamp(3),
        "expiresAt" timestamp(3) NOT NULL,
        "failureCode" text,
        "temporaryCleanupState" text,
        "temporaryCleanupNextAttemptAt" timestamp(3),
        "createdAt" timestamp(3) NOT NULL
      );
      CREATE TABLE "ImageUploadIdempotency" (
        "clientRequestId" text PRIMARY KEY,
        "uploadId" text NOT NULL UNIQUE
      );
      CREATE TABLE "ImageUploadPromotion" (
        "id" text PRIMARY KEY,
        "uploadId" text NOT NULL UNIQUE,
        "sourceObjectKey" text NOT NULL,
        "destinationObjectKey" text NOT NULL UNIQUE,
        "copyState" text NOT NULL,
        "disposition" text NOT NULL,
        "copyDispatchedAt" timestamp(3),
        "copyResponseObservedAt" timestamp(3),
        "nextReconcileAt" timestamp(3),
        "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE "ImageUploadPromotionConflict" (
        "id" text PRIMARY KEY,
        "promotionId" text NOT NULL UNIQUE
      );
      CREATE TABLE "ImageObjectDeletion" (
        "id" text PRIMARY KEY
      );
      CREATE TABLE "Image" (
        "id" text PRIMARY KEY
      );
      CREATE TABLE "ImageUploadRateLimitEvent" (
        "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "createdByAdminId" text NOT NULL
      );
    `);
  });

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE "ImageUploadPromotionConflict", "ImageUploadPromotion",
        "ImageUploadIdempotency", "ImageObjectDeletion", "Image",
        "ImageUpload", "ImageUploadRateLimitEvent";
      INSERT INTO "ImageUpload" VALUES
        ('upload-owned', 'admin-owned', 'request-owned', 'uploads/upload-owned/smoke.webp', 'albums/album-owned/smoke.webp', 'finalizing', '2026-07-23T09:00:00Z', '2026-07-23T09:00:00Z', NULL, NULL, NULL, '2026-07-23T08:00:01Z'),
        ('upload-foreign', 'admin-foreign', 'request-foreign', 'uploads/upload-foreign/smoke.webp', 'albums/album-foreign/smoke.webp', 'finalizing', '2026-07-23T09:00:00Z', '2026-07-23T09:00:00Z', NULL, NULL, NULL, '2026-07-23T08:00:01Z');
      INSERT INTO "ImageUploadIdempotency" VALUES
        ('request-owned', 'upload-owned'), ('request-foreign', 'upload-foreign');
      INSERT INTO "ImageUploadPromotion" ("id", "uploadId", "sourceObjectKey", "destinationObjectKey", "copyState", "disposition") VALUES
        ('promotion-owned', 'upload-owned', 'uploads/upload-owned/smoke.webp', 'albums/album-owned/smoke.webp', 'copying', 'pending'),
        ('promotion-foreign', 'upload-foreign', 'uploads/upload-foreign/smoke.webp', 'albums/album-foreign/smoke.webp', 'copying', 'pending');
      INSERT INTO "ImageUploadRateLimitEvent" ("createdByAdminId") VALUES ('admin-owned'), ('admin-foreign');
    `);
  });

  it('prepares and cleans only journal-owned rows while preserving foreign and rate-limit rows', async () => {
    const foreignBefore = await pool.query(
      `SELECT * FROM "ImageUpload" WHERE "id" = 'upload-foreign'`,
    );
    const rateBefore = await pool.query(
      `SELECT * FROM "ImageUploadRateLimitEvent" ORDER BY "id"`,
    );

    await adapter.prepareResponseLoss(binding);
    await adapter.makeFailedCleanupDue(binding);
    await adapter.makeExpiredPastSkew(binding);
    const journal = {
      resources: [
        { kind: 'promotion', id: 'promotion-owned' },
        { kind: 'upload', id: 'upload-owned' },
      ],
    } as const;
    await adapter.cleanup(journal);
    await adapter.cleanup(journal);
    await adapter.verifyCleanup(journal);

    expect(
      (
        await pool.query(
          `SELECT * FROM "ImageUpload" WHERE "id" = 'upload-owned'`,
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await pool.query(
          `SELECT * FROM "ImageUpload" WHERE "id" = 'upload-foreign'`,
        )
      ).rows,
    ).toEqual(foreignBefore.rows);
    expect(
      (
        await pool.query(
          `SELECT * FROM "ImageUploadRateLimitEvent" ORDER BY "id"`,
        )
      ).rows,
    ).toEqual(rateBefore.rows);
  });
});
