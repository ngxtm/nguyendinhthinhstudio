import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
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
