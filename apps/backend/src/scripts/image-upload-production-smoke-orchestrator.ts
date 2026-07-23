import {
  PRODUCTION_SMOKE_CHECKS,
  createSmokeJournal,
  readSmokeJournal,
  updateSmokeJournal,
  type OperatorSmokeReceipt,
  type ProductionSmokeCheck,
  type ProductionSmokeEnvironment,
  type ProductionSmokeJournal,
  type SmokeOwnedResource,
} from './image-upload-production-smoke-contract';

export type SmokeRunContext = Readonly<{
  environment: ProductionSmokeEnvironment;
  runId: string;
  receiptId: string;
  createdAt: string;
  journal: () => ProductionSmokeJournal;
  recordResource: (resource: SmokeOwnedResource) => Promise<void>;
}>;

export type ProductionSmokeDependencies = {
  preflight: (context: SmokeRunContext, signal: AbortSignal) => Promise<void>;
  runCheck: (
    check: ProductionSmokeCheck,
    context: SmokeRunContext,
    signal: AbortSignal,
  ) => Promise<void>;
  cleanup: (context: SmokeRunContext, signal: AbortSignal) => Promise<void>;
  verifyCleanup: (
    context: SmokeRunContext,
    signal: AbortSignal,
  ) => Promise<void>;
  writeReceipt: (context: SmokeRunContext) => Promise<OperatorSmokeReceipt>;
};

export type RunProductionSmokeOptions = Readonly<{
  environment: ProductionSmokeEnvironment;
  runId: string;
  receiptId: string;
  adminIdSha256: string;
  createdAt: string;
  dependencies: ProductionSmokeDependencies;
  signal?: AbortSignal;
}>;

export type CleanupProductionSmokeOptions = Readonly<{
  environment: ProductionSmokeEnvironment;
  dependencies: ProductionSmokeDependencies;
}>;

function abortError(): Error {
  const error = new Error('production smoke aborted');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

function checksComplete(journal: ProductionSmokeJournal): boolean {
  const completed = new Set(journal.completedChecks);
  return (
    completed.size === PRODUCTION_SMOKE_CHECKS.length &&
    PRODUCTION_SMOKE_CHECKS.every((check) => completed.has(check))
  );
}

function contextFor(
  environment: ProductionSmokeEnvironment,
  identifiers: { runId: string; receiptId: string; createdAt: string },
  getJournal: () => ProductionSmokeJournal,
  recordResource: (resource: SmokeOwnedResource) => Promise<void>,
): SmokeRunContext {
  return Object.freeze({
    environment,
    ...identifiers,
    journal: getJournal,
    recordResource,
  });
}

export async function pollUntil<T>(options: {
  observe: () => Promise<T>;
  accept: (value: T) => boolean;
  deadline: number;
  intervalMs: number;
  signal: AbortSignal;
  now?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
}): Promise<T> {
  if (!Number.isFinite(options.deadline)) {
    throw new TypeError('poll deadline must be finite');
  }
  if (!Number.isSafeInteger(options.intervalMs) || options.intervalMs < 1) {
    throw new TypeError('poll interval must be a positive safe integer');
  }
  const now = options.now ?? Date.now;
  const wait =
    options.wait ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));

  while (true) {
    throwIfAborted(options.signal);
    if (now() >= options.deadline) {
      throw new Error('production smoke polling deadline exceeded');
    }
    const observed = await options.observe();
    if (options.accept(observed)) return observed;
    throwIfAborted(options.signal);
    const remaining = options.deadline - now();
    if (remaining <= 0) {
      throw new Error('production smoke polling deadline exceeded');
    }
    await wait(Math.min(options.intervalMs, remaining));
  }
}

export async function runProductionSmoke(
  options: RunProductionSmokeOptions,
): Promise<OperatorSmokeReceipt> {
  const signal = options.signal ?? new AbortController().signal;
  let journal = await createSmokeJournal(options.environment.paths.journal, {
    runId: options.runId,
    release: options.environment.release,
    adminIdSha256: options.adminIdSha256,
    lifecycle: 'authorized',
    completedChecks: [],
    resources: [],
    cleanupStatus: 'pending',
    updatedAt: options.createdAt,
  });
  const persist = async (
    update: Partial<
      Pick<
        ProductionSmokeJournal,
        | 'lifecycle'
        | 'completedChecks'
        | 'resources'
        | 'cleanupStatus'
        | 'updatedAt'
      >
    >,
  ) => {
    journal = await updateSmokeJournal(options.environment.paths.journal, {
      ...journal,
      ...update,
      updatedAt: update.updatedAt ?? new Date().toISOString(),
    });
  };
  const context = contextFor(
    options.environment,
    {
      runId: options.runId,
      receiptId: options.receiptId,
      createdAt: options.createdAt,
    },
    () => journal,
    async (resource) => {
      if (
        journal.resources.some(
          (existing) =>
            existing.kind === resource.kind && existing.id === resource.id,
        )
      ) {
        throw new Error('production smoke resource already journaled');
      }
      await persist({ resources: [...journal.resources, resource] });
    },
  );

  let workError: unknown;
  let cleanupError: unknown;
  try {
    throwIfAborted(signal);
    await options.dependencies.preflight(context, signal);
    await persist({ lifecycle: 'running' });
    for (const check of PRODUCTION_SMOKE_CHECKS) {
      throwIfAborted(signal);
      await options.dependencies.runCheck(check, context, signal);
      await persist({
        completedChecks: [...journal.completedChecks, check],
      });
    }
    await persist({ lifecycle: 'checks-passed' });
  } catch (error) {
    workError = error;
  } finally {
    const cleanupSignal = new AbortController().signal;
    try {
      await persist({ lifecycle: 'cleaning', cleanupStatus: 'running' });
      await options.dependencies.cleanup(context, cleanupSignal);
      await options.dependencies.verifyCleanup(context, cleanupSignal);
      await persist({
        lifecycle:
          workError === undefined && checksComplete(journal)
            ? 'complete'
            : 'failed',
        cleanupStatus: 'complete',
      });
    } catch (error) {
      cleanupError = error;
      await persist({ lifecycle: 'failed', cleanupStatus: 'failed' });
    }
  }

  if (workError !== undefined) throw workError;
  if (cleanupError !== undefined) throw cleanupError;
  if (!checksComplete(journal) || journal.cleanupStatus !== 'complete') {
    throw new Error('production smoke did not reach receipt eligibility');
  }
  return options.dependencies.writeReceipt(context);
}

export async function resumeProductionSmokeCleanup(
  options: CleanupProductionSmokeOptions,
): Promise<void> {
  let journal = await readSmokeJournal(options.environment.paths.journal);
  if (
    journal.lifecycle === 'complete' &&
    journal.cleanupStatus === 'complete'
  ) {
    throw new Error('production smoke cleanup is already complete');
  }
  const persist = async (
    update: Partial<
      Pick<ProductionSmokeJournal, 'lifecycle' | 'cleanupStatus' | 'updatedAt'>
    >,
  ) => {
    journal = await updateSmokeJournal(options.environment.paths.journal, {
      ...journal,
      ...update,
      updatedAt: update.updatedAt ?? new Date().toISOString(),
    });
  };
  const context = contextFor(
    options.environment,
    {
      runId: journal.runId,
      receiptId: '',
      createdAt: journal.updatedAt,
    },
    () => journal,
    async () => {
      throw new Error('cleanup mode cannot record new resources');
    },
  );
  const signal = new AbortController().signal;
  try {
    await persist({ lifecycle: 'cleaning', cleanupStatus: 'running' });
    await options.dependencies.cleanup(context, signal);
    await options.dependencies.verifyCleanup(context, signal);
    await persist({ lifecycle: 'failed', cleanupStatus: 'complete' });
  } catch (error) {
    await persist({ lifecycle: 'failed', cleanupStatus: 'failed' });
    throw error;
  }
}
