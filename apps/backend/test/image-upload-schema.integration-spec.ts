import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

const execFileAsync = promisify(execFile);

type Nullable = 'YES' | 'NO';
type ColumnShape = Record<
  string,
  readonly [dataType: string, nullable: Nullable]
>;

type CatalogColumn = {
  columnName: string;
  dataType: string;
  nullable: Nullable;
};

type CatalogConstraint = {
  name: string;
  type: string;
  definition: string;
  referencedTable: string | null;
  deleteAction: string;
  deferrable: boolean;
  initiallyDeferred: boolean;
};

type CatalogIndex = {
  name: string;
  columns: string[];
  unique: boolean;
  primary: boolean;
  predicate: string | null;
};

const IMAGE_COLUMNS: ColumnShape = {
  id: ['text', 'NO'],
  albumId: ['text', 'NO'],
  filename: ['text', 'NO'],
  r2ObjectKey: ['text', 'YES'],
  uploadStatus: ['text', 'NO'],
  thumbnailUrl: ['text', 'NO'],
  smallUrl: ['text', 'NO'],
  mediumUrl: ['text', 'NO'],
  largeUrl: ['text', 'NO'],
  xlargeUrl: ['text', 'NO'],
  altText: ['text', 'YES'],
  orderIndex: ['integer', 'NO'],
  width: ['integer', 'YES'],
  height: ['integer', 'YES'],
  fileSizeKb: ['integer', 'YES'],
  createdAt: ['timestamp without time zone', 'NO'],
  fileSizeBytes: ['integer', 'YES'],
};

const IMAGE_UPLOAD_COLUMNS: ColumnShape = {
  id: ['text', 'NO'],
  albumId: ['text', 'NO'],
  uploadObjectKey: ['text', 'NO'],
  finalObjectKey: ['text', 'NO'],
  filename: ['text', 'NO'],
  contentType: ['text', 'NO'],
  fileSize: ['integer', 'NO'],
  status: ['text', 'NO'],
  sourceEtag: ['text', 'YES'],
  finalizationStartedAt: ['timestamp without time zone', 'YES'],
  expiresAt: ['timestamp without time zone', 'NO'],
  consumedAt: ['timestamp without time zone', 'YES'],
  createdAt: ['timestamp without time zone', 'NO'],
  clientRequestId: ['text', 'YES'],
  createdByAdminId: ['text', 'YES'],
  policyVersion: ['text', 'YES'],
  policySnapshot: ['jsonb', 'YES'],
  processedSha256: ['text', 'YES'],
  presignExpiresAt: ['timestamp without time zone', 'YES'],
  finalizationLeaseToken: ['text', 'YES'],
  resultImageId: ['text', 'YES'],
  resultDeletedAt: ['timestamp without time zone', 'YES'],
  terminalAt: ['timestamp without time zone', 'YES'],
  resultRetentionExpiresAt: ['timestamp without time zone', 'YES'],
  failureCode: ['text', 'YES'],
  temporaryCleanupState: ['text', 'YES'],
  temporaryCleanupAttempts: ['integer', 'NO'],
  temporaryCleanupNextAttemptAt: ['timestamp without time zone', 'YES'],
  temporaryCleanupVerifiedAt: ['timestamp without time zone', 'YES'],
  temporaryCleanupLastErrorCategory: ['text', 'YES'],
};

const IDEMPOTENCY_COLUMNS: ColumnShape = {
  clientRequestId: ['text', 'NO'],
  createdByAdminId: ['text', 'NO'],
  uploadId: ['text', 'NO'],
  requestFingerprint: ['text', 'NO'],
  terminalOutcome: ['text', 'YES'],
  resultImageId: ['text', 'YES'],
  resultDeletedAt: ['timestamp without time zone', 'YES'],
  failureCode: ['text', 'YES'],
  terminalAt: ['timestamp without time zone', 'YES'],
  resultRetentionExpiresAt: ['timestamp without time zone', 'YES'],
  createdAt: ['timestamp without time zone', 'NO'],
  archivedAt: ['timestamp without time zone', 'YES'],
};

const PROMOTION_COLUMNS: ColumnShape = {
  id: ['text', 'NO'],
  uploadId: ['text', 'NO'],
  origin: ['text', 'NO'],
  albumId: ['text', 'NO'],
  finalizationLeaseToken: ['text', 'NO'],
  accountId: ['text', 'NO'],
  bucket: ['text', 'NO'],
  sourceObjectKey: ['text', 'NO'],
  sourceEtag: ['text', 'YES'],
  destinationObjectKey: ['text', 'NO'],
  inspectedSha256: ['text', 'YES'],
  inspectedByteSize: ['integer', 'YES'],
  canonicalMime: ['text', 'YES'],
  inspectedWidth: ['integer', 'YES'],
  inspectedHeight: ['integer', 'YES'],
  policyVersion: ['text', 'YES'],
  committedResultImageId: ['text', 'YES'],
  copyState: ['text', 'NO'],
  disposition: ['text', 'NO'],
  copyDispatchedAt: ['timestamp without time zone', 'YES'],
  copyResponseObservedAt: ['timestamp without time zone', 'YES'],
  copyResponseEtag: ['text', 'YES'],
  providerSettlementObservedAt: ['timestamp without time zone', 'YES'],
  providerEventId: ['text', 'YES'],
  providerEventObservedAt: ['timestamp without time zone', 'YES'],
  settlementSource: ['text', 'YES'],
  providerObjectEtag: ['text', 'YES'],
  dispatchAttempts: ['integer', 'NO'],
  lastDispatchAttemptAt: ['timestamp without time zone', 'YES'],
  nextReconcileAt: ['timestamp without time zone', 'YES'],
  firstDestinationAbsentAt: ['timestamp without time zone', 'YES'],
  destinationAbsentVerifiedAt: ['timestamp without time zone', 'YES'],
  dispatchRejectedAt: ['timestamp without time zone', 'YES'],
  dispatchRejectionReason: ['text', 'YES'],
  dispatchRejectionObservedSourceEtag: ['text', 'YES'],
  reconcileAttempts: ['integer', 'NO'],
  lastReconciledAt: ['timestamp without time zone', 'YES'],
  createdAt: ['timestamp without time zone', 'NO'],
  updatedAt: ['timestamp without time zone', 'NO'],
};

const HEARTBEAT_COLUMNS: ColumnShape = {
  id: ['text', 'NO'],
  ownerId: ['text', 'NO'],
  buildFingerprint: ['text', 'NO'],
  lockAcquiredAt: ['timestamp without time zone', 'NO'],
  heartbeatAt: ['timestamp without time zone', 'NO'],
  queueSettlementCompletedAt: ['timestamp without time zone', 'YES'],
  pendingSessionExpiryCompletedAt: ['timestamp without time zone', 'YES'],
  promotionRecoveryCompletedAt: ['timestamp without time zone', 'YES'],
  temporaryCleanupCompletedAt: ['timestamp without time zone', 'YES'],
  imageDeletionCompletedAt: ['timestamp without time zone', 'YES'],
  rateLimitCleanupCompletedAt: ['timestamp without time zone', 'YES'],
  updatedAt: ['timestamp without time zone', 'NO'],
};

const DELETION_COLUMNS: ColumnShape = {
  id: ['text', 'NO'],
  imageId: ['text', 'YES'],
  provider: ['text', 'NO'],
  objectKey: ['text', 'NO'],
  status: ['text', 'NO'],
  attempts: ['integer', 'NO'],
  lastError: ['text', 'YES'],
  deletedAt: ['timestamp without time zone', 'YES'],
  createdAt: ['timestamp without time zone', 'NO'],
  updatedAt: ['timestamp without time zone', 'NO'],
  authority: ['text', 'NO'],
  objectKeyHash: ['text', 'YES'],
  legacyImageSnapshotSha256: ['text', 'YES'],
  providerDisposition: ['text', 'YES'],
};

const CONFLICT_COLUMNS: ColumnShape = {
  id: ['text', 'NO'],
  promotionId: ['text', 'NO'],
  providerEventId: ['text', 'NO'],
  accountId: ['text', 'NO'],
  bucket: ['text', 'NO'],
  sourceObjectKeyHash: ['text', 'NO'],
  destinationObjectKeyHash: ['text', 'NO'],
  eventTime: ['timestamp without time zone', 'NO'],
  eventEnvelopeSha256: ['text', 'NO'],
  providerObjectEtag: ['text', 'NO'],
  rejectionDispatchRejectedAt: ['timestamp without time zone', 'NO'],
  rejectionReason: ['text', 'NO'],
  rejectionObservedSourceEtag: ['text', 'YES'],
  rejectionFirstDestinationAbsentAt: ['timestamp without time zone', 'NO'],
  rejectionDestinationAbsentVerifiedAt: ['timestamp without time zone', 'NO'],
  rejectionEvidenceSha256: ['text', 'NO'],
  state: ['text', 'NO'],
  resolution: ['text', 'YES'],
  operatorIdentityFingerprint: ['text', 'YES'],
  approvalDigest: ['text', 'YES'],
  observedDestinationEtag: ['text', 'YES'],
  openedAt: ['timestamp without time zone', 'NO'],
  resolvedAt: ['timestamp without time zone', 'YES'],
  finalAbsentVerifiedAt: ['timestamp without time zone', 'YES'],
  updatedAt: ['timestamp without time zone', 'NO'],
};

const QUARANTINE_COLUMNS: ColumnShape = {
  id: ['text', 'NO'],
  providerEventId: ['text', 'YES'],
  messageId: ['text', 'NO'],
  sourceQueueId: ['text', 'NO'],
  currentQueueId: ['text', 'NO'],
  latestLocationObservationSha256: ['text', 'YES'],
  leaseId: ['text', 'NO'],
  leaseDeadline: ['timestamp without time zone', 'NO'],
  attempts: ['integer', 'NO'],
  bodySha256: ['text', 'NO'],
  eventEnvelopeSha256: ['text', 'YES'],
  quarantineFingerprintSha256: ['text', 'NO'],
  reason: ['text', 'NO'],
  firstObservedAt: ['timestamp without time zone', 'NO'],
  lastObservedAt: ['timestamp without time zone', 'NO'],
  state: ['text', 'NO'],
  resolutionAttemptId: ['text', 'YES'],
  latestResolutionAttemptId: ['text', 'YES'],
  latestResolutionEvidenceSha256: ['text', 'YES'],
  resolution: ['text', 'YES'],
  resolutionStartedAt: ['timestamp without time zone', 'YES'],
  acknowledgedLocationCount: ['integer', 'YES'],
  resolutionScanCompletedAt: ['timestamp without time zone', 'YES'],
  operatorIdentityFingerprint: ['text', 'YES'],
  approvalDigest: ['text', 'YES'],
  replayQueueId: ['text', 'YES'],
  replayRequestId: ['text', 'YES'],
  replayMessageId: ['text', 'YES'],
  replayRequestedAt: ['timestamp without time zone', 'YES'],
  acknowledgedAt: ['timestamp without time zone', 'YES'],
  resolvedAt: ['timestamp without time zone', 'YES'],
};

const QUARANTINE_LOCATION_COLUMNS: ColumnShape = {
  id: ['text', 'NO'],
  quarantineId: ['text', 'NO'],
  queueKind: ['text', 'NO'],
  queueId: ['text', 'NO'],
  messageId: ['text', 'NO'],
  replayRequestId: ['text', 'YES'],
  leaseId: ['text', 'NO'],
  leaseDeadline: ['timestamp without time zone', 'NO'],
  attempts: ['integer', 'NO'],
  observedAt: ['timestamp without time zone', 'NO'],
  locationObservationSha256: ['text', 'NO'],
};

const QUARANTINE_ACTION_COLUMNS: ColumnShape = {
  id: ['text', 'NO'],
  quarantineId: ['text', 'NO'],
  resolutionAttemptId: ['text', 'NO'],
  locationObservationSha256: ['text', 'NO'],
  action: ['text', 'NO'],
  queueKind: ['text', 'NO'],
  queueId: ['text', 'NO'],
  messageId: ['text', 'NO'],
  replayRequestId: ['text', 'YES'],
  leaseId: ['text', 'NO'],
  actionEvidenceSha256: ['text', 'NO'],
  providerOutcome: ['text', 'YES'],
  observedAt: ['timestamp without time zone', 'NO'],
  actionSha256: ['text', 'NO'],
};

const QUARANTINE_RESOLUTION_COLUMNS: ColumnShape = {
  id: ['text', 'NO'],
  quarantineId: ['text', 'NO'],
  resolution: ['text', 'NO'],
  operatorIdentityFingerprint: ['text', 'NO'],
  approvalDigest: ['text', 'NO'],
  resolutionStartedAt: ['timestamp without time zone', 'NO'],
  acknowledgedLocationCount: ['integer', 'NO'],
  resolutionScanCompletedAt: ['timestamp without time zone', 'NO'],
  replayQueueId: ['text', 'YES'],
  replayRequestId: ['text', 'YES'],
  replayMessageId: ['text', 'YES'],
  replayRequestedAt: ['timestamp without time zone', 'YES'],
  acknowledgedAt: ['timestamp without time zone', 'NO'],
  resolvedAt: ['timestamp without time zone', 'NO'],
  resolutionEvidenceSha256: ['text', 'NO'],
};

const RATE_LIMIT_COLUMNS: ColumnShape = {
  id: ['bigint', 'NO'],
  createdByAdminId: ['text', 'NO'],
  routeScope: ['text', 'NO'],
  occurredAt: ['timestamp without time zone', 'NO'],
};

describe('image upload roll-forward schema contract (PostgreSQL)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;

  jest.setTimeout(120_000);

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const databaseUrl = container.getConnectionUri();
    process.env.DATABASE_URL = databaseUrl;
    process.env.DIRECT_URL = databaseUrl;

    const schemaPath = resolve(__dirname, '../prisma/schema.prisma');
    const runPrisma = (args: string[]) =>
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

    await runPrisma([
      'db',
      'push',
      '--force-reset',
      '--skip-generate',
      '--schema',
      schemaPath,
    ]);

    const baselineClient = new PrismaClient({ datasourceUrl: databaseUrl });
    await baselineClient.$connect();
    try {
      for (const statement of [
        'CREATE ROLE anon NOLOGIN',
        'CREATE ROLE authenticated NOLOGIN',
        'CREATE ROLE supabase_auth_admin NOLOGIN',
        'CREATE ROLE service_role NOLOGIN',
        'CREATE SCHEMA auth',
        'CREATE TABLE auth.users (id uuid PRIMARY KEY)',
      ]) {
        await baselineClient.$executeRawUnsafe(statement);
      }

      for (const table of [
        'ImageUploadProviderEventQuarantineAction',
        'ImageUploadProviderEventQuarantineLocation',
        'ImageUploadProviderEventQuarantineResolution',
        'ImageUploadProviderEventQuarantine',
        'ImageUploadPromotionConflict',
        'ImageUploadPromotion',
        'ImageUploadIdempotency',
        'ImageUploadRateLimitEvent',
        'ImageUploadReconcilerHeartbeat',
      ]) {
        await baselineClient.$executeRawUnsafe(
          `DROP TABLE IF EXISTS "${table}" CASCADE`,
        );
      }

      await baselineClient.$executeRawUnsafe(`
        ALTER TABLE "Image"
          DROP COLUMN IF EXISTS "fileSizeBytes"
      `);
      await baselineClient.$executeRawUnsafe(`
        ALTER TABLE "ImageUpload"
          DROP COLUMN IF EXISTS "clientRequestId",
          DROP COLUMN IF EXISTS "createdByAdminId",
          DROP COLUMN IF EXISTS "policyVersion",
          DROP COLUMN IF EXISTS "policySnapshot",
          DROP COLUMN IF EXISTS "processedSha256",
          DROP COLUMN IF EXISTS "presignExpiresAt",
          DROP COLUMN IF EXISTS "finalizationLeaseToken",
          DROP COLUMN IF EXISTS "resultImageId",
          DROP COLUMN IF EXISTS "resultDeletedAt",
          DROP COLUMN IF EXISTS "terminalAt",
          DROP COLUMN IF EXISTS "resultRetentionExpiresAt",
          DROP COLUMN IF EXISTS "failureCode",
          DROP COLUMN IF EXISTS "temporaryCleanupState",
          DROP COLUMN IF EXISTS "temporaryCleanupAttempts",
          DROP COLUMN IF EXISTS "temporaryCleanupNextAttemptAt",
          DROP COLUMN IF EXISTS "temporaryCleanupVerifiedAt",
          DROP COLUMN IF EXISTS "temporaryCleanupLastErrorCategory"
      `);
      await baselineClient.$executeRawUnsafe(`
        ALTER TABLE "ImageObjectDeletion"
          DROP COLUMN IF EXISTS "authority",
          DROP COLUMN IF EXISTS "objectKeyHash",
          DROP COLUMN IF EXISTS "legacyImageSnapshotSha256",
          DROP COLUMN IF EXISTS "providerDisposition"
      `);

      await baselineClient.$executeRawUnsafe(
        'DROP TABLE "CloudflareStaticAssetMigration"',
      );
      await baselineClient.$executeRawUnsafe(
        'DROP TABLE "ImageStorageMigration"',
      );
      await baselineClient.$executeRawUnsafe(
        'DROP TABLE "ImageObjectDeletion"',
      );
      await baselineClient.$executeRawUnsafe('DROP TABLE "ImageUpload"');
      await baselineClient.$executeRawUnsafe(
        'ALTER TABLE "Album" DROP COLUMN "deleteStartedAt"',
      );
      await baselineClient.$executeRawUnsafe(
        'ALTER TABLE "Album" DROP COLUMN "deleteStatus"',
      );
    } finally {
      await baselineClient.$disconnect();
    }

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

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  async function columns(
    table: string,
  ): Promise<Record<string, [string, Nullable]>> {
    const rows = await prisma.$queryRawUnsafe<CatalogColumn[]>(
      `
        SELECT
          column_name AS "columnName",
          data_type AS "dataType",
          is_nullable AS "nullable"
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = $1
        ORDER BY column_name
      `,
      table,
    );

    return Object.fromEntries(
      rows.map((row) => [row.columnName, [row.dataType, row.nullable]]),
    );
  }

  async function constraints(table: string): Promise<CatalogConstraint[]> {
    return prisma.$queryRawUnsafe<CatalogConstraint[]>(
      `
        SELECT
          constraint_record.conname AS "name",
          constraint_record.contype::text AS "type",
          pg_get_constraintdef(constraint_record.oid, true) AS "definition",
          referenced.relname AS "referencedTable",
          constraint_record.confdeltype::text AS "deleteAction",
          constraint_record.condeferrable AS "deferrable",
          constraint_record.condeferred AS "initiallyDeferred"
        FROM pg_constraint AS constraint_record
        JOIN pg_class AS relation
          ON relation.oid = constraint_record.conrelid
        JOIN pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        LEFT JOIN pg_class AS referenced
          ON referenced.oid = constraint_record.confrelid
        WHERE namespace.nspname = current_schema()
          AND relation.relname = $1
        ORDER BY constraint_record.conname
      `,
      table,
    );
  }

  async function indexes(table: string): Promise<CatalogIndex[]> {
    const rows = await prisma.$queryRawUnsafe<CatalogIndex[]>(
      `
        SELECT
          index_relation.relname AS "name",
          ARRAY(
            SELECT pg_get_indexdef(index_record.indexrelid, position, true)
            FROM generate_series(1, index_record.indnkeyatts) AS position
            ORDER BY position
          ) AS "columns",
          index_record.indisunique AS "unique",
          index_record.indisprimary AS "primary",
          pg_get_expr(
            index_record.indpred,
            index_record.indrelid,
            true
          ) AS "predicate"
        FROM pg_index AS index_record
        JOIN pg_class AS table_relation
          ON table_relation.oid = index_record.indrelid
        JOIN pg_namespace AS namespace
          ON namespace.oid = table_relation.relnamespace
        JOIN pg_class AS index_relation
          ON index_relation.oid = index_record.indexrelid
        WHERE namespace.nspname = current_schema()
          AND table_relation.relname = $1
        ORDER BY index_relation.relname
      `,
      table,
    );

    return rows.map((row) => ({
      ...row,
      columns: row.columns.map((column) => column.replaceAll('"', '')),
    }));
  }

  async function expectColumns(table: string, expected: ColumnShape) {
    await expect(columns(table)).resolves.toEqual(expected);
  }

  async function expectIndex(
    table: string,
    expectedColumns: string[],
    options: {
      unique?: boolean;
      primary?: boolean;
      predicate?: string[];
    } = {},
  ) {
    const tableIndexes = await indexes(table);
    const matching = tableIndexes.find(
      (index) =>
        JSON.stringify(index.columns) === JSON.stringify(expectedColumns) &&
        index.unique === (options.unique ?? false) &&
        index.primary === (options.primary ?? false),
    );

    expect(matching).toBeDefined();
    for (const fragment of options.predicate ?? []) {
      expect(normalize(matching?.predicate ?? '')).toContain(
        normalize(fragment),
      );
    }
  }

  async function expectCheckValues(
    table: string,
    constraintName: string,
    expectedValues: string[],
  ) {
    const tableConstraints = await constraints(table);
    const constraint = tableConstraints.find(
      (candidate) => candidate.name === constraintName,
    );
    expect(constraint).toBeDefined();
    expect(constraint?.type).toBe('c');

    const actualValues = [
      ...new Set(
        [...(constraint?.definition.matchAll(/'([^']+)'/g) ?? [])].map(
          (match) => match[1],
        ),
      ),
    ].sort();
    expect(actualValues).toEqual([...expectedValues].sort());
  }

  async function expectConstraintDefinition(
    table: string,
    constraintName: string,
    expectedFragments: string[],
  ) {
    const tableConstraints = await constraints(table);
    const constraint = tableConstraints.find(
      (candidate) => candidate.name === constraintName,
    );
    expect(constraint).toBeDefined();
    for (const fragment of expectedFragments) {
      expect(normalize(constraint?.definition ?? '')).toContain(
        normalize(fragment),
      );
    }
  }

  function normalize(value: string) {
    return value
      .replaceAll('"', '')
      .replaceAll('::text', '')
      .replace(/[\s()]/g, '');
  }

  it('keeps the full legacy Image and ImageUpload shapes while adding the rollout columns', async () => {
    await expectColumns('Image', IMAGE_COLUMNS);
    await expectColumns('ImageUpload', IMAGE_UPLOAD_COLUMNS);

    const defaults = await prisma.$queryRawUnsafe<
      Array<{ columnName: string; columnDefault: string | null }>
    >(
      `
        SELECT
          column_name AS "columnName",
          column_default AS "columnDefault"
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'ImageUpload'
          AND column_name = 'temporaryCleanupAttempts'
      `,
    );
    expect(defaults).toHaveLength(1);
    expect(normalize(defaults[0].columnDefault ?? '')).toBe('0');

    await expectIndex('ImageUpload', ['clientRequestId'], { unique: true });
    await expectIndex('ImageUpload', ['createdByAdminId', 'createdAt']);
    await expectIndex('ImageUpload', [
      'temporaryCleanupState',
      'temporaryCleanupNextAttemptAt',
    ]);
    await expectCheckValues(
      'ImageUpload',
      'ImageUpload_temporary_cleanup_state_check',
      ['pending', 'verified_deleted'],
    );
  });

  it('locks the permanent idempotency schema and indexes', async () => {
    await expectColumns('ImageUploadIdempotency', IDEMPOTENCY_COLUMNS);
    await expectIndex('ImageUploadIdempotency', ['clientRequestId'], {
      unique: true,
      primary: true,
    });
    await expectIndex('ImageUploadIdempotency', ['uploadId'], {
      unique: true,
    });
    await expectIndex('ImageUploadIdempotency', [
      'createdByAdminId',
      'createdAt',
    ]);
    await expectIndex('ImageUploadIdempotency', ['createdAt']);
  });

  it('locks promotion evidence, states, coupling, uniqueness, and due-work indexes', async () => {
    await expectColumns('ImageUploadPromotion', PROMOTION_COLUMNS);
    await expectIndex('ImageUploadPromotion', ['id'], {
      unique: true,
      primary: true,
    });
    await expectIndex('ImageUploadPromotion', ['uploadId'], { unique: true });
    await expectIndex('ImageUploadPromotion', ['destinationObjectKey'], {
      unique: true,
    });
    await expectIndex('ImageUploadPromotion', ['copyState', 'nextReconcileAt']);
    await expectIndex('ImageUploadPromotion', [
      'disposition',
      'nextReconcileAt',
    ]);
    await expectIndex('ImageUploadPromotion', ['albumId', 'disposition']);
    await expectIndex(
      'ImageUploadPromotion',
      ['settlementSource', 'providerEventId'],
      {
        unique: true,
        predicate: [
          'settlementSource IS NOT NULL',
          'providerEventId IS NOT NULL',
        ],
      },
    );

    await expectCheckValues(
      'ImageUploadPromotion',
      'ImageUploadPromotion_origin_check',
      ['current', 'legacy_bridge'],
    );
    await expectCheckValues(
      'ImageUploadPromotion',
      'ImageUploadPromotion_copyState_check',
      ['dispatched', 'provider_settled', 'dispatch_rejected'],
    );
    await expectCheckValues(
      'ImageUploadPromotion',
      'ImageUploadPromotion_disposition_check',
      [
        'pending',
        'committed',
        'cleanup_required',
        'verified_deleted',
        'not_created',
      ],
    );
    await expectConstraintDefinition(
      'ImageUploadPromotion',
      'ImageUploadPromotion_current_facts_check',
      [
        "origin <> 'current'",
        'sourceEtag IS NOT NULL',
        'inspectedSha256 IS NOT NULL',
        'inspectedByteSize IS NOT NULL',
        'canonicalMime IS NOT NULL',
        'inspectedWidth IS NOT NULL',
        'inspectedHeight IS NOT NULL',
        'policyVersion IS NOT NULL',
        'copyDispatchedAt IS NOT NULL',
        'lastDispatchAttemptAt IS NOT NULL',
        'nextReconcileAt IS NOT NULL',
        'dispatchAttempts >= 1',
      ],
    );
    await expectConstraintDefinition(
      'ImageUploadPromotion',
      'ImageUploadPromotion_source_etag_check',
      [
        'sourceEtag IS NOT NULL',
        "origin = 'legacy_bridge'",
        "disposition = 'committed'",
        "copyState = 'provider_settled'",
      ],
    );
    await expectConstraintDefinition(
      'ImageUploadPromotion',
      'ImageUploadPromotion_committed_result_check',
      ["disposition <> 'committed'", 'committedResultImageId IS NOT NULL'],
    );
    await expectConstraintDefinition(
      'ImageUploadPromotion',
      'ImageUploadPromotion_provider_evidence_check',
      [
        "copyState <> 'provider_settled'",
        'providerSettlementObservedAt IS NOT NULL',
        'copyResponseObservedAt IS NOT NULL',
        'copyResponseEtag IS NOT NULL',
        'providerEventId IS NOT NULL',
        'providerEventObservedAt IS NOT NULL',
        'settlementSource IS NOT NULL',
        'providerObjectEtag IS NOT NULL',
        'copyResponseEtag IS NULL',
        'providerObjectEtag IS NULL',
        'copyResponseEtag = providerObjectEtag',
      ],
    );
    await expectConstraintDefinition(
      'ImageUploadPromotion',
      'ImageUploadPromotion_response_pair_check',
      [
        'copyResponseObservedAt IS NULL = copyResponseEtag IS NULL',
        "copyResponseObservedAt IS NULL OR copyState = 'provider_settled'",
      ],
    );
    await expectConstraintDefinition(
      'ImageUploadPromotion',
      'ImageUploadPromotion_event_evidence_check',
      [
        'providerEventId IS NULL',
        'providerEventObservedAt IS NULL',
        'settlementSource IS NULL',
        'providerObjectEtag IS NULL',
        "copyState = 'provider_settled'",
      ],
    );
    await expectConstraintDefinition(
      'ImageUploadPromotion',
      'ImageUploadPromotion_dispatch_rejected_check',
      [
        "copyState = 'dispatch_rejected' AND disposition = 'not_created'",
        "copyState <> 'dispatch_rejected' AND disposition <> 'not_created'",
        'dispatchRejectedAt IS NOT NULL',
        'providerSettlementObservedAt IS NULL',
        'copyResponseObservedAt IS NULL',
        'copyResponseEtag IS NULL',
        'providerEventId IS NULL',
        'providerEventObservedAt IS NULL',
        'settlementSource IS NULL',
        'providerObjectEtag IS NULL',
        'committedResultImageId IS NULL',
        'firstDestinationAbsentAt IS NOT NULL',
        'destinationAbsentVerifiedAt IS NOT NULL',
        'destinationAbsentVerifiedAt > firstDestinationAbsentAt',
        'dispatchRejectedAt >= destinationAbsentVerifiedAt',
        "dispatchRejectionReason = 'source_missing'",
        'dispatchRejectionObservedSourceEtag IS NULL',
        "dispatchRejectionReason = 'source_etag_mismatch'",
        'dispatchRejectionObservedSourceEtag IS NOT NULL',
        'dispatchRejectionObservedSourceEtag <> sourceEtag',
      ],
    );
  });

  it('locks the singleton-compatible reconciler heartbeat shape', async () => {
    await expectColumns('ImageUploadReconcilerHeartbeat', HEARTBEAT_COLUMNS);
    await expectIndex('ImageUploadReconcilerHeartbeat', ['id'], {
      unique: true,
      primary: true,
    });
    await expectConstraintDefinition(
      'ImageUploadReconcilerHeartbeat',
      'ImageUploadReconcilerHeartbeat_singleton_check',
      ["id = 'singleton'"],
    );
  });

  it('extends the existing deletion ledger with closed deletion authority', async () => {
    await expectColumns('ImageObjectDeletion', DELETION_COLUMNS);
    await expectCheckValues(
      'ImageObjectDeletion',
      'ImageObjectDeletion_authority_check',
      ['current_result', 'legacy_image', 'non_r2_deferred'],
    );
    await expectCheckValues(
      'ImageObjectDeletion',
      'ImageObjectDeletion_provider_disposition_check',
      ['legacy_deferred', 'not_applicable'],
    );
    await expectConstraintDefinition(
      'ImageObjectDeletion',
      'ImageObjectDeletion_authority_evidence_check',
      [
        "authority = 'current_result'",
        'objectKeyHash IS NOT NULL',
        'legacyImageSnapshotSha256 IS NULL',
        'providerDisposition IS NULL',
        "authority = 'legacy_image'",
        'legacyImageSnapshotSha256 IS NOT NULL',
        "authority = 'non_r2_deferred'",
        'providerDisposition IS NOT NULL',
      ],
    );
  });

  it('locks immutable late-event conflict snapshots and closed resolutions', async () => {
    await expectColumns('ImageUploadPromotionConflict', CONFLICT_COLUMNS);
    await expectIndex('ImageUploadPromotionConflict', ['id'], {
      unique: true,
      primary: true,
    });
    await expectIndex(
      'ImageUploadPromotionConflict',
      ['promotionId', 'providerEventId'],
      { unique: true },
    );
    await expectIndex('ImageUploadPromotionConflict', ['state', 'openedAt']);

    await expectCheckValues(
      'ImageUploadPromotionConflict',
      'ImageUploadPromotionConflict_state_check',
      ['open', 'resolved'],
    );
    await expectConstraintDefinition(
      'ImageUploadPromotionConflict',
      'ImageUploadPromotionConflict_rejection_snapshot_check',
      [
        "rejectionReason = 'source_missing'",
        "rejectionReason = 'source_etag_mismatch'",
        'rejectionDestinationAbsentVerifiedAt > rejectionFirstDestinationAbsentAt',
        'rejectionDispatchRejectedAt >= rejectionDestinationAbsentVerifiedAt',
        'rejectionObservedSourceEtag IS NULL',
        'rejectionObservedSourceEtag IS NOT NULL',
      ],
    );
    await expectConstraintDefinition(
      'ImageUploadPromotionConflict',
      'ImageUploadPromotionConflict_resolution_check',
      [
        "state = 'open'",
        'resolution IS NULL',
        'resolvedAt IS NULL',
        "state = 'resolved'",
        "resolution = ANY (ARRAY['confirmed_absent_ack'",
        "'cleanup_authorized'",
        "'committed_authorized'",
        'resolvedAt IS NOT NULL',
        'operatorIdentityFingerprint IS NOT NULL',
        'approvalDigest IS NOT NULL',
      ],
    );
  });

  it('locks quarantine identity, replay, location, action, and resolution evidence', async () => {
    await expectColumns(
      'ImageUploadProviderEventQuarantine',
      QUARANTINE_COLUMNS,
    );
    await expectColumns(
      'ImageUploadProviderEventQuarantineLocation',
      QUARANTINE_LOCATION_COLUMNS,
    );
    await expectColumns(
      'ImageUploadProviderEventQuarantineAction',
      QUARANTINE_ACTION_COLUMNS,
    );
    await expectColumns(
      'ImageUploadProviderEventQuarantineResolution',
      QUARANTINE_RESOLUTION_COLUMNS,
    );

    await expectIndex('ImageUploadProviderEventQuarantine', ['id'], {
      unique: true,
      primary: true,
    });
    await expectIndex(
      'ImageUploadProviderEventQuarantine',
      ['providerEventId'],
      { unique: true },
    );
    await expectIndex(
      'ImageUploadProviderEventQuarantine',
      ['replayRequestId'],
      { unique: true },
    );
    await expectIndex(
      'ImageUploadProviderEventQuarantine',
      ['quarantineFingerprintSha256'],
      { unique: true },
    );
    await expectIndex('ImageUploadProviderEventQuarantine', [
      'state',
      'lastObservedAt',
    ]);

    await expectIndex('ImageUploadProviderEventQuarantineLocation', ['id'], {
      unique: true,
      primary: true,
    });
    await expectIndex(
      'ImageUploadProviderEventQuarantineLocation',
      ['locationObservationSha256'],
      { unique: true },
    );
    await expectIndex(
      'ImageUploadProviderEventQuarantineLocation',
      ['quarantineId', 'locationObservationSha256'],
      { unique: true },
    );
    await expectIndex('ImageUploadProviderEventQuarantineLocation', [
      'quarantineId',
      'observedAt',
    ]);

    await expectIndex('ImageUploadProviderEventQuarantineAction', ['id'], {
      unique: true,
      primary: true,
    });
    await expectIndex(
      'ImageUploadProviderEventQuarantineAction',
      ['actionSha256'],
      { unique: true },
    );
    await expectIndex('ImageUploadProviderEventQuarantineAction', [
      'quarantineId',
      'resolutionAttemptId',
      'observedAt',
    ]);

    await expectIndex('ImageUploadProviderEventQuarantineResolution', ['id'], {
      unique: true,
      primary: true,
    });
    await expectIndex(
      'ImageUploadProviderEventQuarantineResolution',
      ['quarantineId', 'id'],
      { unique: true },
    );
    await expectIndex(
      'ImageUploadProviderEventQuarantineResolution',
      ['resolutionEvidenceSha256'],
      { unique: true },
    );
    await expectIndex('ImageUploadProviderEventQuarantineResolution', [
      'quarantineId',
      'resolvedAt',
    ]);

    await expectCheckValues(
      'ImageUploadProviderEventQuarantine',
      'ImageUploadProviderEventQuarantine_state_check',
      ['open', 'resolving', 'resolved'],
    );
    await expectCheckValues(
      'ImageUploadProviderEventQuarantine',
      'ImageUploadProviderEventQuarantine_reason_check',
      ['malformed_event', 'unmatched_event'],
    );
    await expectConstraintDefinition(
      'ImageUploadProviderEventQuarantine',
      'ImageUploadProviderEventQuarantine_envelope_evidence_check',
      [
        "reason = 'malformed_event'",
        'eventEnvelopeSha256 IS NULL',
        'providerEventId IS NULL',
        "reason = 'unmatched_event'",
        'eventEnvelopeSha256 IS NOT NULL',
        'providerEventId IS NOT NULL',
      ],
    );
    await expectConstraintDefinition(
      'ImageUploadProviderEventQuarantine',
      'ImageUploadProviderEventQuarantine_resolution_check',
      [
        "state = 'open'",
        'resolutionAttemptId IS NULL',
        'resolution IS NULL',
        'resolutionStartedAt IS NULL',
        'acknowledgedLocationCount IS NULL',
        'resolutionScanCompletedAt IS NULL',
        'operatorIdentityFingerprint IS NULL',
        'approvalDigest IS NULL',
        'replayQueueId IS NULL',
        'replayRequestId IS NULL',
        'replayMessageId IS NULL',
        'replayRequestedAt IS NULL',
        'acknowledgedAt IS NULL',
        'resolvedAt IS NULL',
        "state = 'resolving'",
        'resolutionAttemptId IS NOT NULL',
        "resolution = ANY (ARRAY['quarantined_ack'",
        "'replay_requested'",
        'resolutionStartedAt IS NOT NULL',
        'operatorIdentityFingerprint IS NOT NULL',
        'approvalDigest IS NOT NULL',
        "state = 'resolved'",
        'latestResolutionAttemptId = resolutionAttemptId',
        'latestResolutionEvidenceSha256 IS NOT NULL',
        'acknowledgedLocationCount >= 0',
        'resolutionScanCompletedAt IS NOT NULL',
        'acknowledgedAt IS NOT NULL',
        'resolvedAt IS NOT NULL',
      ],
    );
    await expectConstraintDefinition(
      'ImageUploadProviderEventQuarantine',
      'ImageUploadProviderEventQuarantine_attempts_check',
      ['attempts >= 1'],
    );
    await expectCheckValues(
      'ImageUploadProviderEventQuarantineLocation',
      'ImageUploadProviderEventQuarantineLocation_kind_check',
      ['source', 'dlq'],
    );
    await expectConstraintDefinition(
      'ImageUploadProviderEventQuarantineLocation',
      'ImageUploadProviderEventQuarantineLocation_attempts_check',
      ['attempts >= 1'],
    );
    await expectCheckValues(
      'ImageUploadProviderEventQuarantineAction',
      'ImageUploadProviderEventQuarantineAction_kind_check',
      ['source', 'dlq'],
    );
    await expectCheckValues(
      'ImageUploadProviderEventQuarantineAction',
      'ImageUploadProviderEventQuarantineAction_action_check',
      [
        'ack_requested',
        'ack_succeeded',
        'replay_publish_requested',
        'replay_published',
      ],
    );
    await expectConstraintDefinition(
      'ImageUploadProviderEventQuarantineAction',
      'ImageUploadProviderEventQuarantineAction_replay_identity_check',
      [
        "action = 'ack_requested'",
        'providerOutcome IS NULL',
        "action = 'replay_publish_requested'",
        'replayRequestId IS NOT NULL',
        "action = 'ack_succeeded'",
        "providerOutcome = ANY (ARRAY['acknowledged'",
        "'already_absent'",
        "action = 'replay_published'",
        "'published'",
        "'adopted_after_uncertain_publish'",
      ],
    );
    await expectConstraintDefinition(
      'ImageUploadProviderEventQuarantineAction',
      'ImageUploadProviderEventQuarantineAction_location_check',
      ['locationObservationSha256 IS NOT NULL'],
    );
    await expectConstraintDefinition(
      'ImageUploadProviderEventQuarantineResolution',
      'ImageUploadProviderEventQuarantineResolution_resolution_check',
      [
        "resolution = 'quarantined_ack'",
        'replayQueueId IS NULL',
        'replayRequestId IS NULL',
        'replayMessageId IS NULL',
        'replayRequestedAt IS NULL',
        "resolution = 'replay_requested'",
        'replayQueueId IS NOT NULL',
        'replayRequestId IS NOT NULL',
        'replayMessageId IS NOT NULL',
        'replayRequestedAt IS NOT NULL',
        'resolutionStartedAt <= replayRequestedAt',
        'replayRequestedAt <= resolutionScanCompletedAt',
      ],
    );
    await expectConstraintDefinition(
      'ImageUploadProviderEventQuarantineResolution',
      'ImageUploadProviderEventQuarantineResolution_count_check',
      ['acknowledgedLocationCount >= 0'],
    );
    await expectConstraintDefinition(
      'ImageUploadProviderEventQuarantineResolution',
      'ImageUploadProviderEventQuarantineResolution_time_order_check',
      [
        'resolutionStartedAt <= resolutionScanCompletedAt',
        'resolutionScanCompletedAt <= acknowledgedAt',
        'acknowledgedAt <= resolvedAt',
        'replayRequestedAt IS NULL',
        'resolutionStartedAt <= replayRequestedAt',
        'replayRequestedAt <= acknowledgedAt',
      ],
    );

    const evidenceConstraints = [
      ...(await constraints('ImageUploadProviderEventQuarantineLocation')),
      ...(await constraints('ImageUploadProviderEventQuarantineAction')),
      ...(await constraints('ImageUploadProviderEventQuarantineResolution')),
    ];
    const restrictiveReferences = evidenceConstraints.filter(
      (constraint) =>
        constraint.type === 'f' &&
        [
          'ImageUploadProviderEventQuarantine',
          'ImageUploadProviderEventQuarantineLocation',
        ].includes(constraint.referencedTable ?? ''),
    );
    expect(restrictiveReferences).toHaveLength(3);
    expect(
      restrictiveReferences.every(
        (constraint) =>
          constraint.deleteAction === 'r' && !constraint.deferrable,
      ),
    ).toBe(true);

    const locationForeignKey = restrictiveReferences.find(
      (constraint) =>
        constraint.name ===
        'ImageUploadProviderEventQuarantineLocation_quarantine_fk',
    );
    expect(normalize(locationForeignKey?.definition ?? '')).toContain(
      normalize(
        'FOREIGN KEY (quarantineId) REFERENCES ImageUploadProviderEventQuarantine(id) ON DELETE RESTRICT',
      ),
    );

    const actionForeignKey = restrictiveReferences.find(
      (constraint) =>
        constraint.name ===
        'ImageUploadProviderEventQuarantineAction_location_fk',
    );
    expect(normalize(actionForeignKey?.definition ?? '')).toContain(
      normalize(
        'FOREIGN KEY (quarantineId, locationObservationSha256) REFERENCES ImageUploadProviderEventQuarantineLocation(quarantineId, locationObservationSha256) ON DELETE RESTRICT',
      ),
    );

    const resolutionForeignKey = restrictiveReferences.find(
      (constraint) =>
        constraint.name ===
        'ImageUploadProviderEventQuarantineResolution_quarantine_fk',
    );
    expect(normalize(resolutionForeignKey?.definition ?? '')).toContain(
      normalize(
        'FOREIGN KEY (quarantineId) REFERENCES ImageUploadProviderEventQuarantine(id) ON DELETE RESTRICT',
      ),
    );

    const quarantineConstraints = await constraints(
      'ImageUploadProviderEventQuarantine',
    );
    const latestResolution = quarantineConstraints.find(
      (constraint) =>
        constraint.name ===
        'ImageUploadProviderEventQuarantine_latest_resolution_fk',
    );
    expect(latestResolution).toEqual(
      expect.objectContaining({
        type: 'f',
        referencedTable: 'ImageUploadProviderEventQuarantineResolution',
        deleteAction: 'a',
        deferrable: true,
        initiallyDeferred: true,
      }),
    );
    expect(normalize(latestResolution?.definition ?? '')).toContain(
      normalize(
        'FOREIGN KEY (id, latestResolutionAttemptId) REFERENCES ImageUploadProviderEventQuarantineResolution(quarantineId, id)',
      ),
    );
  });

  it('keeps operational evidence independent from live uploads and images', async () => {
    for (const table of [
      'ImageUploadIdempotency',
      'ImageUploadPromotion',
      'ImageUploadPromotionConflict',
      'ImageUploadProviderEventQuarantine',
      'ImageUploadProviderEventQuarantineLocation',
      'ImageUploadProviderEventQuarantineAction',
      'ImageUploadProviderEventQuarantineResolution',
      'ImageUploadReconcilerHeartbeat',
      'ImageUploadRateLimitEvent',
    ]) {
      const tableConstraints = await constraints(table);
      expect(
        tableConstraints.some(
          (constraint) =>
            constraint.type === 'f' &&
            ['Image', 'ImageUpload'].includes(constraint.referencedTable ?? ''),
        ),
      ).toBe(false);
    }
  });

  it('locks rate-limit route scopes and retention-scan indexes', async () => {
    await expectColumns('ImageUploadRateLimitEvent', RATE_LIMIT_COLUMNS);
    await expectIndex('ImageUploadRateLimitEvent', [
      'createdByAdminId',
      'routeScope',
      'occurredAt',
    ]);
    await expectIndex('ImageUploadRateLimitEvent', ['occurredAt']);
    await expectCheckValues(
      'ImageUploadRateLimitEvent',
      'ImageUploadRateLimitEvent_route_scope_check',
      ['upload_url', 'confirm_upload', 'upload_status', 'abandon_upload'],
    );
  });

  it('enforces same-quarantine append-only evidence relationships', async () => {
    const first = randomUUID();
    const second = randomUUID();
    const locationId = randomUUID();
    const locationHash = createHash('sha256').update('location').digest('hex');
    const now = new Date();
    const leaseDeadline = new Date(now.getTime() + 60_000);

    for (const id of [first, second]) {
      await prisma.$executeRawUnsafe(
        `
          INSERT INTO "ImageUploadProviderEventQuarantine" (
            "id", "messageId", "sourceQueueId", "currentQueueId", "leaseId",
            "leaseDeadline", "attempts", "bodySha256",
            "quarantineFingerprintSha256", "reason", "state"
          ) VALUES ($1, $2, 'source-queue', 'source-queue', $3, $4, 1, $5, $6, 'malformed_event', 'open')
        `,
        id,
        `message-${id}`,
        `lease-${id}`,
        leaseDeadline,
        createHash('sha256').update(`body-${id}`).digest('hex'),
        createHash('sha256').update(`fingerprint-${id}`).digest('hex'),
      );
    }

    await prisma.$executeRawUnsafe(
      `
        INSERT INTO "ImageUploadProviderEventQuarantineLocation" (
          "id", "quarantineId", "queueKind", "queueId", "messageId",
          "leaseId", "leaseDeadline", "attempts", "locationObservationSha256"
        ) VALUES ($1, $2, 'source', 'source-queue', 'message', 'lease', $3, 1, $4)
      `,
      locationId,
      first,
      leaseDeadline,
      locationHash,
    );

    await expect(
      prisma.$executeRawUnsafe(
        `
          INSERT INTO "ImageUploadProviderEventQuarantineAction" (
            "id", "quarantineId", "resolutionAttemptId",
            "locationObservationSha256", "action", "queueKind", "queueId",
            "messageId", "leaseId", "actionEvidenceSha256", "actionSha256"
          ) VALUES ($1, $2, 'attempt', $3, 'ack_requested', 'source',
                    'source-queue', 'message', 'lease', $4, $5)
        `,
        randomUUID(),
        second,
        locationHash,
        createHash('sha256').update('action-evidence').digest('hex'),
        createHash('sha256').update('action').digest('hex'),
      ),
    ).rejects.toBeDefined();

    const resolutionId = randomUUID();
    const resolutionHash = createHash('sha256')
      .update('resolution')
      .digest('hex');
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO "ImageUploadProviderEventQuarantineResolution" (
          "id", "quarantineId", "resolution", "operatorIdentityFingerprint",
          "approvalDigest", "resolutionStartedAt", "acknowledgedLocationCount",
          "resolutionScanCompletedAt", "acknowledgedAt", "resolvedAt",
          "resolutionEvidenceSha256"
        ) VALUES ($1, $2, 'quarantined_ack', 'operator', 'approval',
                  $3, 0, $3, $3, $3, $4)
      `,
      resolutionId,
      first,
      now,
      resolutionHash,
    );

    await expect(
      prisma.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(
          `
            UPDATE "ImageUploadProviderEventQuarantine"
            SET "latestResolutionAttemptId" = $1
            WHERE "id" = $2
          `,
          resolutionId,
          second,
        );
      }),
    ).rejects.toBeDefined();

    await expect(
      prisma.$executeRawUnsafe(
        'DELETE FROM "ImageUploadProviderEventQuarantine" WHERE "id" = $1',
        first,
      ),
    ).rejects.toBeDefined();
  });

  it('upgrades representative legacy rows without inventing rollout evidence', async () => {
    const upgradeContainer = await new PostgreSqlContainer(
      'postgres:16-alpine',
    ).start();
    const databaseUrl = upgradeContainer.getConnectionUri();
    const schemaPath = resolve(__dirname, '../prisma/schema.prisma');
    const migrationPath = resolve(
      __dirname,
      '../prisma/migrations/20260719000100_image_upload_roll_forward/migration.sql',
    );
    const runUpgradePrisma = (args: string[]) =>
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

    let upgrade: PrismaClient | undefined;
    try {
      await runUpgradePrisma([
        'db',
        'push',
        '--force-reset',
        '--skip-generate',
        '--schema',
        schemaPath,
      ]);
      upgrade = new PrismaClient({ datasourceUrl: databaseUrl });
      await upgrade.$connect();

      for (const table of [
        'ImageUploadProviderEventQuarantineAction',
        'ImageUploadProviderEventQuarantineLocation',
        'ImageUploadProviderEventQuarantineResolution',
        'ImageUploadProviderEventQuarantine',
        'ImageUploadPromotionConflict',
        'ImageUploadPromotion',
        'ImageUploadIdempotency',
        'ImageUploadRateLimitEvent',
        'ImageUploadReconcilerHeartbeat',
      ]) {
        await upgrade.$executeRawUnsafe(
          `DROP TABLE IF EXISTS "${table}" CASCADE`,
        );
      }
      await upgrade.$executeRawUnsafe(
        'ALTER TABLE "Image" DROP COLUMN "fileSizeBytes"',
      );
      await upgrade.$executeRawUnsafe(`
        ALTER TABLE "ImageUpload"
          DROP COLUMN "clientRequestId",
          DROP COLUMN "createdByAdminId",
          DROP COLUMN "policyVersion",
          DROP COLUMN "policySnapshot",
          DROP COLUMN "processedSha256",
          DROP COLUMN "presignExpiresAt",
          DROP COLUMN "finalizationLeaseToken",
          DROP COLUMN "resultImageId",
          DROP COLUMN "resultDeletedAt",
          DROP COLUMN "terminalAt",
          DROP COLUMN "resultRetentionExpiresAt",
          DROP COLUMN "failureCode",
          DROP COLUMN "temporaryCleanupState",
          DROP COLUMN "temporaryCleanupAttempts",
          DROP COLUMN "temporaryCleanupNextAttemptAt",
          DROP COLUMN "temporaryCleanupVerifiedAt",
          DROP COLUMN "temporaryCleanupLastErrorCategory"
      `);
      await upgrade.$executeRawUnsafe(`
        ALTER TABLE "ImageObjectDeletion"
          DROP COLUMN "authority",
          DROP COLUMN "objectKeyHash",
          DROP COLUMN "legacyImageSnapshotSha256",
          DROP COLUMN "providerDisposition"
      `);

      const albumId = randomUUID();
      const imageId = randomUUID();
      const expiresAt = new Date(Date.now() + 3_600_000);
      await upgrade.$executeRawUnsafe(
        `
          INSERT INTO "Album" ("id", "title", "slug", "createdAt", "updatedAt")
          VALUES ($1, 'Upgrade', $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `,
        albumId,
        `upgrade-${albumId}`,
      );
      await upgrade.$executeRawUnsafe(
        `
          INSERT INTO "Image" (
            "id", "albumId", "filename", "r2ObjectKey", "uploadStatus",
            "createdAt"
          ) VALUES ($1, $2, 'kept.jpg', $3, 'completed', CURRENT_TIMESTAMP)
        `,
        imageId,
        albumId,
        `albums/${albumId}/kept.jpg`,
      );

      const uploadIds: string[] = [];
      for (const status of ['pending', 'finalizing', 'consumed', 'failed']) {
        const uploadId = randomUUID();
        uploadIds.push(uploadId);
        await upgrade.$executeRawUnsafe(
          `
            INSERT INTO "ImageUpload" (
              "id", "albumId", "uploadObjectKey", "finalObjectKey", "filename",
              "contentType", "fileSize", "status", "expiresAt", "createdAt"
            ) VALUES ($1, $2, $3, $4, 'kept.jpg', 'image/jpeg', 1024, $5, $6,
                      CURRENT_TIMESTAMP)
          `,
          uploadId,
          albumId,
          `uploads/${uploadId}/kept.jpg`,
          `albums/${albumId}/${uploadId}-kept.jpg`,
          status,
          expiresAt,
        );
      }

      const deferredId = randomUUID();
      const r2DeletionId = randomUUID();
      const r2ObjectKey = `albums/${albumId}/delete.jpg`;
      await upgrade.$executeRawUnsafe(
        `
          INSERT INTO "ImageObjectDeletion" (
            "id", "provider", "objectKey", "status", "createdAt", "updatedAt"
          ) VALUES
            ($1, 'cloudflare_legacy', 'legacy-object', 'deferred',
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
            ($2, 'r2', $3, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `,
        deferredId,
        r2DeletionId,
        r2ObjectKey,
      );
      await upgrade.$disconnect();
      upgrade = undefined;

      await runUpgradePrisma([
        'db',
        'execute',
        '--file',
        migrationPath,
        '--schema',
        schemaPath,
      ]);

      upgrade = new PrismaClient({ datasourceUrl: databaseUrl });
      await upgrade.$connect();
      await expect(
        upgrade.$queryRawUnsafe(
          'SELECT "id", "r2ObjectKey" FROM "Image" WHERE "id" = $1',
          imageId,
        ),
      ).resolves.toEqual([
        {
          id: imageId,
          r2ObjectKey: `albums/${albumId}/kept.jpg`,
        },
      ]);

      const uploads = await upgrade.$queryRawUnsafe<
        Array<{
          id: string;
          status: string;
          clientRequestId: string | null;
          temporaryCleanupAttempts: number;
        }>
      >(
        `
          SELECT "id", "status", "clientRequestId", "temporaryCleanupAttempts"
          FROM "ImageUpload"
          WHERE "id" = ANY($1::text[])
          ORDER BY "status"
        `,
        uploadIds,
      );
      expect(uploads).toHaveLength(4);
      expect(uploads.every((row) => row.clientRequestId === null)).toBe(true);
      expect(uploads.every((row) => row.temporaryCleanupAttempts === 0)).toBe(
        true,
      );

      for (const table of [
        'ImageUploadIdempotency',
        'ImageUploadPromotion',
        'ImageUploadPromotionConflict',
        'ImageUploadProviderEventQuarantine',
        'ImageUploadRateLimitEvent',
        'ImageUploadReconcilerHeartbeat',
      ]) {
        const [{ count }] = await upgrade.$queryRawUnsafe<
          Array<{ count: bigint }>
        >(`SELECT COUNT(*)::bigint AS "count" FROM "${table}"`);
        expect(count).toBe(0n);
      }

      const deletions = await upgrade.$queryRawUnsafe<
        Array<{
          id: string;
          authority: string;
          objectKeyHash: string | null;
          providerDisposition: string | null;
        }>
      >(
        `
          SELECT "id", "authority", "objectKeyHash", "providerDisposition"
          FROM "ImageObjectDeletion"
          WHERE "id" IN ($1, $2)
          ORDER BY "id"
        `,
        deferredId,
        r2DeletionId,
      );
      const deferred = deletions.find((row) => row.id === deferredId);
      expect(deferred).toEqual(
        expect.objectContaining({
          authority: 'non_r2_deferred',
          providerDisposition: 'legacy_deferred',
        }),
      );
      const r2Deletion = deletions.find((row) => row.id === r2DeletionId);
      expect(r2Deletion).toEqual(
        expect.objectContaining({
          authority: 'current_result',
          objectKeyHash: createHash('sha256').update(r2ObjectKey).digest('hex'),
          providerDisposition: null,
        }),
      );
    } finally {
      await upgrade?.$disconnect();
      await upgradeContainer.stop();
    }
  });
});
