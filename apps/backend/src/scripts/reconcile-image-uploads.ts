import { Client } from 'pg';

const LOCK_ID = 0x494d4755;

export function assertReconcilerEnvironment(env: NodeJS.ProcessEnv) {
  if (env.IMAGE_UPLOAD_PROCESS_ROLE !== 'reconciler') throw new Error('IMAGE_UPLOAD_PROCESS_ROLE must be reconciler');
  for (const key of ['DATABASE_URL', 'IMAGE_UPLOAD_CLOUDFLARE_ACCOUNT_ID', 'IMAGE_UPLOAD_R2_BUCKET', 'IMAGE_UPLOAD_QUEUE_ID', 'IMAGE_UPLOAD_QUEUE_TOKEN']) if (!env[key]) throw new Error(`${key} is required`);
}

export async function main(env = process.env) {
  assertReconcilerEnvironment(env);
  const pg = new Client({ connectionString: env.DATABASE_URL });
  await pg.connect();
  const lock = await pg.query<{ acquired: boolean }>('SELECT pg_try_advisory_lock($1) AS acquired', [LOCK_ID]);
  if (!lock.rows[0]?.acquired) throw new Error('image upload reconciler lock is already owned');
  const [{ NestFactory }, { AppModule }, { ImageUploadReconcilerService }] = await Promise.all([
    import('@nestjs/core'),
    import('../app.module.js'),
    import('../images/image-upload-reconciler.service.js'),
  ]);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const abort = new AbortController();
  const stop = () => abort.abort(); process.once('SIGTERM', stop); process.once('SIGINT', stop);
  try {
    const reconciler = app.get(ImageUploadReconcilerService);
    while (!abort.signal.aborted) {
      await reconciler.runOnce({ account: env.IMAGE_UPLOAD_CLOUDFLARE_ACCOUNT_ID!, bucket: env.IMAGE_UPLOAD_R2_BUCKET!, queue: { accountId: env.IMAGE_UPLOAD_CLOUDFLARE_ACCOUNT_ID, queueId: env.IMAGE_UPLOAD_QUEUE_ID, token: env.IMAGE_UPLOAD_QUEUE_TOKEN } });
      await new Promise<void>((resolve) => { const timer = setTimeout(resolve, 60_000); abort.signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true }); });
    }
  } finally {
    process.off('SIGTERM', stop); process.off('SIGINT', stop);
    await app.close(); await pg.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => undefined); await pg.end();
  }
}

if (require.main === module) main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : 'reconciler failed'}\n`); process.exitCode = 1; });
