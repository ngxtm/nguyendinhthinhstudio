import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  PRODUCTION_SMOKE_CHECKS,
  canonicalSha256,
  parseProductionSmokeEnvironment,
  readSmokeJournal,
  type OperatorSmokeReceipt,
  type ProductionSmokeEnvironment,
} from './image-upload-production-smoke-contract';
import {
  pollUntil,
  resumeProductionSmokeCleanup,
  runProductionSmoke,
  type ProductionSmokeDependencies,
} from './image-upload-production-smoke-orchestrator';

const release = {
  imageReference: 'ndt-studio-backend:46d9c02b201a',
  imageDigest:
    'sha256:c8b87f95045a7777b28ceaff4e5b27056851faa8bc7ec9e7e69ec46bf05349ed',
  commitSha: '46d9c02b201ac8310637c63018ed61109d80b3a3',
  releaseFingerprint:
    'sha256:6f9caafe86584a983c2ebb2d49119a5afd674f568f4e599ca2f73c46f68e1b6a',
} as const;

describe('production smoke orchestrator', () => {
  let directory: string;
  let environment: ProductionSmokeEnvironment;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'ndt-smoke-orchestrator-'));
    const path = (name: string) => resolve(directory, name);
    environment = parseProductionSmokeEnvironment(
      {
        NDT_PRODUCTION_SMOKE_API_BASE_URL: 'https://api.ndtstudio.site',
        NDT_PRODUCTION_SMOKE_BROWSER_ORIGIN: 'https://www.ndtstudio.site',
        NDT_PRODUCTION_SMOKE_ALBUM_ID: '00000000-0000-4000-8000-000000000010',
        NDT_PRODUCTION_SMOKE_IMGPROXY_BASE_URL: 'https://img.ndtstudio.site',
        NDT_PRODUCTION_SMOKE_ADMIN_BEARER_TOKEN: 'admin-bearer-secret',
        NDT_PRODUCTION_SMOKE_TOKEN:
          'operator-smoke-token-with-at-least-32-bytes',
        NDT_PRODUCTION_SMOKE_OPERATOR_TOKEN: 'cutover-operator-secret',
        DATABASE_URL: 'postgresql://runtime-db.internal/app',
        IMAGE_UPLOAD_CUTOVER_R2_ACCESS_KEY_ID: 'cutover-access-key',
        IMAGE_UPLOAD_CUTOVER_R2_SECRET_ACCESS_KEY: 'cutover-secret-key',
        IMAGE_UPLOAD_R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
        IMAGE_UPLOAD_R2_BUCKET: 'ndt-production-images',
        IMAGE_UPLOAD_RELEASE_COMMIT: release.commitSha,
        IMAGE_UPLOAD_BUILD_FINGERPRINT: release.releaseFingerprint,
        NDT_PRODUCTION_SMOKE_IMAGE_REFERENCE: release.imageReference,
        NDT_PRODUCTION_SMOKE_IMAGE_DIGEST: release.imageDigest,
        NDT_PRODUCTION_SMOKE_PACKAGED_COMMIT: release.commitSha,
        NDT_PRODUCTION_SMOKE_PACKAGED_FINGERPRINT: release.releaseFingerprint,
        NDT_PRODUCTION_SMOKE_PHASE1_RECEIPT: path('phase1.json'),
        NDT_PRODUCTION_SMOKE_PHASE1_APPROVAL: path('phase1-approval.json'),
        NDT_PRODUCTION_SMOKE_AUTHORIZATION: path('authorization.json'),
        NDT_PRODUCTION_SMOKE_JOURNAL: path('journal.json'),
        NDT_PRODUCTION_SMOKE_RECEIPT: path('receipt.json'),
      },
      resolve(directory, 'repo'),
    );
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function receipt(): OperatorSmokeReceipt {
    const checks = Object.fromEntries(
      PRODUCTION_SMOKE_CHECKS.map((check) => [check, true]),
    ) as OperatorSmokeReceipt['checks'];
    const body = {
      schemaVersion: 'image-upload-operator-smoke-receipt/v1-polling' as const,
      receiptId: '00000000-0000-4000-8000-000000000100',
      receiptPathSha256: 'a'.repeat(64),
      createdAt: '2026-07-23T12:10:00.000Z',
      release,
      authorizationPathSha256: 'b'.repeat(64),
      authorizationSha256: 'c'.repeat(64),
      checks,
    };
    return { ...body, canonicalSha256: canonicalSha256(body) };
  }

  function dependencies(
    events: string[],
    failure?: string,
  ): ProductionSmokeDependencies {
    const step = async (name: string) => {
      events.push(name);
      if (failure === name) throw new Error(`${name}-failed`);
    };
    return {
      preflight: async () => step('preflight'),
      runCheck: async (check, context) => {
        await step(check);
        if (check === 'browserUpload') {
          await context.recordResource({
            kind: 'upload',
            id: '00000000-0000-4000-8000-000000000200',
          });
        }
      },
      cleanup: async () => step('cleanup'),
      verifyCleanup: async () => step('verifyCleanup'),
      writeReceipt: async () => {
        await step('receipt');
        return receipt();
      },
    };
  }

  function options(deps: ProductionSmokeDependencies, signal?: AbortSignal) {
    return {
      environment,
      runId: '00000000-0000-4000-8000-000000000099',
      receiptId: '00000000-0000-4000-8000-000000000100',
      adminIdSha256: 'd'.repeat(64),
      createdAt: '2026-07-23T12:10:00.000Z',
      dependencies: deps,
      signal,
    };
  }

  it('runs all checks, cleanup, verification, then receipt in exact order', async () => {
    const events: string[] = [];
    const result = await runProductionSmoke(options(dependencies(events)));

    expect(events).toEqual([
      'preflight',
      ...PRODUCTION_SMOKE_CHECKS,
      'cleanup',
      'verifyCleanup',
      'receipt',
    ]);
    expect(result.receiptId).toBe('00000000-0000-4000-8000-000000000100');
    await expect(
      readSmokeJournal(environment.paths.journal),
    ).resolves.toMatchObject({
      lifecycle: 'complete',
      cleanupStatus: 'complete',
      completedChecks: [...PRODUCTION_SMOKE_CHECKS],
      resources: [
        {
          kind: 'upload',
          id: '00000000-0000-4000-8000-000000000200',
        },
      ],
    });
  });

  it.each(['preflight', ...PRODUCTION_SMOKE_CHECKS])(
    'cleans exactly once and suppresses receipt when %s fails',
    async (failure) => {
      const events: string[] = [];
      await expect(
        runProductionSmoke(options(dependencies(events, failure))),
      ).rejects.toThrow(`${failure}-failed`);

      expect(events.filter((event) => event === 'cleanup')).toHaveLength(1);
      expect(events).toContain('verifyCleanup');
      expect(events).not.toContain('receipt');
      await expect(
        readSmokeJournal(environment.paths.journal),
      ).resolves.toMatchObject({
        lifecycle: 'failed',
        cleanupStatus: 'complete',
      });
    },
  );

  it('records failed cleanup and never verifies or receipts it', async () => {
    const events: string[] = [];
    await expect(
      runProductionSmoke(options(dependencies(events, 'cleanup'))),
    ).rejects.toThrow('cleanup-failed');

    expect(events.filter((event) => event === 'cleanup')).toHaveLength(1);
    expect(events).not.toContain('verifyCleanup');
    expect(events).not.toContain('receipt');
    await expect(
      readSmokeJournal(environment.paths.journal),
    ).resolves.toMatchObject({
      lifecycle: 'failed',
      cleanupStatus: 'failed',
    });
  });

  it('cleans an already-aborted run without starting preflight', async () => {
    const events: string[] = [];
    const controller = new AbortController();
    controller.abort();

    await expect(
      runProductionSmoke(options(dependencies(events), controller.signal)),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(events).toEqual(['cleanup', 'verifyCleanup']);
  });

  it('resumes cleanup without creating a pass receipt', async () => {
    const firstEvents: string[] = [];
    await expect(
      runProductionSmoke(options(dependencies(firstEvents, 'cleanup'))),
    ).rejects.toThrow('cleanup-failed');

    const resumedEvents: string[] = [];
    await resumeProductionSmokeCleanup({
      environment,
      dependencies: dependencies(resumedEvents),
    });
    expect(resumedEvents).toEqual(['cleanup', 'verifyCleanup']);
    expect(resumedEvents).not.toContain('receipt');
  });

  it('refuses cleanup mode after a successful receipt-eligible run', async () => {
    const runEvents: string[] = [];
    await runProductionSmoke(options(dependencies(runEvents)));
    const cleanupEvents: string[] = [];

    await expect(
      resumeProductionSmokeCleanup({
        environment,
        dependencies: dependencies(cleanupEvents),
      }),
    ).rejects.toThrow(/already complete/i);
    expect(cleanupEvents).toEqual([]);
    await expect(
      readSmokeJournal(environment.paths.journal),
    ).resolves.toMatchObject({
      lifecycle: 'complete',
      cleanupStatus: 'complete',
    });
  });

  it('fails closed when cleanup verification fails', async () => {
    const events: string[] = [];
    await expect(
      runProductionSmoke(options(dependencies(events, 'verifyCleanup'))),
    ).rejects.toThrow('verifyCleanup-failed');
    expect(events).not.toContain('receipt');
    await expect(
      readSmokeJournal(environment.paths.journal),
    ).resolves.toMatchObject({
      lifecycle: 'failed',
      cleanupStatus: 'failed',
    });
  });

  it('polls by condition with an absolute deadline', async () => {
    const observations = [0, 1, 2];
    let now = 100;
    await expect(
      pollUntil({
        observe: async () => observations.shift() ?? 2,
        accept: (value) => value === 2,
        deadline: 130,
        intervalMs: 10,
        now: () => now,
        wait: async (milliseconds) => {
          now += milliseconds;
        },
        signal: new AbortController().signal,
      }),
    ).resolves.toBe(2);

    await expect(
      pollUntil({
        observe: async () => 0,
        accept: (value) => value === 1,
        deadline: 130,
        intervalMs: 10,
        now: () => now,
        wait: async (milliseconds) => {
          now += milliseconds;
        },
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/deadline/i);
  });

  it('does not persist dependency errors that contain secrets', async () => {
    const events: string[] = [];
    const deps = dependencies(events);
    deps.preflight = async () => {
      throw new Error('admin-bearer-secret operator-smoke-token');
    };
    await expect(runProductionSmoke(options(deps))).rejects.toThrow();
    const bytes = await readFile(environment.paths.journal, 'utf8');
    expect(bytes).not.toMatch(/admin-bearer-secret|operator-smoke-token/);
  });
});
