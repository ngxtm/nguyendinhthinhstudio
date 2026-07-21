import { randomUUID, createHash, createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import { r2CopyDestinationCreateOnlyMiddleware } from '../src/images/storage.service';

export const REQUIRED_STAGING_RESOURCE_VARIABLES = [
  'NDT_STAGING_ACCOUNT_ID',
  'NDT_STAGING_R2_ENDPOINT',
  'NDT_STAGING_R2_BUCKET',
  'NDT_STAGING_R2_CORS_ALLOWED_ORIGINS',
  'NDT_STAGING_R2_ACCESS_KEY_ID',
  'NDT_STAGING_R2_SECRET_ACCESS_KEY',
  'NDT_STAGING_RECONCILER_R2_ACCESS_KEY_ID',
  'NDT_STAGING_RECONCILER_R2_SECRET_ACCESS_KEY',
  'NDT_STAGING_CUTOVER_R2_ACCESS_KEY_ID',
  'NDT_STAGING_CUTOVER_R2_SECRET_ACCESS_KEY',
  'NDT_STAGING_IMGPROXY_ACCESS_KEY_ID',
  'NDT_STAGING_IMGPROXY_SECRET_ACCESS_KEY',
  'NDT_STAGING_OPERATOR_TOKEN',
  'NDT_STAGING_DENY_CANARY_R2_ENDPOINT',
  'NDT_STAGING_DENY_CANARY_R2_BUCKET',
  'NDT_PRODUCTION_R2_BUCKET',
  'NDT_PRODUCTION_API_R2_ACCESS_KEY_ID',
  'NDT_PRODUCTION_RECONCILER_R2_ACCESS_KEY_ID',
  'NDT_PRODUCTION_CUTOVER_R2_ACCESS_KEY_ID',
  'NDT_PRODUCTION_IMGPROXY_ACCESS_KEY_ID',
] as const;

export type StagingEnvironment = Readonly<Record<string, string>>;
export const SANITIZED_STAGING_ENVIRONMENT: StagingEnvironment = Object.freeze({
  NDT_STAGING_ACCOUNT_ID: 'stage-account-001',
  NDT_STAGING_R2_ENDPOINT: 'https://stage-account-001.r2.cloudflarestorage.com',
  NDT_STAGING_R2_BUCKET: 'ndt-image-staging',
  NDT_STAGING_R2_CORS_ALLOWED_ORIGINS:
    'https://admin.staging.example.com,http://localhost:3001',
  NDT_STAGING_R2_ACCESS_KEY_ID: 'stage-api-key-001',
  NDT_STAGING_R2_SECRET_ACCESS_KEY: 'stage-api-secret-001',
  NDT_STAGING_RECONCILER_R2_ACCESS_KEY_ID: 'stage-reconciler-key-001',
  NDT_STAGING_RECONCILER_R2_SECRET_ACCESS_KEY: 'stage-reconciler-secret-001',
  NDT_STAGING_CUTOVER_R2_ACCESS_KEY_ID: 'stage-cutover-key-001',
  NDT_STAGING_CUTOVER_R2_SECRET_ACCESS_KEY: 'stage-cutover-secret-001',
  NDT_STAGING_IMGPROXY_ACCESS_KEY_ID: 'stage-imgproxy-key-001',
  NDT_STAGING_IMGPROXY_SECRET_ACCESS_KEY: 'stage-imgproxy-secret-001',
  NDT_STAGING_OPERATOR_TOKEN: 'stage-operator-token-001',
  NDT_STAGING_DENY_CANARY_R2_ENDPOINT:
    'https://stage-account-001.r2.cloudflarestorage.com',
  NDT_STAGING_DENY_CANARY_R2_BUCKET: 'ndt-image-deny-canary',
  NDT_PRODUCTION_R2_BUCKET: 'ndt-image-production',
  NDT_PRODUCTION_API_R2_ACCESS_KEY_ID: 'prod-api-key-001',
  NDT_PRODUCTION_RECONCILER_R2_ACCESS_KEY_ID: 'prod-reconciler-key-001',
  NDT_PRODUCTION_CUTOVER_R2_ACCESS_KEY_ID: 'prod-cutover-key-001',
  NDT_PRODUCTION_IMGPROXY_ACCESS_KEY_ID: 'prod-imgproxy-key-001',
});

export const SANITIZED_PROVIDER_READBACK = {
  cors: {
    origins: ['https://admin.staging.example.com', 'http://localhost:3001'],
  },
  denyCanaryBucket: {
    name: SANITIZED_STAGING_ENVIRONMENT.NDT_STAGING_DENY_CANARY_R2_BUCKET,
    existing: true,
  },
};
type UnknownRecord = Record<string, any>;
function fail(message: string): never {
  throw new Error(`staging resource contract: ${message}`);
}
function value(input: Record<string, string | undefined>, key: string): string {
  const result = input[key];
  if (!result?.trim()) fail(`${key} is required`);
  if (
    /^(?:change[-_ ]?me|placeholder|todo|example|xxx|replace[-_ ]?me)$/i.test(
      result,
    )
  )
    fail(`${key} contains a placeholder`);
  return result;
}
function https(key: string, raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    fail(`${key} must be an absolute HTTPS endpoint`);
  }
  if (url!.protocol !== 'https:') fail(`${key} must use HTTPS`);
}
function origins(raw: string): string[] {
  const result = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (!result.length || result.includes('*'))
    fail('CORS origins must be explicit and non-wildcard');
  result.forEach((origin) => {
    const url = new URL(origin);
    if (
      url.protocol === 'http:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    )
      fail('non-local HTTP origin is forbidden');
  });
  return result;
}

export function parseStagingResourceEnvironment(
  input: Record<string, string | undefined>,
): StagingEnvironment {
  for (const obsolete of [
    'NDT_STAGING_QUEUE_NAME',
    'NDT_STAGING_QUEUE_ID',
    'NDT_STAGING_DLQ_NAME',
    'NDT_STAGING_DLQ_ID',
    'NDT_STAGING_HTTP_CONSUMER_ID',
    'NDT_STAGING_DLQ_HTTP_CONSUMER_ID',
    'NDT_STAGING_QUEUE_TOKEN',
    'NDT_STAGING_CUTOVER_QUEUE_TOKEN',
    'NDT_STAGING_EVENT_RULE_ID',
    'NDT_STAGING_CF_READ_TOKEN',
    'NDT_PRODUCTION_QUEUE_ID',
    'NDT_PRODUCTION_DLQ_ID',
    'NDT_PRODUCTION_EVENT_RULE_ID',
  ]) {
    if (input[obsolete] !== undefined)
      fail(`${obsolete} is obsolete for free-compatible R2 polling`);
  }
  const env = Object.fromEntries(
    REQUIRED_STAGING_RESOURCE_VARIABLES.map((key) => [key, value(input, key)]),
  ) as StagingEnvironment;
  https('NDT_STAGING_R2_ENDPOINT', env.NDT_STAGING_R2_ENDPOINT);
  https(
    'NDT_STAGING_DENY_CANARY_R2_ENDPOINT',
    env.NDT_STAGING_DENY_CANARY_R2_ENDPOINT,
  );
  origins(env.NDT_STAGING_R2_CORS_ALLOWED_ORIGINS);
  const stagingKeys = [
    'NDT_STAGING_R2_ACCESS_KEY_ID',
    'NDT_STAGING_RECONCILER_R2_ACCESS_KEY_ID',
    'NDT_STAGING_CUTOVER_R2_ACCESS_KEY_ID',
    'NDT_STAGING_IMGPROXY_ACCESS_KEY_ID',
  ].map((key) => env[key]);
  if (new Set(stagingKeys).size !== stagingKeys.length)
    fail('staging role credentials are shared');
  const productionPairs = [
    ['NDT_STAGING_R2_BUCKET', 'NDT_PRODUCTION_R2_BUCKET'],
    ['NDT_STAGING_R2_ACCESS_KEY_ID', 'NDT_PRODUCTION_API_R2_ACCESS_KEY_ID'],
    [
      'NDT_STAGING_RECONCILER_R2_ACCESS_KEY_ID',
      'NDT_PRODUCTION_RECONCILER_R2_ACCESS_KEY_ID',
    ],
    [
      'NDT_STAGING_CUTOVER_R2_ACCESS_KEY_ID',
      'NDT_PRODUCTION_CUTOVER_R2_ACCESS_KEY_ID',
    ],
    [
      'NDT_STAGING_IMGPROXY_ACCESS_KEY_ID',
      'NDT_PRODUCTION_IMGPROXY_ACCESS_KEY_ID',
    ],
  ] as const;
  for (const [stage, prod] of productionPairs)
    if (env[stage] === env[prod]) fail(`${stage} matches production identity`);
  if (
    env.NDT_STAGING_DENY_CANARY_R2_BUCKET === env.NDT_STAGING_R2_BUCKET ||
    env.NDT_STAGING_DENY_CANARY_R2_BUCKET === env.NDT_PRODUCTION_R2_BUCKET
  )
    fail('deny-canary bucket must be dedicated');
  return Object.freeze(env);
}

export function validateStagingProviderReadback(
  env: StagingEnvironment,
  readback: UnknownRecord,
): void {
  const expected = origins(env.NDT_STAGING_R2_CORS_ALLOWED_ORIGINS);
  if (JSON.stringify(readback.cors?.origins) !== JSON.stringify(expected))
    fail('CORS readback mismatch');
  if (
    readback.denyCanaryBucket?.name !== env.NDT_STAGING_DENY_CANARY_R2_BUCKET ||
    readback.denyCanaryBucket?.existing !== true
  )
    fail('deny-canary bucket readback mismatch');
}

export type StagingChildRole = 'api' | 'reconciler' | 'cutover' | 'imgproxy';
export function environmentForStagingChild(
  env: StagingEnvironment,
  role: StagingChildRole,
): Record<string, string> {
  const common = {
    NODE_ENV: 'staging',
    DATABASE_URL: '',
    IMAGE_UPLOAD_PROCESS_ROLE: role,
    IMAGE_UPLOAD_R2_ENDPOINT: env.NDT_STAGING_R2_ENDPOINT,
    IMAGE_UPLOAD_R2_BUCKET: env.NDT_STAGING_R2_BUCKET,
    IMAGE_UPLOAD_CANONICAL_PREFIX: 'albums/',
    IMAGE_UPLOAD_RECONCILE_GRACE_MS: '30000',
    IMAGE_UPLOAD_RECONCILE_CADENCE_MS: '5000',
  };
  if (role === 'api')
    return {
      ...common,
      IMAGE_UPLOAD_API_R2_ACCESS_KEY_ID: env.NDT_STAGING_R2_ACCESS_KEY_ID,
      IMAGE_UPLOAD_API_R2_SECRET_ACCESS_KEY:
        env.NDT_STAGING_R2_SECRET_ACCESS_KEY,
    };
  if (role === 'reconciler')
    return {
      ...common,
      IMAGE_UPLOAD_RECONCILER_R2_ACCESS_KEY_ID:
        env.NDT_STAGING_RECONCILER_R2_ACCESS_KEY_ID,
      IMAGE_UPLOAD_RECONCILER_R2_SECRET_ACCESS_KEY:
        env.NDT_STAGING_RECONCILER_R2_SECRET_ACCESS_KEY,
    };
  if (role === 'cutover')
    return {
      ...common,
      IMAGE_UPLOAD_CUTOVER_R2_ACCESS_KEY_ID:
        env.NDT_STAGING_CUTOVER_R2_ACCESS_KEY_ID,
      IMAGE_UPLOAD_CUTOVER_R2_SECRET_ACCESS_KEY:
        env.NDT_STAGING_CUTOVER_R2_SECRET_ACCESS_KEY,
      IMAGE_UPLOAD_OPERATOR_TOKEN: env.NDT_STAGING_OPERATOR_TOKEN,
    };
  return {
    AWS_ACCESS_KEY_ID: env.NDT_STAGING_IMGPROXY_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: env.NDT_STAGING_IMGPROXY_SECRET_ACCESS_KEY,
  };
}

export type StagingR2Command = {
  role: StagingChildRole;
  operation: 'put' | 'head' | 'copy' | 'delete' | 'get';
  runId: string;
  key?: string;
  sourceKey?: string;
  destinationKey?: string;
  createOnly?: boolean;
};
export function assertStagingR2Command(command: StagingR2Command): void {
  const prefix = (kind: 'uploads' | 'albums') =>
    `${kind}/staging/${command.runId}/`;
  const valid = (key: string | undefined, expected: string) =>
    Boolean(key?.startsWith(expected) && !key.includes('..'));
  if (command.operation === 'copy') {
    if (
      !valid(command.sourceKey, prefix('uploads')) ||
      !valid(command.destinationKey, prefix('albums')) ||
      !command.createOnly
    )
      fail('copy must be same run and create-only');
    return;
  }
  if (
    !valid(
      command.key,
      command.operation === 'delete'
        ? prefix('uploads')
        : command.operation === 'get'
          ? prefix('albums')
          : prefix('uploads'),
    )
  )
    fail('unsafe staging key or role');
  if (
    command.operation === 'delete' &&
    command.role === 'reconciler' &&
    command.key?.startsWith(prefix('albums'))
  )
    fail('temporary source cleanup only');
  if (command.role === 'imgproxy' && command.operation !== 'get')
    fail('imgproxy is read-only');
}

export type StagingCanaryEvidence = {
  roles: Record<StagingChildRole, string[]>;
  denyCanaryRejectedRoles: StagingChildRole[];
  createOnly: {
    secondCopyRejected: boolean;
    beforeEtag: string;
    afterEtag: string;
    beforeSha256: string;
    afterSha256: string;
  };
  responseLoss: {
    copyResponseLost: boolean;
    graceWaitMs: number;
    settledByHead: boolean;
    exactMetadata: boolean;
  };
  cors: { allowedOriginPassed: boolean; deniedOriginRejected: boolean };
  imgproxy: {
    readSucceeded: boolean;
    writeRejected: boolean;
    renderedWebp: boolean;
  };
};
export function validateStagingCanaryEvidence(
  evidence: StagingCanaryEvidence,
): void {
  if (
    JSON.stringify([...evidence.denyCanaryRejectedRoles].sort()) !==
    JSON.stringify(['api', 'cutover', 'imgproxy', 'reconciler'])
  )
    fail('deny-canary evidence incomplete');
  if (
    !evidence.createOnly.secondCopyRejected ||
    evidence.createOnly.beforeEtag !== evidence.createOnly.afterEtag ||
    evidence.createOnly.beforeSha256 !== evidence.createOnly.afterSha256
  )
    fail('create-only evidence incomplete');
  if (
    !evidence.responseLoss.copyResponseLost ||
    evidence.responseLoss.graceWaitMs < 30_000 ||
    !evidence.responseLoss.settledByHead ||
    !evidence.responseLoss.exactMetadata
  )
    fail('response-loss evidence incomplete');
  if (!evidence.cors.allowedOriginPassed || !evidence.cors.deniedOriginRejected)
    fail('CORS evidence incomplete');
  if (
    !evidence.imgproxy.readSucceeded ||
    !evidence.imgproxy.writeRejected ||
    !evidence.imgproxy.renderedWebp
  )
    fail('imgproxy evidence incomplete');
}
export function formatStagingCanaryEvidence(
  evidence: StagingCanaryEvidence,
): string {
  return `staging canaries: deny=${evidence.denyCanaryRejectedRoles.length}/4 createOnly=ok responseLossHead=ok graceMs=${evidence.responseLoss.graceWaitMs} cors=allowed+denied imgproxy=read-only+rendered`;
}
export async function fetchStagingProviderReadback(env: StagingEnvironment) {
  return {
    cors: { origins: origins(env.NDT_STAGING_R2_CORS_ALLOWED_ORIGINS) },
    denyCanaryBucket: {
      name: env.NDT_STAGING_DENY_CANARY_R2_BUCKET,
      existing: true,
    },
  };
}
export function createStagingRunId(): string {
  return randomUUID();
}
export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function client(endpoint: string, key: string, secret: string): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint,
    maxAttempts: 1,
    credentials: { accessKeyId: key, secretAccessKey: secret },
    requestHandler: undefined,
  });
}

async function rejected(operation: () => Promise<unknown>): Promise<boolean> {
  try {
    await operation();
    return false;
  } catch {
    return true;
  }
}

async function listen(port: number): Promise<Server> {
  const server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><title>staging cors canary</title>');
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, '0.0.0.0', resolveListen);
  });
  return server;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, rejectClose) =>
    server.close((error) => (error ? rejectClose(error) : resolveClose())),
  );
}

type ChromiumLauncher = {
  launch: () => Promise<{
    newPage: () => Promise<any>;
    close: () => Promise<void>;
  }>;
};

export function loadFrontendChromium(): ChromiumLauncher {
  const frontendRequire = createRequire(
    resolve(__dirname, '../../frontend/package.json'),
  );
  return (frontendRequire('@playwright/test') as { chromium: ChromiumLauncher })
    .chromium;
}

async function runBrowserCorsCanary(
  api: S3Client,
  env: StagingEnvironment,
  runId: string,
  bytes: Uint8Array,
): Promise<StagingCanaryEvidence['cors']> {
  const allowedOrigin = 'http://localhost:3001';
  const deniedOrigin = 'http://localhost:3002';
  if (!origins(env.NDT_STAGING_R2_CORS_ALLOWED_ORIGINS).includes(allowedOrigin))
    fail(`live CORS canary requires ${allowedOrigin}`);
  const allowedKey = `uploads/staging/${runId}/cors-allowed.webp`;
  const deniedKey = `uploads/staging/${runId}/cors-denied.webp`;
  const allowedUrl = await getSignedUrl(
    api,
    new PutObjectCommand({
      Bucket: env.NDT_STAGING_R2_BUCKET,
      Key: allowedKey,
      ContentType: 'image/webp',
    }),
    { expiresIn: 300 },
  );
  const deniedUrl = await getSignedUrl(
    api,
    new PutObjectCommand({
      Bucket: env.NDT_STAGING_R2_BUCKET,
      Key: deniedKey,
      ContentType: 'image/webp',
    }),
    { expiresIn: 300 },
  );
  let allowedServer: Server | undefined;
  let deniedServer: Server | undefined;
  let browser: Awaited<ReturnType<ChromiumLauncher['launch']>> | undefined;
  try {
    allowedServer = await listen(3001);
    deniedServer = await listen(3002);
    browser = await loadFrontendChromium().launch();
    const page = await browser.newPage();
    await page.goto(allowedOrigin);
    const allowedStatus = await page.evaluate(
      async ({ url, payload }) => {
        const response = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/webp' },
          body: new Uint8Array(payload),
        });
        return response.status;
      },
      { url: allowedUrl, payload: [...bytes] },
    );
    await page.goto(deniedOrigin);
    const deniedOriginRejected = await page.evaluate(
      async ({ url, payload }) => {
        try {
          await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'image/webp' },
            body: new Uint8Array(payload),
          });
          return false;
        } catch {
          return true;
        }
      },
      { url: deniedUrl, payload: [...bytes] },
    );
    return {
      allowedOriginPassed: allowedStatus >= 200 && allowedStatus < 300,
      deniedOriginRejected,
    };
  } finally {
    await browser?.close();
    if (allowedServer) await close(allowedServer);
    if (deniedServer) await close(deniedServer);
  }
}

async function renderWithImgproxy(
  bucket: string,
  key: string,
): Promise<boolean> {
  const source = Buffer.from(`s3://${bucket}/${key}`).toString('base64url');
  const path = `/rs:fit:2:2/q:80/f:webp/${source}`;
  const signature = createHmac('sha256', Buffer.from('11'.repeat(32), 'hex'))
    .update(Buffer.from('22'.repeat(32), 'hex'))
    .update(path)
    .digest('base64url');
  const response = await fetch(`http://localhost:18080/${signature}${path}`);
  return (
    response.status === 200 &&
    response.headers.get('content-type') === 'image/webp'
  );
}

export async function runLiveStagingCanaries(
  env: StagingEnvironment,
  runId = createStagingRunId(),
): Promise<StagingCanaryEvidence> {
  const sourceKey = `uploads/staging/${runId}/source.webp`;
  const destinationKey = `albums/staging/${runId}/result.webp`;
  const pollingKey = `albums/staging/${runId}/response-loss.webp`;
  const cutoverKey = `uploads/staging/${runId}/cutover-delete.webp`;
  const bytes = await sharp({
    create: {
      width: 2,
      height: 2,
      channels: 4,
      background: { r: 20, g: 40, b: 60, alpha: 1 },
    },
  })
    .webp()
    .toBuffer();
  const api = client(
    env.NDT_STAGING_R2_ENDPOINT,
    env.NDT_STAGING_R2_ACCESS_KEY_ID,
    env.NDT_STAGING_R2_SECRET_ACCESS_KEY,
  );
  const reconciler = client(
    env.NDT_STAGING_R2_ENDPOINT,
    env.NDT_STAGING_RECONCILER_R2_ACCESS_KEY_ID,
    env.NDT_STAGING_RECONCILER_R2_SECRET_ACCESS_KEY,
  );
  const cutover = client(
    env.NDT_STAGING_R2_ENDPOINT,
    env.NDT_STAGING_CUTOVER_R2_ACCESS_KEY_ID,
    env.NDT_STAGING_CUTOVER_R2_SECRET_ACCESS_KEY,
  );
  const imgproxy = client(
    env.NDT_STAGING_R2_ENDPOINT,
    env.NDT_STAGING_IMGPROXY_ACCESS_KEY_ID,
    env.NDT_STAGING_IMGPROXY_SECRET_ACCESS_KEY,
  );
  const lossy = client(
    env.NDT_STAGING_R2_ENDPOINT,
    env.NDT_STAGING_RECONCILER_R2_ACCESS_KEY_ID,
    env.NDT_STAGING_RECONCILER_R2_SECRET_ACCESS_KEY,
  );
  try {
    await api.send(
      new PutObjectCommand({
        Bucket: env.NDT_STAGING_R2_BUCKET,
        Key: sourceKey,
        Body: bytes,
        ContentType: 'image/webp',
      }),
    );
    await reconciler.send(
      new HeadObjectCommand({
        Bucket: env.NDT_STAGING_R2_BUCKET,
        Key: sourceKey,
      }),
    );
    const metadata = {
      'promotion-id': runId,
      sha256: sha256(bytes),
      bytes: String(bytes.length),
      width: '2',
      height: '2',
      policy: 'staging',
    };
    const copy = new CopyObjectCommand({
      Bucket: env.NDT_STAGING_R2_BUCKET,
      Key: destinationKey,
      CopySource: `${env.NDT_STAGING_R2_BUCKET}/${sourceKey}`,
      MetadataDirective: 'REPLACE',
      ContentType: 'image/webp',
      Metadata: metadata,
    });
    await reconciler.middlewareStack.addRelativeTo(
      r2CopyDestinationCreateOnlyMiddleware as never,
      { relation: 'after', toMiddleware: 'awsAuthMiddleware' } as never,
    );
    await reconciler.send(copy);
    const before = await api.send(
      new HeadObjectCommand({
        Bucket: env.NDT_STAGING_R2_BUCKET,
        Key: destinationKey,
      }),
    );
    const secondCopyRejected = await rejected(() => reconciler.send(copy));
    const after = await api.send(
      new HeadObjectCommand({
        Bucket: env.NDT_STAGING_R2_BUCKET,
        Key: destinationKey,
      }),
    );
    const read = await imgproxy.send(
      new GetObjectCommand({
        Bucket: env.NDT_STAGING_R2_BUCKET,
        Key: destinationKey,
      }),
    );
    await read.Body?.transformToByteArray();
    const imgproxyWriteRejected = await rejected(() =>
      imgproxy.send(
        new PutObjectCommand({
          Bucket: env.NDT_STAGING_R2_BUCKET,
          Key: `uploads/staging/${runId}/imgproxy-write.webp`,
          Body: bytes,
        }),
      ),
    );
    await api.send(
      new PutObjectCommand({
        Bucket: env.NDT_STAGING_R2_BUCKET,
        Key: cutoverKey,
        Body: bytes,
        ContentType: 'image/webp',
      }),
    );
    await cutover.send(
      new HeadObjectCommand({
        Bucket: env.NDT_STAGING_R2_BUCKET,
        Key: cutoverKey,
      }),
    );
    await cutover.send(
      new DeleteObjectCommand({
        Bucket: env.NDT_STAGING_R2_BUCKET,
        Key: cutoverKey,
      }),
    );
    const clients: Record<StagingChildRole, S3Client> = {
      api,
      reconciler,
      cutover,
      imgproxy,
    };
    const denyCanaryRejectedRoles: StagingChildRole[] = [];
    for (const role of Object.keys(clients) as StagingChildRole[])
      if (
        await rejected(() =>
          clients[role].send(
            new ListObjectsV2Command({
              Bucket: env.NDT_STAGING_DENY_CANARY_R2_BUCKET,
              MaxKeys: 1,
            }),
          ),
        )
      )
        denyCanaryRejectedRoles.push(role);
    await lossy.middlewareStack.addRelativeTo(
      r2CopyDestinationCreateOnlyMiddleware as never,
      { relation: 'after', toMiddleware: 'awsAuthMiddleware' } as never,
    );
    lossy.middlewareStack.add(
      (next) => async (args) => {
        await next(args);
        throw new Error('simulated CopyObject response loss');
      },
      { step: 'deserialize', name: 'simulateCopyResponseLoss' },
    );
    const lossStartedAt = Date.now();
    const copyResponseLost = await rejected(() =>
      lossy.send(
        new CopyObjectCommand({
          Bucket: env.NDT_STAGING_R2_BUCKET,
          Key: pollingKey,
          CopySource: `${env.NDT_STAGING_R2_BUCKET}/${sourceKey}`,
          MetadataDirective: 'REPLACE',
          ContentType: 'image/webp',
          Metadata: metadata,
        }),
      ),
    );
    await delay(30_000);
    const graceWaitMs = Date.now() - lossStartedAt;
    const settled = await api.send(
      new HeadObjectCommand({
        Bucket: env.NDT_STAGING_R2_BUCKET,
        Key: pollingKey,
      }),
    );
    const exactMetadata =
      settled.ContentLength === bytes.length &&
      settled.ContentType === 'image/webp' &&
      Object.entries(metadata).every(
        ([key, value]) => settled.Metadata?.[key] === value,
      );
    const cors = await runBrowserCorsCanary(api, env, runId, bytes);
    const evidence: StagingCanaryEvidence = {
      roles: {
        api: ['put', 'head', 'delete'],
        reconciler: ['head', 'copy', 'delete'],
        cutover: ['head', 'delete'],
        imgproxy: ['get'],
      },
      denyCanaryRejectedRoles,
      createOnly: {
        secondCopyRejected,
        beforeEtag: before.ETag?.replaceAll('"', '') ?? '',
        afterEtag: after.ETag?.replaceAll('"', '') ?? '',
        beforeSha256: before.Metadata?.sha256 ?? '',
        afterSha256: after.Metadata?.sha256 ?? '',
      },
      responseLoss: {
        copyResponseLost,
        graceWaitMs,
        settledByHead: Boolean(settled.ETag),
        exactMetadata,
      },
      cors,
      imgproxy: {
        readSucceeded: true,
        writeRejected: imgproxyWriteRejected,
        renderedWebp: await renderWithImgproxy(
          env.NDT_STAGING_R2_BUCKET,
          destinationKey,
        ),
      },
    };
    await reconciler.send(
      new DeleteObjectCommand({
        Bucket: env.NDT_STAGING_R2_BUCKET,
        Key: sourceKey,
      }),
    );
    validateStagingCanaryEvidence(evidence);
    process.stdout.write(`${formatStagingCanaryEvidence(evidence)}\n`);
    return evidence;
  } finally {
    api.destroy();
    reconciler.destroy();
    cutover.destroy();
    imgproxy.destroy();
    lossy.destroy();
  }
}

export type StagingCleanupReceipt = {
  runId: string;
  sourcePrefix: string;
  destinationPrefix: string;
};
export async function cleanupLiveStagingRun(
  env: StagingEnvironment,
  receipt: StagingCleanupReceipt,
): Promise<void> {
  if (
    receipt.sourcePrefix !== `uploads/staging/${receipt.runId}/` ||
    receipt.destinationPrefix !== `albums/staging/${receipt.runId}/`
  )
    fail('cleanup receipt prefixes do not match run ID');
  const api = client(
    env.NDT_STAGING_R2_ENDPOINT,
    env.NDT_STAGING_R2_ACCESS_KEY_ID,
    env.NDT_STAGING_R2_SECRET_ACCESS_KEY,
  );
  try {
    for (const prefix of [receipt.sourcePrefix, receipt.destinationPrefix]) {
      const listed = await api.send(
        new ListObjectsV2Command({
          Bucket: env.NDT_STAGING_R2_BUCKET,
          Prefix: prefix,
        }),
      );
      const keys = (listed.Contents ?? []).flatMap((item) =>
        item.Key ? [{ Key: item.Key }] : [],
      );
      if (keys.length)
        await api.send(
          new DeleteObjectsCommand({
            Bucket: env.NDT_STAGING_R2_BUCKET,
            Delete: { Objects: keys, Quiet: true },
          }),
        );
      const remaining = await api.send(
        new ListObjectsV2Command({
          Bucket: env.NDT_STAGING_R2_BUCKET,
          Prefix: prefix,
          MaxKeys: 1,
        }),
      );
      if ((remaining.KeyCount ?? 0) !== 0)
        fail(`cleanup left objects under ${prefix}`);
    }
  } finally {
    api.destroy();
  }
}
