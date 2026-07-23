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
    await this.withOwnedPromotion(binding, async (client) => {
      const result = await client.query(
        `UPDATE "ImageUpload"
         SET "status" = 'failed',
             "failureCode" = 'upload_storage_retryable',
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
    await this.withOwnedPromotion(binding, async (client) => {
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
        await client.query(`DELETE FROM "Image" WHERE "id" = $1`, [
          resource.id,
        ]);
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
