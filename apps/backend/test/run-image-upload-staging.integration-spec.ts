import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseStagingDatabaseEnvironment,
  runStagingQualification,
  type StagingOrchestratorDependencies,
} from './run-image-upload-staging';

function dependencies(events: string[]): StagingOrchestratorDependencies {
  return {
    preflight: async () => {
      events.push('preflight');
      return { roleEnvironment: { IMAGE_UPLOAD_PROCESS_ROLE: 'api' } };
    },
    createDatabase: async () => {
      events.push('database');
      return {
        databaseUrl: 'postgresql://disposable/staging',
        directUrl: 'postgresql://disposable/staging',
        identity: 'container-staging-001',
      };
    },
    migrate: async () => events.push('migrate'),
    backendSuites: async () => events.push('backend'),
    frontendSuites: async () => events.push('frontend'),
    providerSmoke: async () => events.push('provider'),
    verify: async () => events.push('verify'),
    cleanup: async () => events.push('cleanup'),
  };
}

describe('staging orchestrator', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'ndt-staging-orchestrator-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('accepts only connection identities bound to a distinct staging Supabase ref', () => {
    const result = parseStagingDatabaseEnvironment({
      NDT_STAGING_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
      NDT_PRODUCTION_SUPABASE_PROJECT_REF: 'zyxwvutsrqponmlkjihg',
      NDT_STAGING_DATABASE_URL:
        'postgresql://postgres.abcdefghijklmnopqrst:secret@aws-0-region.pooler.supabase.com:6543/postgres',
      NDT_STAGING_DIRECT_URL:
        'postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres',
    });
    expect(result.databaseUrl).toContain('pooler.supabase.com');
    expect(result.directUrl).toContain(
      'db.abcdefghijklmnopqrst.supabase.co',
    );
    expect(result.identity).toMatch(/^supabase:[0-9a-f]{64}$/);
    expect(result.identity).not.toContain('abcdefghijklmnopqrst');
  });

  it('rejects a staging Supabase ref that equals production', () => {
    expect(() =>
      parseStagingDatabaseEnvironment({
        NDT_STAGING_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
        NDT_PRODUCTION_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
        NDT_STAGING_DATABASE_URL:
          'postgresql://postgres.abcdefghijklmnopqrst:secret@aws-0-region.pooler.supabase.com:6543/postgres',
        NDT_STAGING_DIRECT_URL:
          'postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres',
      }),
    ).toThrow('must differ from production');
  });

  it('rejects a staging connection that targets another Supabase project', () => {
    expect(() =>
      parseStagingDatabaseEnvironment({
        NDT_STAGING_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
        NDT_PRODUCTION_SUPABASE_PROJECT_REF: 'zyxwvutsrqponmlkjihg',
        NDT_STAGING_DATABASE_URL:
          'postgresql://postgres.wrongprojectref0000:secret@aws-0-region.pooler.supabase.com:6543/postgres',
        NDT_STAGING_DIRECT_URL:
          'postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres',
      }),
    ).toThrow('NDT_STAGING_DATABASE_URL must target the staging Supabase ref');
  });

  it('does not create a generic PostgreSQL container for live staging', async () => {
    const source = await readFile(
      join(__dirname, 'run-image-upload-staging.ts'),
      'utf8',
    );
    expect(source).not.toContain("'@testcontainers/postgresql'");
    expect(source).not.toContain('new PostgreSqlContainer');
  });

  it('owns the complete sequence and writes a scoped receipt', async () => {
    const events: string[] = [];
    const receipt = join(directory, 'receipt.json');
    const result = await runStagingQualification({
      dependencies: dependencies(events),
      runId: '4b4f14fd-c0e4-4cc4-89b8-65aacd3f25e1',
      receiptPath: receipt,
    });
    expect(events).toEqual([
      'preflight',
      'database',
      'migrate',
      'backend',
      'frontend',
      'provider',
      'verify',
      'cleanup',
    ]);
    expect(result.cleanupStatus).toBe('complete');
    expect(result.sourcePrefix).toBe(
      'uploads/staging/4b4f14fd-c0e4-4cc4-89b8-65aacd3f25e1/',
    );
    expect(result.destinationPrefix).toBe(
      'albums/staging/4b4f14fd-c0e4-4cc4-89b8-65aacd3f25e1/',
    );
  });

  it.each([
    'preflight',
    'createDatabase',
    'migrate',
    'backendSuites',
    'frontendSuites',
    'providerSmoke',
    'verify',
  ])('runs cleanup exactly once when %s fails', async (failure) => {
    const events: string[] = [];
    const deps = dependencies(events);
    const original = deps[failure as keyof StagingOrchestratorDependencies];
    if (typeof original !== 'function')
      throw new Error(`not a step: ${failure}`);
    (deps as Record<string, unknown>)[failure] = async (...args: unknown[]) => {
      events.push(
        (
          {
            createDatabase: 'database',
            backendSuites: 'backend',
            frontendSuites: 'frontend',
            providerSmoke: 'provider',
          } as Record<string, string>
        )[failure] ?? failure,
      );
      throw new Error(`${failure}-failed`);
    };
    await expect(
      runStagingQualification({
        dependencies: deps,
        runId: '4b4f14fd-c0e4-4cc4-89b8-65aacd3f25e1',
        receiptPath: join(directory, `${failure}.json`),
      }),
    ).rejects.toThrow(`${failure}-failed`);
    expect(events.filter((event) => event === 'cleanup')).toHaveLength(1);
  });

  it('cleans up once when interrupted before work starts', async () => {
    const events: string[] = [];
    const controller = new AbortController();
    controller.abort();
    await expect(
      runStagingQualification({
        dependencies: dependencies(events),
        signal: controller.signal,
        receiptPath: join(directory, 'aborted.json'),
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(events).toEqual(['cleanup']);
  });
});
