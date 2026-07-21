import {
  DeleteObjectCommand,
  GetBucketCorsCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import {
  canonicalReceiptSha256,
  type CommitLegacyBridgeInput,
  type CutoverBackupBinding,
  type CutoverObjectIdentity,
  type CutoverObjectStore,
  type CutoverRepository,
  type FailLegacyUploadInput,
  type LegacyImageUploadRow,
  type PollingGateSnapshot,
} from './image-upload-cutover.service';

export { canonicalReceiptSha256 };

export type QuiescedBackupReceipt = Readonly<{
  schemaVersion: 'image-upload-quiesced-backup/v1';
  backupPath: string;
  backupSha256: string;
  databaseIdentitySha256: string;
  quiescedAt: string;
  canonicalSha256: string;
}>;

export type QuiescedBackupApproval = Readonly<{
  schemaVersion: 'image-upload-quiesced-backup-approval/v1';
  backupReceiptPathSha256: string;
  backupApprovalPathSha256: string;
  backupReceiptSha256: string;
  backupPathSha256: string;
  backupSha256: string;
  operatorFingerprint: string;
  approvedAt: string;
  canonicalSha256: string;
}>;

type LegacyProjectionRow = QueryResultRow & {
  id: string;
  albumId: string;
  uploadObjectKey: string;
  finalObjectKey: string;
  filename: string;
  contentType: string;
  fileSize: number;
  status: string;
  sourceEtag: string | null;
  finalizationStartedAt: Date | null;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
  imageId: string | null;
  imageAlbumId: string | null;
  imageR2ObjectKey: string | null;
};

const LEGACY_PROJECTION_SQL = `
  SELECT
    upload."id",
    upload."albumId",
    upload."uploadObjectKey",
    upload."finalObjectKey",
    upload."filename",
    upload."contentType",
    upload."fileSize",
    upload."status",
    upload."sourceEtag",
    upload."finalizationStartedAt",
    upload."expiresAt",
    upload."consumedAt",
    upload."createdAt",
    image."id" AS "imageId",
    image."albumId" AS "imageAlbumId",
    image."r2ObjectKey" AS "imageR2ObjectKey"
  FROM "ImageUpload" AS upload
  LEFT JOIN "Image" AS image
    ON image."r2ObjectKey" = upload."finalObjectKey"
  ORDER BY upload."id"
`;

function recordId(
  receiptSha256: string,
  uploadId: string,
  kind: string,
): string {
  const namespace = Buffer.from('16e0d6a76c395dc9bc4124f847e2f36a', 'hex');
  const digest = createHash('sha1')
    .update(namespace)
    .update(`${kind}:${receiptSha256}:${uploadId}`)
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function tableExists(client: Pool | PoolClient, table: string) {
  const result = await client.query<{ exists: boolean }>(
    'SELECT to_regclass($1) IS NOT NULL AS "exists"',
    [`"${table}"`],
  );
  return result.rows[0]?.exists === true;
}

function numericCount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('database returned an invalid cutover count');
  }
  return parsed;
}

export class PgCutoverRepository implements CutoverRepository {
  constructor(
    private readonly pool: Pool,
    private readonly accountId: string,
    private readonly bucket: string,
    private readonly corsMismatch: () => Promise<number> = () =>
      Promise.resolve(0),
  ) {}

  async readLegacyRows(): Promise<readonly LegacyImageUploadRow[]> {
    const result = await this.pool.query<LegacyProjectionRow>(
      LEGACY_PROJECTION_SQL,
    );
    return result.rows.map((row) =>
      Object.freeze({
        id: row.id,
        albumId: row.albumId,
        uploadObjectKey: row.uploadObjectKey,
        finalObjectKey: row.finalObjectKey,
        filename: row.filename,
        contentType: row.contentType,
        fileSize: row.fileSize,
        status: row.status,
        sourceEtag: row.sourceEtag,
        finalizationStartedAt: row.finalizationStartedAt,
        expiresAt: row.expiresAt,
        consumedAt: row.consumedAt,
        createdAt: row.createdAt,
        image:
          row.imageId && row.imageAlbumId && row.imageR2ObjectKey
            ? Object.freeze({
                id: row.imageId,
                albumId: row.imageAlbumId,
                r2ObjectKey: row.imageR2ObjectKey,
              })
            : null,
      }),
    );
  }

  async readPollingSnapshot(observedAt: Date): Promise<PollingGateSnapshot> {
    const legacy = await this.pool.query<{
      activeUploads: string;
      expiredUploads: string;
      invalidLegacyAuthority: string;
    }>(
      `SELECT
        count(*) FILTER (
          WHERE upload."status" IN ('pending', 'finalizing')
            AND upload."expiresAt" >= $1
        ) AS "activeUploads",
        count(*) FILTER (
          WHERE upload."status" IN ('pending', 'finalizing')
            AND upload."expiresAt" < $1
        ) AS "expiredUploads",
        count(*) FILTER (
          WHERE upload."status" = 'consumed'
            AND (image."id" IS NULL OR image."albumId" <> upload."albumId")
        ) AS "invalidLegacyAuthority"
       FROM "ImageUpload" AS upload
       LEFT JOIN "Image" AS image
         ON image."r2ObjectKey" = upload."finalObjectKey"`,
      [observedAt],
    );
    const counts = legacy.rows[0];
    let unresolvedPromotions = 0;
    let invalidResponseHeadSettlement = 0;
    let openConflicts = 0;
    let dueTemporaryCleanup = 0;
    let applicableImageDeletion = 0;

    if (await tableExists(this.pool, 'ImageUploadPromotion')) {
      const result = await this.pool.query<{
        unresolved: string;
        invalid: string;
      }>(
        `SELECT
          count(*) FILTER (
            WHERE "disposition" IN ('pending', 'cleanup_required')
               OR "copyState" = 'dispatched'
          ) AS "unresolved",
          count(*) FILTER (
            WHERE
              (("copyResponseObservedAt" IS NULL) <> ("copyResponseEtag" IS NULL))
              OR (
                "copyState" = 'provider_settled'
                AND "providerSettlementObservedAt" IS NULL
              )
              OR (
                "copyResponseEtag" IS NOT NULL
                AND "destinationHeadEtag" IS NOT NULL
                AND "copyResponseEtag" <> "destinationHeadEtag"
              )
          ) AS "invalid"
         FROM "ImageUploadPromotion"`,
      );
      unresolvedPromotions = numericCount(result.rows[0].unresolved);
      invalidResponseHeadSettlement = numericCount(result.rows[0].invalid);
    }
    if (await tableExists(this.pool, 'ImageUploadPromotionConflict')) {
      const result = await this.pool.query<{ count: string }>(
        `SELECT count(*) AS "count"
         FROM "ImageUploadPromotionConflict" WHERE "state" = 'open'`,
      );
      openConflicts = numericCount(result.rows[0].count);
    }
    if (await tableExists(this.pool, 'ImageUpload')) {
      const hasCleanupColumn = await this.pool.query<{ exists: boolean }>(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'ImageUpload'
            AND column_name = 'temporaryCleanupState'
        ) AS "exists"`,
      );
      if (hasCleanupColumn.rows[0]?.exists) {
        const result = await this.pool.query<{ count: string }>(
          `SELECT count(*) AS "count" FROM "ImageUpload"
           WHERE "temporaryCleanupState" IN ('pending', 'cleanup_required')
             AND "temporaryCleanupNextAttemptAt" <= $1`,
          [observedAt],
        );
        dueTemporaryCleanup = numericCount(result.rows[0].count);
      }
    }
    if (await tableExists(this.pool, 'ImageObjectDeletion')) {
      const authorityColumn = await this.pool.query<{ exists: boolean }>(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'ImageObjectDeletion'
            AND column_name = 'authority'
        ) AS "exists"`,
      );
      const result = await this.pool.query<{ count: string }>(
        authorityColumn.rows[0]?.exists
          ? `SELECT count(*) AS "count" FROM "ImageObjectDeletion"
             WHERE "provider" = 'r2'
               AND "status" = 'pending'
               AND "authority" IN ('current_result', 'legacy_image')`
          : `SELECT count(*) AS "count" FROM "ImageObjectDeletion"
             WHERE "provider" = 'r2' AND "status" = 'pending'`,
      );
      applicableImageDeletion = numericCount(result.rows[0].count);
    }

    return {
      observedAt,
      activeUploads: numericCount(counts.activeUploads),
      expiredUploads: numericCount(counts.expiredUploads),
      unresolvedPromotions,
      invalidResponseHeadSettlement,
      openConflicts,
      dueTemporaryCleanup,
      applicableImageDeletion,
      invalidLegacyAuthority: numericCount(counts.invalidLegacyAuthority),
      corsMismatch: numericCount(await this.corsMismatch()),
    };
  }

  private async withTransaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const value = await work(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async assertPostMigrationSchema(): Promise<void> {
    const required = new Map<string, readonly string[]>([
      ['Image', ['fileSizeBytes']],
      [
        'ImageUpload',
        [
          'presignExpiresAt',
          'finalizationLeaseToken',
          'resultImageId',
          'terminalAt',
          'resultRetentionExpiresAt',
          'failureCode',
          'temporaryCleanupState',
          'temporaryCleanupNextAttemptAt',
          'temporaryCleanupVerifiedAt',
          'temporaryCleanupLastErrorCategory',
        ],
      ],
      [
        'ImageUploadPromotion',
        [
          'id',
          'uploadId',
          'origin',
          'albumId',
          'finalizationLeaseToken',
          'accountId',
          'bucket',
          'sourceObjectKey',
          'sourceEtag',
          'destinationObjectKey',
          'committedResultImageId',
          'copyState',
          'disposition',
          'providerSettlementObservedAt',
          'destinationHeadObservedAt',
          'destinationHeadEtag',
          'destinationHeadBytes',
          'destinationHeadMime',
          'destinationHeadMetadataSha256',
        ],
      ],
    ]);
    const result = await this.pool.query<{
      tableName: string;
      columnName: string;
    }>(
      `SELECT table_name AS "tableName", column_name AS "columnName"
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = ANY($1::text[])`,
      [[...required.keys()]],
    );
    const actual = new Set(
      result.rows.map((row) => `${row.tableName}.${row.columnName}`),
    );
    const missing = [...required].flatMap(([table, columns]) =>
      columns
        .filter((column) => !actual.has(`${table}.${column}`))
        .map((column) => `${table}.${column}`),
    );
    if (missing.length !== 0) {
      throw new Error(
        `post-migration schema preflight failed: missing ${missing.join(',')}`,
      );
    }
  }

  async failLegacyUpload(
    input: FailLegacyUploadInput,
  ): Promise<'applied' | 'already_applied'> {
    return this.withTransaction(async (client) => {
      const current = await client.query<{
        status: string;
        failureCode: string | null;
      }>(
        `SELECT "status", "failureCode" FROM "ImageUpload"
         WHERE "id" = $1 FOR UPDATE`,
        [input.uploadId],
      );
      const found = current.rows[0];
      if (
        found?.status === 'failed' &&
        found.failureCode === 'upload_cutover_aborted'
      ) {
        return 'already_applied';
      }
      const row = input.row;
      const updated = await client.query(
        `UPDATE "ImageUpload"
         SET
           "status" = 'failed',
           "failureCode" = 'upload_cutover_aborted',
           "terminalAt" = $2::timestamp(3),
           "presignExpiresAt" = $3::timestamp(3),
           "resultRetentionExpiresAt" = $2::timestamp(3) + interval '7 days',
           "temporaryCleanupState" = 'pending',
           "temporaryCleanupNextAttemptAt" = $4::timestamp(3),
           "temporaryCleanupVerifiedAt" = NULL,
           "temporaryCleanupLastErrorCategory" = NULL
         WHERE "id" = $1
           AND "albumId" = $5
           AND "uploadObjectKey" = $6
           AND "finalObjectKey" = $7
           AND "filename" = $8
           AND "contentType" = $9
           AND "fileSize" = $10
           AND "status" = $11
           AND "sourceEtag" IS NOT DISTINCT FROM $12
           AND "finalizationStartedAt" IS NOT DISTINCT FROM $13
           AND "expiresAt" = $14
           AND "consumedAt" IS NOT DISTINCT FROM $15
           AND "createdAt" = $16
           AND NOT EXISTS (
             SELECT 1 FROM "Image" image
             WHERE image."r2ObjectKey" = "ImageUpload"."finalObjectKey"
           )
         RETURNING "id"`,
        [
          input.uploadId,
          input.now,
          input.presignExpiresAt,
          input.cleanupNotBefore,
          row.albumId,
          row.uploadObjectKey,
          row.finalObjectKey,
          row.filename,
          row.contentType,
          row.fileSize,
          row.status,
          row.sourceEtag,
          row.finalizationStartedAt,
          row.expiresAt,
          row.consumedAt,
          row.createdAt,
        ],
      );
      if (updated.rowCount !== 1) {
        throw new Error('legacy pre-dispatch terminal CAS lost');
      }
      return 'applied';
    });
  }

  async commitLegacyBridge(
    input: CommitLegacyBridgeInput,
  ): Promise<'applied' | 'already_applied'> {
    return this.withTransaction(async (client) => {
      const existing = await client.query<{
        finalizationLeaseToken: string;
        origin: string;
        disposition: string;
      }>(
        `SELECT "finalizationLeaseToken", "origin", "disposition"
         FROM "ImageUploadPromotion" WHERE "uploadId" = $1`,
        [input.uploadId],
      );
      if (existing.rows.length !== 0) {
        const promotion = existing.rows[0];
        if (
          promotion.origin === 'legacy_bridge' &&
          promotion.disposition === 'committed' &&
          promotion.finalizationLeaseToken === input.finalizationToken
        ) {
          return 'already_applied';
        }
        throw new Error('legacy bridge authority already differs');
      }

      const row = input.row;
      const locked = await client.query(
        `SELECT "id" FROM "ImageUpload"
         WHERE "id" = $1
           AND "albumId" = $2
           AND "uploadObjectKey" = $3
           AND "finalObjectKey" = $4
           AND "filename" = $5
           AND "contentType" = $6
           AND "fileSize" = $7
           AND "status" = $8
           AND "sourceEtag" IS NOT DISTINCT FROM $9
           AND "finalizationStartedAt" IS NOT DISTINCT FROM $10
           AND "expiresAt" = $11
           AND "consumedAt" IS NOT DISTINCT FROM $12
           AND "createdAt" = $13
         FOR UPDATE`,
        [
          input.uploadId,
          row.albumId,
          row.uploadObjectKey,
          row.finalObjectKey,
          row.filename,
          row.contentType,
          row.fileSize,
          row.status,
          row.sourceEtag,
          row.finalizationStartedAt,
          row.expiresAt,
          row.consumedAt,
          row.createdAt,
        ],
      );
      if (locked.rowCount !== 1) {
        throw new Error('legacy bridge projection CAS lost');
      }

      if (
        row.image === null ||
        row.image.albumId !== row.albumId ||
        row.image.r2ObjectKey !== row.finalObjectKey
      ) {
        throw new Error(
          'legacy bridge requires exact pre-existing Image authority',
        );
      }
      const authority = await client.query<{ id: string }>(
        `SELECT "id" FROM "Image"
         WHERE "id" = $1 AND "albumId" = $2 AND "r2ObjectKey" = $3
         FOR SHARE`,
        [row.image.id, row.albumId, row.finalObjectKey],
      );
      if (authority.rows.length !== 1) {
        throw new Error(
          'legacy bridge requires exact pre-existing Image authority',
        );
      }
      const committedImageId = authority.rows[0].id;

      await client.query(
        `INSERT INTO "ImageUploadPromotion" (
          "id", "uploadId", "origin", "albumId", "finalizationLeaseToken",
          "accountId", "bucket", "sourceObjectKey", "sourceEtag",
          "destinationObjectKey", "committedResultImageId", "copyState",
          "disposition", "providerSettlementObservedAt",
          "destinationHeadObservedAt", "destinationHeadEtag",
          "destinationHeadBytes", "destinationHeadMime",
          "destinationHeadMetadataSha256", "dispatchAttempts",
          "reconcileAttempts", "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, 'legacy_bridge', $3, $4, $5, $6, $7, $8, $9, $10,
          'provider_settled', 'committed', $11, $11, $12, $13, $14, $15,
          0, 0, $11, $11
        )`,
        [
          recordId(input.receiptSha256, input.uploadId, 'promotion'),
          input.uploadId,
          row.albumId,
          input.finalizationToken,
          this.accountId,
          this.bucket,
          row.uploadObjectKey,
          row.sourceEtag,
          row.finalObjectKey,
          committedImageId,
          input.now,
          input.destination.etag,
          input.destination.bytes,
          input.destination.mime,
          input.destination.metadataSha256,
        ],
      );
      await client.query(
        `UPDATE "ImageUpload"
         SET
          "status" = 'consumed',
          "consumedAt" = COALESCE("consumedAt", $2::timestamp(3)),
          "terminalAt" = COALESCE("terminalAt", $2::timestamp(3)),
          "presignExpiresAt" = COALESCE("presignExpiresAt", $3::timestamp(3)),
          "finalizationLeaseToken" = $4,
          "resultImageId" = $5,
          "resultRetentionExpiresAt" = COALESCE(
            "resultRetentionExpiresAt", $2::timestamp(3) + interval '7 days'
          ),
          "temporaryCleanupState" = 'pending',
          "temporaryCleanupNextAttemptAt" = $6::timestamp(3),
          "temporaryCleanupVerifiedAt" = NULL
         WHERE "id" = $1`,
        [
          input.uploadId,
          input.now,
          input.presignExpiresAt,
          input.finalizationToken,
          committedImageId,
          input.cleanupNotBefore,
        ],
      );
      return 'applied';
    });
  }

  async ensureTemporaryCleanupPending(
    uploadId: string,
    now: Date,
    presignExpiresAt: Date,
    cleanupNotBefore: Date,
  ): Promise<'pending' | 'verified'> {
    if (!Number.isFinite(now.getTime())) {
      throw new Error('temporary cleanup time is invalid');
    }
    return this.withTransaction(async (client) => {
      const current = await client.query<{
        status: string;
        temporaryCleanupState: string | null;
      }>(
        `SELECT "status", "temporaryCleanupState"
         FROM "ImageUpload" WHERE "id" = $1 FOR UPDATE`,
        [uploadId],
      );
      const row = current.rows[0];
      if (!row || !['failed', 'consumed'].includes(row.status)) {
        throw new Error('temporary cleanup row is not terminal');
      }
      if (row.temporaryCleanupState === 'verified_deleted') {
        return 'verified';
      }
      if (
        row.temporaryCleanupState !== null &&
        row.temporaryCleanupState !== 'pending'
      ) {
        throw new Error('temporary cleanup state is invalid');
      }
      const updated = await client.query(
        `UPDATE "ImageUpload"
         SET
          "presignExpiresAt" = GREATEST(
            COALESCE("presignExpiresAt", $2::timestamp(3)),
            $2::timestamp(3)
          ),
          "temporaryCleanupState" = 'pending',
          "temporaryCleanupNextAttemptAt" = $3::timestamp(3),
          "temporaryCleanupVerifiedAt" = NULL
         WHERE "id" = $1
           AND "status" IN ('failed', 'consumed')
           AND "temporaryCleanupState" IS NOT DISTINCT FROM $4
         RETURNING "id"`,
        [
          uploadId,
          presignExpiresAt,
          cleanupNotBefore,
          row.temporaryCleanupState,
        ],
      );
      if (updated.rowCount !== 1) {
        throw new Error('temporary cleanup pending CAS lost');
      }
      return 'pending';
    });
  }

  async markTemporaryCleanupVerified(
    uploadId: string,
    verifiedAt: Date,
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE "ImageUpload"
       SET
        "presignExpiresAt" = COALESCE(
          "presignExpiresAt",
          GREATEST("expiresAt", "createdAt" + interval '1 hour')
        ),
        "temporaryCleanupState" = 'verified_deleted',
        "temporaryCleanupVerifiedAt" = $2::timestamp(3),
        "temporaryCleanupNextAttemptAt" = NULL,
        "temporaryCleanupLastErrorCategory" = NULL
       WHERE "id" = $1
         AND "status" IN ('failed', 'consumed')
         AND "temporaryCleanupState" = 'pending'
         AND $2::timestamp(3) >= COALESCE(
           "presignExpiresAt",
           GREATEST("expiresAt", "createdAt" + interval '1 hour')
         )`,
      [uploadId, verifiedAt],
    );
    if (result.rowCount !== 1) {
      throw new Error('temporary cleanup verification CAS lost');
    }
  }

  async readAppliedState(
    uploadId: string,
    finalizationToken: string,
  ): Promise<'failed' | 'bridged' | 'preserved' | null> {
    const result = await this.pool.query<{
      status: string;
      failureCode: string | null;
      finalizationLeaseToken: string | null;
      promotionOrigin: string | null;
      promotionDisposition: string | null;
      imageId: string | null;
    }>(
      `SELECT
        upload."status",
        upload."failureCode",
        promotion."finalizationLeaseToken",
        promotion."origin" AS "promotionOrigin",
        promotion."disposition" AS "promotionDisposition",
        image."id" AS "imageId"
       FROM "ImageUpload" upload
       LEFT JOIN "ImageUploadPromotion" promotion
         ON promotion."uploadId" = upload."id"
       LEFT JOIN "Image" image
         ON image."r2ObjectKey" = upload."finalObjectKey"
        AND image."albumId" = upload."albumId"
       WHERE upload."id" = $1`,
      [uploadId],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (
      row.promotionOrigin === 'legacy_bridge' &&
      row.promotionDisposition === 'committed' &&
      row.finalizationLeaseToken === finalizationToken
    ) {
      return 'bridged';
    }
    if (
      row.status === 'failed' &&
      row.failureCode === 'upload_cutover_aborted'
    ) {
      return 'failed';
    }
    if (row.imageId !== null) return 'preserved';
    return null;
  }
}

function canonicalEtag(value: string): string {
  const normalized = value
    .trim()
    .replace(/^W\//, '')
    .replace(/^"|"$/g, '')
    .toLowerCase();
  if (!normalized) throw new Error('R2 object ETag is missing');
  return normalized;
}

export class R2CutoverObjectStore implements CutoverObjectStore {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly expectedCorsOrigins: readonly string[] = [],
    private readonly operationTimeoutMs = 30_000,
  ) {
    if (
      !Number.isSafeInteger(operationTimeoutMs) ||
      operationTimeoutMs < 1 ||
      operationTimeoutMs > 120_000
    ) {
      throw new Error('cutover R2 operation timeout is invalid');
    }
  }

  async head(objectKey: string): Promise<CutoverObjectIdentity | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
        { abortSignal: AbortSignal.timeout(this.operationTimeoutMs) },
      );
      if (
        result.ContentLength === undefined ||
        !result.ContentType ||
        !result.ETag
      ) {
        throw new Error('R2 HEAD evidence is incomplete');
      }
      const metadata = Object.fromEntries(
        Object.entries(result.Metadata ?? {}).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      );
      return Object.freeze({
        etag: canonicalEtag(result.ETag),
        bytes: result.ContentLength,
        mime: result.ContentType.toLowerCase(),
        metadataSha256: canonicalReceiptSha256(metadata),
      });
    } catch (error) {
      const candidate = error as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      if (
        candidate.name === 'NotFound' ||
        candidate.name === 'NoSuchKey' ||
        candidate.$metadata?.httpStatusCode === 404
      ) {
        return null;
      }
      throw error;
    }
  }

  async delete(objectKey: string, expectedEtag?: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        ...(expectedEtag ? { IfMatch: expectedEtag } : {}),
      }),
      { abortSignal: AbortSignal.timeout(this.operationTimeoutMs) },
    );
  }

  async corsMismatch(): Promise<number> {
    if (this.expectedCorsOrigins.length === 0) return 0;
    const result = await this.client.send(
      new GetBucketCorsCommand({ Bucket: this.bucket }),
      { abortSignal: AbortSignal.timeout(this.operationTimeoutMs) },
    );
    const actual = new Set(
      (result.CORSRules ?? []).flatMap((rule) => rule.AllowedOrigins ?? []),
    );
    return this.expectedCorsOrigins.some((origin) => !actual.has(origin))
      ? 1
      : 0;
  }
}

export function backupBinding(
  receiptSha256: string,
  approvalSha256: string,
  receiptPathSha256: string,
  approvalPathSha256: string,
  receipt: QuiescedBackupReceipt,
  backupPathSha256: string,
): CutoverBackupBinding {
  return {
    receiptSha256,
    approvalSha256,
    receiptPathSha256,
    approvalPathSha256,
    databaseIdentitySha256: receipt.databaseIdentitySha256,
    backupSha256: receipt.backupSha256,
    backupPathSha256,
    quiescedAt: new Date(receipt.quiescedAt),
  };
}
