import type { SmokeOwnedResource } from './image-upload-production-smoke-contract';

export type ProductionSmokePgBinding = Readonly<{
  uploadId: string;
  adminId: string;
  clientRequestId: string;
  promotionId: string;
  sourceObjectKey: string;
  destinationObjectKey: string;
  releaseFingerprint: string;
  runStartedAt: string;
}>;

export type ProductionSmokePendingUpload = Readonly<{
  uploadId: string;
  adminId: string;
  clientRequestId: string;
  albumId: string;
  sourceObjectKey: string;
  destinationObjectKey: string;
  contentType: string;
  fileSize: number;
  processedSha256: string;
  createdAt: Date;
}>;

export type ProductionSmokePromotionFacts = Readonly<{
  sourceEtag: string;
  inspectedSha256: string;
  inspectedByteSize: number;
  canonicalMime: string;
  inspectedWidth: number;
  inspectedHeight: number;
  accountId: string;
  bucket: string;
  leaseToken: string;
  dispatchedAt: string;
  nextReconcileAt: string;
}>;

export type ProductionSmokePgQueryResult = Readonly<{
  rows: readonly Record<string, unknown>[];
  rowCount: number | null;
}>;

export type ProductionSmokePgClient = Readonly<{
  query: (
    text: string,
    values?: readonly unknown[],
  ) => Promise<ProductionSmokePgQueryResult>;
  release: () => void;
}>;

type ProductionSmokePgPool = Readonly<{
  connect: () => Promise<ProductionSmokePgClient>;
}>;

type JournalResources = Readonly<{ resources: readonly SmokeOwnedResource[] }>;

const RELEASE_FINGERPRINT = /^sha256:[a-f0-9]{64}$/;

function assertClosedId(value: string, name: string): void {
  if (!value || value.length > 255 || value.includes('..')) {
    throw new Error(`production smoke ${name} is invalid`);
  }
}

function assertBindingShape(binding: ProductionSmokePgBinding): void {
  for (const [name, value] of Object.entries(binding)) {
    if (name === 'runStartedAt' || name === 'releaseFingerprint') continue;
    assertClosedId(value, name);
  }
  if (!Number.isFinite(Date.parse(binding.runStartedAt))) {
    throw new Error('production smoke runStartedAt is invalid');
  }
  if (!RELEASE_FINGERPRINT.test(binding.releaseFingerprint)) {
    throw new Error('production smoke release fingerprint is invalid');
  }
  if (
    !binding.sourceObjectKey.startsWith(`uploads/${binding.uploadId}/`) ||
    !binding.destinationObjectKey.startsWith('albums/')
  ) {
    throw new Error('production smoke object-key binding is invalid');
  }
}

function assertLockedRow(
  row: Record<string, unknown> | undefined,
  binding: ProductionSmokePgBinding,
): void {
  const mismatch = !row
    ? 'missing-row'
    : row.uploadId !== binding.uploadId
      ? 'upload-id'
      : row.adminId !== binding.adminId
        ? 'admin-id'
        : row.clientRequestId !== binding.clientRequestId
          ? 'client-request-id'
          : row.promotionId !== binding.promotionId
            ? 'promotion-id'
            : row.sourceObjectKey !== binding.sourceObjectKey
              ? 'source-key'
              : row.destinationObjectKey !== binding.destinationObjectKey
                ? 'destination-key'
                : row.createdInRun !== true
                  ? 'creation-time'
                  : null;
  if (mismatch) {
    throw new Error(
      `production smoke PostgreSQL ownership precondition failed: ${mismatch}`,
    );
  }
}

export class ProductionSmokePgAdapter {
  constructor(
    private readonly pool: ProductionSmokePgPool,
    private readonly releaseFingerprint: string,
  ) {
    if (!RELEASE_FINGERPRINT.test(releaseFingerprint)) {
      throw new Error('production smoke release fingerprint is invalid');
    }
  }

  private assertRelease(binding: ProductionSmokePgBinding): void {
    assertBindingShape(binding);
    if (binding.releaseFingerprint !== this.releaseFingerprint) {
      throw new Error('production smoke release fingerprint drift');
    }
  }

  private async withOwnedPromotion(
    binding: ProductionSmokePgBinding,
    mutate: (client: ProductionSmokePgClient) => Promise<void>,
  ): Promise<void> {
    this.assertRelease(binding);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const selected = await client.query(
        `SELECT
           upload."id" AS "uploadId",
           upload."createdByAdminId" AS "adminId",
           upload."clientRequestId" AS "clientRequestId",
           upload."createdAt" AS "uploadCreatedAt",
           (upload."createdAt" >= $3::timestamp) AS "createdInRun",
           promotion."id" AS "promotionId",
           promotion."sourceObjectKey" AS "sourceObjectKey",
           promotion."destinationObjectKey" AS "destinationObjectKey"
         FROM "ImageUpload" AS upload
         JOIN "ImageUploadPromotion" AS promotion
           ON promotion."uploadId" = upload."id"
         WHERE upload."id" = $1 AND promotion."id" = $2
         FOR UPDATE OF upload, promotion`,
        [binding.uploadId, binding.promotionId, binding.runStartedAt],
      );
      assertLockedRow(selected.rows[0], binding);
      await mutate(client);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async withOwnedUpload(
    binding: ProductionSmokePgBinding,
    mutate: (
      client: ProductionSmokePgClient,
      row: Record<string, unknown>,
    ) => Promise<void>,
  ): Promise<void> {
    this.assertRelease(binding);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const selected = await client.query(
        `SELECT
           "id" AS "uploadId",
           "createdByAdminId" AS "adminId",
           "clientRequestId" AS "clientRequestId",
           "uploadObjectKey" AS "sourceObjectKey",
           "finalObjectKey" AS "destinationObjectKey",
           ("createdAt" >= $2::timestamp) AS "createdInRun"
         FROM "ImageUpload"
         WHERE "id" = $1
         FOR UPDATE`,
        [binding.uploadId, binding.runStartedAt],
      );
      const row = selected.rows[0];
      const mismatch =
        !row ||
        row.uploadId !== binding.uploadId ||
        row.adminId !== binding.adminId ||
        row.clientRequestId !== binding.clientRequestId ||
        row.sourceObjectKey !== binding.sourceObjectKey ||
        row.destinationObjectKey !== binding.destinationObjectKey ||
        row.createdInRun !== true;
      if (mismatch) {
        throw new Error(
          'production smoke PostgreSQL ownership precondition failed: upload',
        );
      }
      await mutate(client, row);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async inspectOwnedPendingUpload(options: {
    uploadId: string;
    adminId: string;
    clientRequestId: string;
    runStartedAt: string;
    releaseFingerprint: string;
  }): Promise<ProductionSmokePendingUpload> {
    if (options.releaseFingerprint !== this.releaseFingerprint) {
      throw new Error('production smoke release fingerprint drift');
    }
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT
           "id" AS "uploadId",
           "createdByAdminId" AS "adminId",
           "clientRequestId" AS "clientRequestId",
           "albumId" AS "albumId",
           "uploadObjectKey" AS "sourceObjectKey",
           "finalObjectKey" AS "destinationObjectKey",
           "contentType" AS "contentType",
           "fileSize" AS "fileSize",
           "processedSha256" AS "processedSha256",
           "createdAt" AS "createdAt"
         FROM "ImageUpload"
         WHERE "id" = $1
           AND "createdByAdminId" = $2
           AND "clientRequestId" = $3
           AND "status" = 'pending'
           AND "createdAt" >= $4::timestamp`,
        [
          options.uploadId,
          options.adminId,
          options.clientRequestId,
          options.runStartedAt,
        ],
      );
      const row = result.rows[0];
      if (
        !row ||
        typeof row.albumId !== 'string' ||
        typeof row.sourceObjectKey !== 'string' ||
        typeof row.destinationObjectKey !== 'string' ||
        typeof row.contentType !== 'string' ||
        typeof row.fileSize !== 'number' ||
        typeof row.processedSha256 !== 'string' ||
        !(row.createdAt instanceof Date)
      ) {
        throw new Error('production smoke pending upload binding is invalid');
      }
      return row as ProductionSmokePendingUpload;
    } finally {
      client.release();
    }
  }

  async hasClientRequestId(clientRequestId: string): Promise<boolean> {
    assertClosedId(clientRequestId, 'client request id');
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT count(*)::int AS "count"
         FROM "ImageUploadIdempotency"
         WHERE "clientRequestId" = $1`,
        [clientRequestId],
      );
      return Number(result.rows[0]?.count) !== 0;
    } finally {
      client.release();
    }
  }

  async assertRateLimitCapacity(
    adminId: string,
    required: Readonly<{
      upload_url: number;
      confirm_upload: number;
      upload_status: number;
    }>,
  ): Promise<void> {
    assertClosedId(adminId, 'admin id');
    const limits = {
      upload_url: 20,
      confirm_upload: 60,
      upload_status: 120,
    } as const;
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT scope."routeScope", count(event."id")::int AS "count"
         FROM (VALUES
           ('upload_url', INTERVAL '10 minutes'),
           ('confirm_upload', INTERVAL '10 minutes'),
           ('upload_status', INTERVAL '1 minute')
         ) AS scope("routeScope", "window")
         LEFT JOIN "ImageUploadRateLimitEvent" AS event
           ON event."createdByAdminId" = $1
          AND event."routeScope" = scope."routeScope"
          AND event."occurredAt" > CURRENT_TIMESTAMP - scope."window"
         GROUP BY scope."routeScope"`,
        [adminId],
      );
      const observed = new Map(
        result.rows.map((row) => [String(row.routeScope), Number(row.count)]),
      );
      for (const route of Object.keys(required) as Array<
        keyof typeof required
      >) {
        if ((observed.get(route) ?? 0) + required[route] > limits[route]) {
          throw new Error(
            'production smoke rate-limit capacity is insufficient',
          );
        }
      }
    } finally {
      client.release();
    }
  }

  async prepareDispatchedPromotion(
    binding: ProductionSmokePgBinding,
    facts: ProductionSmokePromotionFacts,
  ): Promise<void> {
    await this.withOwnedUpload(binding, async (client) => {
      const claimed = await client.query(
        `UPDATE "ImageUpload"
         SET "status" = 'finalizing',
             "sourceEtag" = $3,
             "finalizationStartedAt" = $4::timestamp,
             "finalizationLeaseToken" = $5
         WHERE "id" = $1 AND "createdByAdminId" = $2 AND "status" = 'pending'`,
        [
          binding.uploadId,
          binding.adminId,
          facts.sourceEtag,
          facts.dispatchedAt,
          facts.leaseToken,
        ],
      );
      if (claimed.rowCount !== 1) {
        throw new Error('production smoke promotion claim lost race');
      }
      const inserted = await client.query(
        `INSERT INTO "ImageUploadPromotion" (
           "id", "uploadId", "origin", "albumId", "finalizationLeaseToken",
           "accountId", "bucket", "sourceObjectKey", "sourceEtag",
           "destinationObjectKey", "inspectedSha256", "inspectedByteSize",
           "canonicalMime", "inspectedWidth", "inspectedHeight",
           "copyState", "disposition", "copyDispatchedAt", "dispatchAttempts",
           "lastDispatchAttemptAt", "nextReconcileAt", "createdAt", "updatedAt"
         )
         SELECT
           $1, upload."id", 'current', upload."albumId", $2,
           $3, $4, upload."uploadObjectKey", $5,
           upload."finalObjectKey", $6, $7, $8, $9, $10,
           'dispatched', 'pending', $11::timestamp, 1,
           $11::timestamp, $12::timestamp, $11::timestamp, $11::timestamp
         FROM "ImageUpload" AS upload
         WHERE upload."id" = $13 AND upload."createdByAdminId" = $14`,
        [
          binding.promotionId,
          facts.leaseToken,
          facts.accountId,
          facts.bucket,
          facts.sourceEtag,
          facts.inspectedSha256,
          facts.inspectedByteSize,
          facts.canonicalMime,
          facts.inspectedWidth,
          facts.inspectedHeight,
          facts.dispatchedAt,
          facts.nextReconcileAt,
          binding.uploadId,
          binding.adminId,
        ],
      );
      if (inserted.rowCount !== 1) {
        throw new Error('production smoke promotion insert failed');
      }
    });
  }

  async prepareResponseLoss(binding: ProductionSmokePgBinding): Promise<void> {
    await this.withOwnedPromotion(binding, async (client) => {
      const result = await client.query(
        `UPDATE "ImageUploadPromotion"
         SET "copyState" = 'dispatched',
             "disposition" = 'pending',
             "copyDispatchedAt" = CURRENT_TIMESTAMP,
             "copyResponseObservedAt" = NULL,
             "nextReconcileAt" = CURRENT_TIMESTAMP,
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = $1 AND "uploadId" = $2`,
        [binding.promotionId, binding.uploadId],
      );
      if (result.rowCount !== 1) {
        throw new Error('production smoke response-loss mutation lost race');
      }
    });
  }

  async prepareConflict(binding: ProductionSmokePgBinding): Promise<void> {
    await this.withOwnedPromotion(binding, async (client) => {
      const result = await client.query(
        `UPDATE "ImageUploadPromotion"
         SET "copyState" = 'dispatched',
             "disposition" = 'pending',
             "copyResponseObservedAt" = NULL,
             "nextReconcileAt" = CURRENT_TIMESTAMP,
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = $1 AND "uploadId" = $2`,
        [binding.promotionId, binding.uploadId],
      );
      if (result.rowCount !== 1) {
        throw new Error('production smoke conflict mutation lost race');
      }
    });
  }

  async makeFailedCleanupDue(binding: ProductionSmokePgBinding): Promise<void> {
    await this.withOwnedUpload(binding, async (client) => {
      const result = await client.query(
        `UPDATE "ImageUpload"
         SET "status" = 'failed',
             "failureCode" = 'upload_storage_retryable',
             "presignExpiresAt" = CURRENT_TIMESTAMP - INTERVAL '10 minutes',
             "expiresAt" = CURRENT_TIMESTAMP - INTERVAL '10 minutes',
             "temporaryCleanupState" = 'pending',
             "temporaryCleanupNextAttemptAt" = CURRENT_TIMESTAMP
         WHERE "id" = $1 AND "createdByAdminId" = $2`,
        [binding.uploadId, binding.adminId],
      );
      if (result.rowCount !== 1) {
        throw new Error('production smoke cleanup-due mutation lost race');
      }
    });
  }

  async makeExpiredPastSkew(binding: ProductionSmokePgBinding): Promise<void> {
    await this.withOwnedUpload(binding, async (client) => {
      const result = await client.query(
        `UPDATE "ImageUpload"
         SET "presignExpiresAt" = CURRENT_TIMESTAMP - INTERVAL '10 minutes',
             "expiresAt" = CURRENT_TIMESTAMP - INTERVAL '10 minutes'
         WHERE "id" = $1 AND "createdByAdminId" = $2`,
        [binding.uploadId, binding.adminId],
      );
      if (result.rowCount !== 1) {
        throw new Error('production smoke expiry mutation lost race');
      }
    });
  }

  async observePromotion(
    binding: ProductionSmokePgBinding,
  ): Promise<Record<string, unknown>> {
    this.assertRelease(binding);
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT "id", "uploadId", "copyState", "disposition",
                "copyDispatchedAt",
                "destinationHeadEtag", "destinationHeadBytes",
                "destinationHeadMime", "destinationHeadMetadataSha256"
         FROM "ImageUploadPromotion"
         WHERE "id" = $1 AND "uploadId" = $2`,
        [binding.promotionId, binding.uploadId],
      );
      if (result.rows.length !== 1) {
        throw new Error('production smoke promotion observation is absent');
      }
      return { ...result.rows[0] };
    } finally {
      client.release();
    }
  }

  async observeUpload(
    uploadId: string,
    adminId: string,
  ): Promise<Record<string, unknown> | null> {
    assertClosedId(uploadId, 'upload id');
    assertClosedId(adminId, 'admin id');
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT "id", "status", "failureCode", "resultImageId",
                "temporaryCleanupState", "temporaryCleanupVerifiedAt"
         FROM "ImageUpload"
         WHERE "id" = $1 AND "createdByAdminId" = $2`,
        [uploadId, adminId],
      );
      return result.rows[0] ? { ...result.rows[0] } : null;
    } finally {
      client.release();
    }
  }

  async observeConflictByPromotion(
    promotionId: string,
  ): Promise<Record<string, unknown> | null> {
    assertClosedId(promotionId, 'promotion id');
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM "ImageUploadPromotionConflict"
         WHERE "promotionId" = $1`,
        [promotionId],
      );
      return result.rows[0] ? { ...result.rows[0] } : null;
    } finally {
      client.release();
    }
  }

  async observeDeletionByImage(
    imageId: string,
  ): Promise<Record<string, unknown> | null> {
    assertClosedId(imageId, 'image id');
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM "ImageObjectDeletion"
         WHERE "imageId" = $1 AND "provider" = 'r2'`,
        [imageId],
      );
      return result.rows[0] ? { ...result.rows[0] } : null;
    } finally {
      client.release();
    }
  }

  async observeConflict(
    conflictId: string,
  ): Promise<Record<string, unknown> | null> {
    assertClosedId(conflictId, 'conflict id');
    return this.observeExact('ImageUploadPromotionConflict', conflictId);
  }

  async observeDeletion(
    deletionId: string,
  ): Promise<Record<string, unknown> | null> {
    assertClosedId(deletionId, 'deletion id');
    return this.observeExact('ImageObjectDeletion', deletionId);
  }

  private async observeExact(
    table: 'ImageUploadPromotionConflict' | 'ImageObjectDeletion',
    id: string,
  ): Promise<Record<string, unknown> | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM "${table}" WHERE "id" = $1`,
        [id],
      );
      return result.rows[0] ? { ...result.rows[0] } : null;
    } finally {
      client.release();
    }
  }

  async cleanup(journal: JournalResources): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const byKind = (kind: SmokeOwnedResource['kind']) =>
        journal.resources.filter((resource) => resource.kind === kind);
      for (const resource of byKind('conflict')) {
        assertClosedId(resource.id, 'conflict id');
        await client.query(
          `DELETE FROM "ImageUploadPromotionConflict" WHERE "id" = $1`,
          [resource.id],
        );
      }
      for (const resource of byKind('promotion')) {
        assertClosedId(resource.id, 'promotion id');
        await client.query(
          `DELETE FROM "ImageUploadPromotionConflict" WHERE "promotionId" = $1`,
          [resource.id],
        );
        await client.query(
          `DELETE FROM "ImageUploadPromotion" WHERE "id" = $1`,
          [resource.id],
        );
      }
      for (const resource of byKind('deletion')) {
        assertClosedId(resource.id, 'deletion id');
        await client.query(
          `DELETE FROM "ImageObjectDeletion" WHERE "id" = $1`,
          [resource.id],
        );
      }
      for (const resource of byKind('image')) {
        assertClosedId(resource.id, 'image id');
        await client.query(
          `WITH deleted AS (
             DELETE FROM "Image"
             WHERE "id" = $1
             RETURNING "albumId"
           )
           UPDATE "Album"
           SET "imageCount" = GREATEST("imageCount" - 1, 0)
           WHERE "id" IN (SELECT "albumId" FROM deleted)`,
          [resource.id],
        );
      }
      for (const resource of byKind('upload')) {
        assertClosedId(resource.id, 'upload id');
        await client.query(
          `DELETE FROM "ImageUploadIdempotency" WHERE "uploadId" = $1`,
          [resource.id],
        );
        await client.query(`DELETE FROM "ImageUpload" WHERE "id" = $1`, [
          resource.id,
        ]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async verifyCleanup(journal: JournalResources): Promise<void> {
    const tableByKind = {
      upload: 'ImageUpload',
      promotion: 'ImageUploadPromotion',
      conflict: 'ImageUploadPromotionConflict',
      image: 'Image',
      deletion: 'ImageObjectDeletion',
    } as const;
    const client = await this.pool.connect();
    try {
      for (const resource of journal.resources) {
        if (resource.kind === 'object') continue;
        assertClosedId(resource.id, `${resource.kind} id`);
        const table = tableByKind[resource.kind];
        const result = await client.query(
          `SELECT count(*)::int AS "count" FROM "${table}" WHERE "id" = $1`,
          [resource.id],
        );
        if (Number(result.rows[0]?.count) !== 0) {
          throw new Error('production smoke PostgreSQL cleanup is incomplete');
        }
      }
    } finally {
      client.release();
    }
  }
}
