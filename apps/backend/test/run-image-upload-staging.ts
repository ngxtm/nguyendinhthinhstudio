import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { platform } from 'node:process';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cleanupLiveStagingRun,
  createStagingRunId,
  fetchStagingProviderReadback,
  parseStagingResourceEnvironment,
  runLiveStagingCanaries,
  validateStagingProviderReadback,
  type StagingEnvironment,
} from './staging-resource-contract';

const root = resolve(__dirname, '../../..');

export type StagingReceipt = {
  runId: string;
  sourcePrefix: string;
  destinationPrefix: string;
  databaseIdentity: string | null;
  consumedEventIds: string[];
  cleanupStatus: 'pending' | 'complete' | 'failed';
  updatedAt: string;
};

export type StagingDatabase = {
  databaseUrl: string;
  directUrl: string;
  identity: string;
  dispose?: () => Promise<void>;
};

type StagingDatabaseEnvironment = Record<string, string | undefined>;

export type StagingOrchestratorDependencies = {
  preflight: (
    signal: AbortSignal,
  ) => Promise<{ roleEnvironment: Record<string, string> }>;
  createDatabase: (signal: AbortSignal) => Promise<StagingDatabase>;
  migrate: (database: StagingDatabase, signal: AbortSignal) => Promise<void>;
  backendSuites: (
    database: StagingDatabase,
    roleEnvironment: Record<string, string>,
    signal: AbortSignal,
  ) => Promise<void>;
  frontendSuites: (signal: AbortSignal) => Promise<void>;
  providerSmoke: (
    roleEnvironment: Record<string, string>,
    runId: string,
    signal: AbortSignal,
  ) => Promise<void>;
  verify: (receipt: StagingReceipt, signal: AbortSignal) => Promise<void>;
  cleanup: (receipt: StagingReceipt, signal: AbortSignal) => Promise<void>;
};

export type StagingQualificationOptions = {
  dependencies: StagingOrchestratorDependencies;
  runId?: string;
  receiptPath?: string;
  signal?: AbortSignal;
};

function abortError(): Error {
  return Object.assign(new Error('staging qualification aborted'), {
    name: 'AbortError',
  });
}

function assertRunId(runId: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      runId,
    )
  ) {
    throw new TypeError('staging run ID must be a UUIDv4');
  }
}

function defaultReceiptPath(runId: string): string {
  return join(tmpdir(), `ndt-image-upload-staging-${runId}.json`);
}

function assertReceiptOutsideRepository(path: string): void {
  const root = resolve(__dirname, '../../..');
  const absolute = resolve(path);
  const relation = relative(root, absolute);
  if (
    relation === '' ||
    (!relation.startsWith('..') && !isAbsolute(relation))
  ) {
    throw new Error('staging receipt must be outside the repository');
  }
}

async function persistReceipt(
  path: string,
  receipt: StagingReceipt,
): Promise<void> {
  assertReceiptOutsideRepository(path);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(receipt)}\n`, { mode: 0o600 });
  if (platform === 'win32' && process.env.NODE_ENV !== 'test') {
    const username = process.env.USERNAME;
    if (!username) throw new Error('USERNAME is required for receipt ACL');
    execFileSync(
      'icacls',
      [path, '/inheritance:r', '/grant:r', `${username}:F`],
      {
        stdio: 'ignore',
      },
    );
  } else {
    await chmod(path, 0o600);
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

export async function runStagingQualification(
  options: StagingQualificationOptions,
): Promise<StagingReceipt> {
  const runId = options.runId ?? createStagingRunId();
  assertRunId(runId);
  const sourcePrefix = `uploads/staging/${runId}/`;
  const destinationPrefix = `albums/staging/${runId}/`;
  const receiptPath =
    options.receiptPath ??
    process.env.NDT_STAGING_RECEIPT_PATH ??
    defaultReceiptPath(runId);
  const receipt: StagingReceipt = {
    runId,
    sourcePrefix,
    destinationPrefix,
    databaseIdentity: null,
    consumedEventIds: [],
    cleanupStatus: 'pending',
    updatedAt: new Date().toISOString(),
  };
  const controller = new AbortController();
  const signal = options.signal ?? controller.signal;
  const onExternalAbort = () => controller.abort();
  if (options.signal)
    options.signal.addEventListener('abort', onExternalAbort, { once: true });
  const onProcessSignal = () => controller.abort();
  if (!options.signal) {
    process.once('SIGINT', onProcessSignal);
    process.once('SIGTERM', onProcessSignal);
  }
  let database: StagingDatabase | undefined;
  let cleaned = false;
  const cleanupOnce = async (): Promise<void> => {
    if (cleaned) return;
    cleaned = true;
    try {
      await options.dependencies.cleanup(receipt, signal);
      await database?.dispose?.();
      receipt.cleanupStatus = 'complete';
    } catch (error) {
      receipt.cleanupStatus = 'failed';
      receipt.updatedAt = new Date().toISOString();
      await persistReceipt(receiptPath, receipt);
      throw error;
    }
    receipt.updatedAt = new Date().toISOString();
    await persistReceipt(receiptPath, receipt);
  };
  try {
    await persistReceipt(receiptPath, receipt);
    throwIfAborted(signal);
    const preflight = await options.dependencies.preflight(signal);
    throwIfAborted(signal);
    database = await options.dependencies.createDatabase(signal);
    receipt.databaseIdentity = database.identity;
    receipt.updatedAt = new Date().toISOString();
    await persistReceipt(receiptPath, receipt);
    await options.dependencies.migrate(database, signal);
    throwIfAborted(signal);
    await options.dependencies.backendSuites(
      database,
      preflight.roleEnvironment,
      signal,
    );
    throwIfAborted(signal);
    await options.dependencies.frontendSuites(signal);
    throwIfAborted(signal);
    await options.dependencies.providerSmoke(
      preflight.roleEnvironment,
      runId,
      signal,
    );
    throwIfAborted(signal);
    await options.dependencies.verify(receipt, signal);
    return receipt;
  } finally {
    await cleanupOnce();
    if (options.signal)
      options.signal.removeEventListener('abort', onExternalAbort);
    if (!options.signal) {
      process.removeListener('SIGINT', onProcessSignal);
      process.removeListener('SIGTERM', onProcessSignal);
    }
  }
}

function runCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  cwd = root,
): Promise<void> {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: 'inherit',
    });
    child.once('error', rejectCommand);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveCommand();
      else
        rejectCommand(
          new Error(
            `${command} exited code=${code ?? 'null'} signal=${signal ?? 'null'}`,
          ),
        );
    });
  });
}

function refuseAmbientDatabase(): void {
  if (process.env.DATABASE_URL || process.env.DIRECT_URL) {
    throw new Error(
      'staging orchestrator refuses ambient DATABASE_URL/DIRECT_URL',
    );
  }
}

function requiredDatabaseValue(
  input: StagingDatabaseEnvironment,
  name: string,
): string {
  const value = input[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseSupabaseProjectRef(value: string, name: string): string {
  if (!/^[a-z0-9]{20}$/.test(value)) {
    throw new Error(`${name} must be a 20-character lowercase Supabase ref`);
  }
  return value;
}

function parsePostgresUrl(value: string, name: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL`);
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(`${name} must use postgres or postgresql`);
  }
  if (!parsed.hostname || !parsed.username || !parsed.password) {
    throw new Error(`${name} must include host, username, and password`);
  }
  return parsed;
}

function targetsSupabaseRef(url: URL, projectRef: string): boolean {
  if (url.hostname === `db.${projectRef}.supabase.co`) return true;
  return (
    url.hostname.endsWith('.pooler.supabase.com') &&
    decodeURIComponent(url.username) === `postgres.${projectRef}`
  );
}

function isSessionCapableSupabaseUrl(url: URL): boolean {
  if (url.hostname.endsWith('.pooler.supabase.com')) {
    return url.port === '5432';
  }
  return url.port === '' || url.port === '5432';
}

export function parseStagingDatabaseEnvironment(
  input: StagingDatabaseEnvironment,
): StagingDatabase {
  const stagingRef = parseSupabaseProjectRef(
    requiredDatabaseValue(input, 'NDT_STAGING_SUPABASE_PROJECT_REF'),
    'NDT_STAGING_SUPABASE_PROJECT_REF',
  );
  const productionRef = parseSupabaseProjectRef(
    requiredDatabaseValue(input, 'NDT_PRODUCTION_SUPABASE_PROJECT_REF'),
    'NDT_PRODUCTION_SUPABASE_PROJECT_REF',
  );
  if (stagingRef === productionRef) {
    throw new Error('staging Supabase project ref must differ from production');
  }
  const databaseUrl = requiredDatabaseValue(
    input,
    'NDT_STAGING_DATABASE_URL',
  );
  const directUrl = requiredDatabaseValue(input, 'NDT_STAGING_DIRECT_URL');
  const parsedDatabaseUrl = parsePostgresUrl(
    databaseUrl,
    'NDT_STAGING_DATABASE_URL',
  );
  const parsedDirectUrl = parsePostgresUrl(
    directUrl,
    'NDT_STAGING_DIRECT_URL',
  );
  if (!targetsSupabaseRef(parsedDatabaseUrl, stagingRef)) {
    throw new Error(
      'NDT_STAGING_DATABASE_URL must target the staging Supabase ref',
    );
  }
  if (!targetsSupabaseRef(parsedDirectUrl, stagingRef)) {
    throw new Error(
      'NDT_STAGING_DIRECT_URL must target the staging Supabase ref',
    );
  }
  if (!isSessionCapableSupabaseUrl(parsedDatabaseUrl)) {
    throw new Error(
      'NDT_STAGING_DATABASE_URL must use a session-capable port',
    );
  }
  if (!isSessionCapableSupabaseUrl(parsedDirectUrl)) {
    throw new Error('NDT_STAGING_DIRECT_URL must use a session-capable port');
  }
  return {
    databaseUrl,
    directUrl,
    identity: `supabase:${createHash('sha256').update(stagingRef).digest('hex')}`,
  };
}

async function defaultDependencies(): Promise<StagingOrchestratorDependencies> {
  refuseAmbientDatabase();
  const input = process.env as Record<string, string | undefined>;
  const database = parseStagingDatabaseEnvironment(input);
  let stagingEnvironment: StagingEnvironment;
  return {
    preflight: async () => {
      stagingEnvironment = parseStagingResourceEnvironment(input);
      const provider = await fetchStagingProviderReadback(stagingEnvironment);
      validateStagingProviderReadback(stagingEnvironment, provider);
      return { roleEnvironment: stagingEnvironment };
    },
    createDatabase: async () => database,
    migrate: async (database) =>
      runCommand('npm', ['run', 'migrate:deploy', '--workspace=backend'], {
        ...process.env,
        DATABASE_URL: database.databaseUrl,
        DIRECT_URL: database.directUrl,
      }),
    backendSuites: async (database) =>
      runCommand(
        'npm',
        ['run', 'test:image-upload:ci', '--workspace=backend'],
        {
          ...process.env,
          DATABASE_URL: database.databaseUrl,
          DIRECT_URL: database.directUrl,
        },
      ),
    frontendSuites: async () =>
      runCommand(
        'npx',
        [
          '--no-install',
          'playwright',
          'test',
          'test/image-upload.browser.spec.ts',
          '--project=chromium',
        ],
        process.env,
        resolve(root, 'apps/frontend'),
      ),
    providerSmoke: async (_roleEnvironment, runId) => {
      await runLiveStagingCanaries(stagingEnvironment, runId);
    },
    verify: async () => undefined,
    cleanup: async (receipt) => {
      if (stagingEnvironment)
        await cleanupLiveStagingRun(stagingEnvironment, receipt);
    },
  };
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode !== 'run' && mode !== 'cleanup') {
    throw new Error('usage: run-image-upload-staging.ts <run|cleanup>');
  }
  if (mode === 'cleanup') {
    const receiptPath = process.env.NDT_STAGING_RECEIPT_PATH;
    if (!receiptPath)
      throw new Error('NDT_STAGING_RECEIPT_PATH is required for cleanup');
    const receipt = JSON.parse(
      await readFile(receiptPath, 'utf8'),
    ) as StagingReceipt;
    const input = process.env as Record<string, string | undefined>;
    const staging = parseStagingResourceEnvironment(input);
    await cleanupLiveStagingRun(staging, receipt);
    receipt.cleanupStatus = 'complete';
    receipt.updatedAt = new Date().toISOString();
    await persistReceipt(receiptPath, receipt);
    return;
  }
  await runStagingQualification({ dependencies: await defaultDependencies() });
}

if (process.argv[1]?.endsWith('run-image-upload-staging.ts')) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
