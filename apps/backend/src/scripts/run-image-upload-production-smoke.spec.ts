import {
  executeProductionSmokeCli,
  parseProductionSmokeCommand,
  type ProductionSmokeCliDependencies,
} from './run-image-upload-production-smoke';

describe('production smoke CLI', () => {
  it.each([
    [['run'], 'run'],
    [['cleanup'], 'cleanup'],
  ] as const)('accepts only the %s command', (argv, expected) => {
    expect(parseProductionSmokeCommand([...argv])).toBe(expected);
  });

  it.each([[[]], [['unknown']], [['run', 'extra']]])(
    'rejects unsupported arguments %j',
    (argv) => {
      expect(() => parseProductionSmokeCommand(argv)).toThrow(
        'usage: run-image-upload-production-smoke.js <run|cleanup>',
      );
    },
  );

  it('routes SIGINT and SIGTERM through one AbortController and emits sanitized progress', async () => {
    const listeners = new Map<string, () => void>();
    const progress: string[] = [];
    const run = jest.fn(async ({ signal }) => {
      expect(signal.aborted).toBe(false);
      listeners.get('SIGTERM')?.();
      expect(signal.aborted).toBe(true);
      return { canonicalSha256: 'a'.repeat(64) };
    });
    const dependencies = {
      repositoryRoot: '/app',
      env: {},
      parseEnvironment: jest.fn().mockReturnValue({ paths: {} }),
      buildDependencies: jest.fn().mockReturnValue({}),
      run,
      cleanup: jest.fn(),
      randomUuid: jest
        .fn()
        .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
        .mockReturnValueOnce('00000000-0000-4000-8000-000000000002'),
      now: () => new Date('2026-07-23T12:00:00.000Z'),
      adminIdSha256: jest.fn().mockReturnValue('b'.repeat(64)),
      onSignal: (name, listener) => listeners.set(name, listener),
      offSignal: (name) => listeners.delete(name),
      log: (message) => progress.push(message),
    } as unknown as ProductionSmokeCliDependencies;

    await executeProductionSmokeCli(['run'], dependencies);

    expect(run).toHaveBeenCalledTimes(1);
    expect(progress).toEqual([
      'production smoke run started',
      `production smoke receipt canonicalSha256=${'a'.repeat(64)}`,
    ]);
    expect(listeners.size).toBe(0);
  });

  it('runs cleanup without creating run identifiers', async () => {
    const cleanup = jest.fn().mockResolvedValue(undefined);
    const randomUuid = jest.fn();
    const dependencies = {
      repositoryRoot: '/app',
      env: {},
      parseEnvironment: jest.fn().mockReturnValue({ paths: {} }),
      buildDependencies: jest.fn().mockReturnValue({}),
      run: jest.fn(),
      cleanup,
      randomUuid,
      now: () => new Date('2026-07-23T12:00:00.000Z'),
      adminIdSha256: jest.fn(),
      onSignal: jest.fn(),
      offSignal: jest.fn(),
      log: jest.fn(),
    } as unknown as ProductionSmokeCliDependencies;

    await executeProductionSmokeCli(['cleanup'], dependencies);

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(randomUuid).not.toHaveBeenCalled();
  });

  it('never prints dependency error details', async () => {
    const secret = 'smoke-token-secret';
    const log = jest.fn();
    const dependencies = {
      repositoryRoot: '/app',
      env: {},
      parseEnvironment: jest.fn().mockReturnValue({ paths: {} }),
      buildDependencies: jest.fn().mockReturnValue({}),
      run: jest
        .fn()
        .mockRejectedValue(new Error(`leaked ${secret} https://signed`)),
      cleanup: jest.fn(),
      randomUuid: jest
        .fn()
        .mockReturnValue('00000000-0000-4000-8000-000000000001'),
      now: () => new Date('2026-07-23T12:00:00.000Z'),
      adminIdSha256: jest.fn().mockReturnValue('b'.repeat(64)),
      onSignal: jest.fn(),
      offSignal: jest.fn(),
      log,
    } as unknown as ProductionSmokeCliDependencies;

    await expect(
      executeProductionSmokeCli(['run'], dependencies),
    ).rejects.toThrow('production smoke run failed');
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(log.mock.calls)).not.toContain('https://');
  });
});
