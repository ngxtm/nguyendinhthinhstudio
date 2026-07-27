import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { Client } from 'pg';

const execFileAsync = promisify(execFile);
type CatalogColumn = {
  columnName: string;
  dataType: string;
  nullable: 'YES' | 'NO';
};
type CatalogConstraint = {
  name: string;
  definition: string;
  type: string;
  referencedTable: string | null;
  deleteAction: string;
  deferrable: boolean;
};

async function bootstrapSupabaseCompatibility(
  databaseUrl: string,
): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`
      DO $bootstrap$
      DECLARE role_name text;
      BEGIN
        FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'supabase_auth_admin', 'service_role'] LOOP
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('CREATE ROLE %I NOLOGIN', role_name);
          END IF;
        END LOOP;
      END
      $bootstrap$;
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
        id uuid PRIMARY KEY
      );
    `);
  } finally {
    await client.end();
  }
}

describe('image upload polling schema contract (PostgreSQL)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  jest.setTimeout(120_000);

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const databaseUrl = container.getConnectionUri();
    await bootstrapSupabaseCompatibility(databaseUrl);
    const schemaPath = resolve(__dirname, '../prisma/schema.prisma');
    await execFileAsync(
      process.execPath,
      [
        require.resolve('prisma/build/index.js'),
        'migrate',
        'deploy',
        '--schema',
        schemaPath,
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
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  async function columns(table: string) {
    const rows = await prisma.$queryRawUnsafe<CatalogColumn[]>(
      `SELECT column_name AS "columnName", data_type AS "dataType", is_nullable AS "nullable"
       FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1
       ORDER BY column_name`,
      table,
    );
    return Object.fromEntries(
      rows.map((row) => [row.columnName, [row.dataType, row.nullable]]),
    );
  }

  async function constraints(table: string) {
    return prisma.$queryRawUnsafe<CatalogConstraint[]>(
      `SELECT c.conname AS "name", c.contype::text AS "type", pg_get_constraintdef(c.oid, true) AS "definition",
              r.relname AS "referencedTable", c.confdeltype::text AS "deleteAction", c.condeferrable AS "deferrable"
       FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace LEFT JOIN pg_class r ON r.oid = c.confrelid
       WHERE n.nspname = current_schema() AND t.relname = $1 ORDER BY c.conname`,
      table,
    );
  }

  it('stores exact destination HEAD evidence and five-loop heartbeat fields', async () => {
    await expect(columns('ImageUploadPromotion')).resolves.toEqual(
      expect.objectContaining({
        destinationHeadObservedAt: ['timestamp without time zone', 'YES'],
        destinationHeadEtag: ['text', 'YES'],
        destinationHeadBytes: ['integer', 'YES'],
        destinationHeadMime: ['text', 'YES'],
        destinationHeadMetadataSha256: ['text', 'YES'],
      }),
    );
    await expect(columns('ImageUploadReconcilerHeartbeat')).resolves.toEqual(
      expect.objectContaining({
        pendingSessionExpiryCompletedAt: ['timestamp without time zone', 'YES'],
        promotionRecoveryCompletedAt: ['timestamp without time zone', 'YES'],
        temporaryCleanupCompletedAt: ['timestamp without time zone', 'YES'],
        imageDeletionCompletedAt: ['timestamp without time zone', 'YES'],
        rateLimitCleanupCompletedAt: ['timestamp without time zone', 'YES'],
      }),
    );
  });

  it('drops every durable policy column in the simplified upload migration', async () => {
    const uploadColumns = await columns('ImageUpload');
    const promotionColumns = await columns('ImageUploadPromotion');

    expect(Object.hasOwn(uploadColumns, 'policyVersion')).toBe(false);
    expect(Object.hasOwn(uploadColumns, 'policySnapshot')).toBe(false);
    expect(Object.hasOwn(promotionColumns, 'policyVersion')).toBe(false);

    const migration = readFileSync(
      resolve(
        __dirname,
        '../prisma/migrations/20260727000100_simplify_admin_image_upload/migration.sql',
      ),
      'utf8',
    );
    expect(migration).toContain('DROP COLUMN "policyVersion"');
    expect(migration).toContain('DROP COLUMN "policySnapshot"');
  });

  it('removes provider-event/quarantine tables from the current schema', async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ tableName: string }>>(
      `SELECT table_name AS "tableName" FROM information_schema.tables
       WHERE table_schema = current_schema() AND (table_name ILIKE '%ProviderEvent%' OR table_name ILIKE '%Quarantine%')`,
    );
    expect(rows).toEqual([]);
  });

  it('keeps conflict evidence append-only and restricts evidence deletion', async () => {
    const conflict = await constraints('ImageUploadPromotionConflict');
    expect(conflict.some((entry) => entry.type === 'p')).toBe(true);
    const migration = readFileSync(
      resolve(
        __dirname,
        '../prisma/migrations/20260719000100_image_upload_roll_forward/migration.sql',
      ),
      'utf8',
    );
    expect(migration).toContain('confirmed_absent');
    expect(migration).toContain('cleanup_authorized');
    expect(migration).toContain('committed_authorized');
  });

  it('keeps promotion state and disposition closed to polling outcomes', async () => {
    const migration = readFileSync(
      resolve(
        __dirname,
        '../prisma/migrations/20260719000100_image_upload_roll_forward/migration.sql',
      ),
      'utf8',
    );
    expect(migration).toContain(
      "'dispatched', 'provider_settled', 'dispatch_rejected'",
    );
    expect(migration).toContain(
      "'pending', 'committed', 'cleanup_required', 'verified_deleted', 'not_created'",
    );
  });
});
