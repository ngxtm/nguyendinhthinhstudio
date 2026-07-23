import { createHash, randomUUID } from 'node:crypto';
import {
  parseProductionSmokeEnvironment,
  type ProductionSmokeEnvironment,
} from './image-upload-production-smoke-contract';
import {
  resumeProductionSmokeCleanup,
  runProductionSmoke,
  type ProductionSmokeDependencies,
} from './image-upload-production-smoke-orchestrator';
import { buildProductionSmokeDependencies } from './image-upload-production-smoke-dependencies';

export type ProductionSmokeCommand = 'run' | 'cleanup';

type RunFunction = typeof runProductionSmoke;
type CleanupFunction = typeof resumeProductionSmokeCleanup;

export type ProductionSmokeCliDependencies = Readonly<{
  repositoryRoot: string;
  env: Readonly<Record<string, string | undefined>>;
  parseEnvironment: typeof parseProductionSmokeEnvironment;
  buildDependencies: (
    environment: ProductionSmokeEnvironment,
  ) => ProductionSmokeDependencies | Promise<ProductionSmokeDependencies>;
  run: RunFunction;
  cleanup: CleanupFunction;
  randomUuid: () => string;
  now: () => Date;
  adminIdSha256: (environment: ProductionSmokeEnvironment) => string;
  onSignal: (name: 'SIGINT' | 'SIGTERM', listener: () => void) => void;
  offSignal: (name: 'SIGINT' | 'SIGTERM', listener: () => void) => void;
  log: (message: string) => void;
}>;

export function parseProductionSmokeCommand(
  argv: readonly string[],
): ProductionSmokeCommand {
  if (argv.length !== 1 || !['run', 'cleanup'].includes(argv[0])) {
    throw new Error(
      'usage: run-image-upload-production-smoke.js <run|cleanup>',
    );
  }
  return argv[0] as ProductionSmokeCommand;
}

function jwtSubject(token: string): string {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('production smoke admin bearer token is invalid');
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error('production smoke admin bearer token is invalid');
  }
  const subject =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).sub
      : undefined;
  if (
    typeof subject !== 'string' ||
    subject.length < 1 ||
    subject.length > 255
  ) {
    throw new Error('production smoke admin bearer token is invalid');
  }
  return subject;
}

export function productionSmokeAdminId(
  environment: ProductionSmokeEnvironment,
): string {
  return jwtSubject(environment.secrets.adminBearerToken);
}

export function productionSmokeAdminIdSha256(
  environment: ProductionSmokeEnvironment,
): string {
  return createHash('sha256')
    .update(productionSmokeAdminId(environment))
    .digest('hex');
}

const defaults: ProductionSmokeCliDependencies = {
  repositoryRoot: '/app',
  env: process.env,
  parseEnvironment: parseProductionSmokeEnvironment,
  buildDependencies: buildProductionSmokeDependencies,
  run: runProductionSmoke,
  cleanup: resumeProductionSmokeCleanup,
  randomUuid: randomUUID,
  now: () => new Date(),
  adminIdSha256: productionSmokeAdminIdSha256,
  onSignal: (name, listener) => process.on(name, listener),
  offSignal: (name, listener) => process.off(name, listener),
  log: (message) => console.log(message),
};

export async function executeProductionSmokeCli(
  argv: readonly string[],
  dependencies: ProductionSmokeCliDependencies = defaults,
): Promise<void> {
  const command = parseProductionSmokeCommand(argv);
  const environment = dependencies.parseEnvironment(
    dependencies.env,
    dependencies.repositoryRoot,
  );
  const liveDependencies = await dependencies.buildDependencies(environment);
  const controller = new AbortController();
  const abort = () => controller.abort();
  dependencies.onSignal('SIGINT', abort);
  dependencies.onSignal('SIGTERM', abort);
  try {
    if (command === 'cleanup') {
      dependencies.log('production smoke cleanup started');
      await dependencies.cleanup({
        environment,
        dependencies: liveDependencies,
      });
      dependencies.log('production smoke cleanup complete');
      return;
    }
    dependencies.log('production smoke run started');
    const receipt = await dependencies.run({
      environment,
      dependencies: liveDependencies,
      runId: dependencies.randomUuid(),
      receiptId: dependencies.randomUuid(),
      adminIdSha256: dependencies.adminIdSha256(environment),
      createdAt: dependencies.now().toISOString(),
      signal: controller.signal,
    });
    dependencies.log(
      `production smoke receipt canonicalSha256=${receipt.canonicalSha256}`,
    );
  } catch {
    throw new Error(`production smoke ${command} failed`);
  } finally {
    dependencies.offSignal('SIGINT', abort);
    dependencies.offSignal('SIGTERM', abort);
  }
}

if (require.main === module) {
  executeProductionSmokeCli(process.argv.slice(2)).catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
