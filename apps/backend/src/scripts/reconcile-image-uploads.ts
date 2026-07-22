import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { parseImageUploadRuntimeConfig } from '../images/image-upload-runtime-config';
import type { ReconcilerHeartbeatField } from '../images/image-upload-reconciler.service';

const LOCK_ID = 0x494d4755;

export function assertReconcilerEnvironment(env: NodeJS.ProcessEnv) {
  const runtime = parseImageUploadRuntimeConfig(env, 'reconciler');
  if (
    !/^sha256:[0-9a-f]{64}$/.test(
      env.IMAGE_UPLOAD_BUILD_FINGERPRINT?.trim() ?? '',
    )
  ) {
    throw new Error(
      'IMAGE_UPLOAD_BUILD_FINGERPRINT must be an immutable sha256 digest',
    );
  }
  return runtime;
}

type DedicatedClient = Pick<Client, 'query' | 'on' | 'off'>;

const heartbeatColumns: Record<ReconcilerHeartbeatField, string> = {
  pendingSessionExpiryCompletedAt: 'pendingSessionExpiryCompletedAt',
  promotionRecoveryCompletedAt: 'promotionRecoveryCompletedAt',
  temporaryCleanupCompletedAt: 'temporaryCleanupCompletedAt',
  imageDeletionCompletedAt: 'imageDeletionCompletedAt',
  rateLimitCleanupCompletedAt: 'rateLimitCleanupCompletedAt',
};

export async function initializeDedicatedHeartbeat(
  client: DedicatedClient,
  ownerId: string,
  buildFingerprint: string,
  acquiredAt: Date,
): Promise<void> {
  await client.query(
    `INSERT INTO "ImageUploadReconcilerHeartbeat"
      ("id", "ownerId", "buildFingerprint", "lockAcquiredAt", "heartbeatAt", "updatedAt")
     VALUES ('singleton', $1, $2, $3, $3, $3)
     ON CONFLICT ("id") DO UPDATE SET
       "ownerId" = EXCLUDED."ownerId",
       "buildFingerprint" = EXCLUDED."buildFingerprint",
       "lockAcquiredAt" = EXCLUDED."lockAcquiredAt",
       "heartbeatAt" = EXCLUDED."heartbeatAt",
       "pendingSessionExpiryCompletedAt" = NULL,
       "promotionRecoveryCompletedAt" = NULL,
       "temporaryCleanupCompletedAt" = NULL,
       "imageDeletionCompletedAt" = NULL,
       "rateLimitCleanupCompletedAt" = NULL,
       "updatedAt" = EXCLUDED."updatedAt"`,
    [ownerId, buildFingerprint, acquiredAt],
  );
}

export function createDedicatedHeartbeatWriter(client: DedicatedClient) {
  return async (field: ReconcilerHeartbeatField, at: Date): Promise<void> => {
    const column = heartbeatColumns[field];
    if (!column) throw new Error('unknown reconciler heartbeat field');
    await client.query(
      `UPDATE "ImageUploadReconcilerHeartbeat"
       SET "${column}" = $1, "heartbeatAt" = $1, "updatedAt" = $1
       WHERE "id" = 'singleton'`,
      [at],
    );
  };
}

export function registerLockConnectionAbort(
  client: DedicatedClient,
  controller: AbortController,
  onError: (error: Error) => void = () => undefined,
): () => void {
  const listener = (error: Error) => {
    onError(error);
    controller.abort();
  };
  client.on('error', listener);
  return () => client.off('error', listener);
}

export async function main(env = process.env) {
  const runtime = assertReconcilerEnvironment(env);
  const pg = new Client({ connectionString: env.DATABASE_URL });
  await pg.connect();
  const abort = new AbortController();
  let lockConnectionError: Error | undefined;
  const unregisterLockAbort = registerLockConnectionAbort(
    pg,
    abort,
    (error) => {
      lockConnectionError = error;
    },
  );
  const lock = await pg.query<{ acquired: boolean }>('SELECT pg_try_advisory_lock($1) AS acquired', [LOCK_ID]);
  if (!lock.rows[0]?.acquired) {
    unregisterLockAbort();
    await pg.end();
    throw new Error('image upload reconciler lock is already owned');
  }
  const ownerId = randomUUID();
  await initializeDedicatedHeartbeat(
    pg,
    ownerId,
    env.IMAGE_UPLOAD_BUILD_FINGERPRINT!,
    new Date(),
  );
  const heartbeat = createDedicatedHeartbeatWriter(pg);
  const [
    { NestFactory },
    { ImageUploadReconcilerModule },
    { ImageUploadReconcilerService },
  ] = await Promise.all([
    import('@nestjs/core'),
    import('../images/image-upload-reconciler.module.js'),
    import('../images/image-upload-reconciler.service.js'),
  ]);
  const app = await NestFactory.createApplicationContext(
    ImageUploadReconcilerModule,
    { logger: false },
  );
  const stop = () => abort.abort(); process.once('SIGTERM', stop); process.once('SIGINT', stop);
  try {
    const reconciler = app.get(ImageUploadReconcilerService);
    while (!abort.signal.aborted) {
      await reconciler.runOnce({ heartbeat, signal: abort.signal });
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, runtime.reconcileCadenceMs);
        abort.signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
    }
    if (lockConnectionError) {
      throw new Error('image upload reconciler lock connection lost');
    }
  } finally {
    process.off('SIGTERM', stop); process.off('SIGINT', stop);
    unregisterLockAbort();
    await app.close(); await pg.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => undefined); await pg.end();
  }
}

if (require.main === module) main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : 'reconciler failed'}\n`); process.exitCode = 1; });
