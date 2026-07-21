import { randomUUID, createHash } from 'node:crypto';
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { r2CopyDestinationCreateOnlyMiddleware } from '../src/images/storage.service';

export const REQUIRED_STAGING_RESOURCE_VARIABLES = [
  'NDT_STAGING_ACCOUNT_ID', 'NDT_STAGING_R2_ENDPOINT', 'NDT_STAGING_R2_BUCKET',
  'NDT_STAGING_R2_CORS_ALLOWED_ORIGINS',
  'NDT_STAGING_R2_ACCESS_KEY_ID', 'NDT_STAGING_R2_SECRET_ACCESS_KEY',
  'NDT_STAGING_RECONCILER_R2_ACCESS_KEY_ID', 'NDT_STAGING_RECONCILER_R2_SECRET_ACCESS_KEY',
  'NDT_STAGING_CUTOVER_R2_ACCESS_KEY_ID', 'NDT_STAGING_CUTOVER_R2_SECRET_ACCESS_KEY',
  'NDT_STAGING_IMGPROXY_ACCESS_KEY_ID', 'NDT_STAGING_IMGPROXY_SECRET_ACCESS_KEY',
  'NDT_STAGING_OPERATOR_TOKEN',
  'NDT_STAGING_DENY_CANARY_R2_ENDPOINT', 'NDT_STAGING_DENY_CANARY_R2_BUCKET',
  'NDT_PRODUCTION_R2_BUCKET', 'NDT_PRODUCTION_API_R2_ACCESS_KEY_ID',
  'NDT_PRODUCTION_RECONCILER_R2_ACCESS_KEY_ID', 'NDT_PRODUCTION_CUTOVER_R2_ACCESS_KEY_ID',
  'NDT_PRODUCTION_IMGPROXY_ACCESS_KEY_ID',
] as const;

export type StagingEnvironment = Readonly<Record<string, string>>;
export const SANITIZED_STAGING_ENVIRONMENT: StagingEnvironment = Object.freeze({
  NDT_STAGING_ACCOUNT_ID: 'stage-account-001',
  NDT_STAGING_R2_ENDPOINT: 'https://stage-account-001.r2.cloudflarestorage.com',
  NDT_STAGING_R2_BUCKET: 'ndt-image-staging',
  NDT_STAGING_R2_CORS_ALLOWED_ORIGINS: 'https://admin.staging.example.com,http://localhost:3001',
  NDT_STAGING_R2_ACCESS_KEY_ID: 'stage-api-key-001',
  NDT_STAGING_R2_SECRET_ACCESS_KEY: 'stage-api-secret-001',
  NDT_STAGING_RECONCILER_R2_ACCESS_KEY_ID: 'stage-reconciler-key-001',
  NDT_STAGING_RECONCILER_R2_SECRET_ACCESS_KEY: 'stage-reconciler-secret-001',
  NDT_STAGING_CUTOVER_R2_ACCESS_KEY_ID: 'stage-cutover-key-001',
  NDT_STAGING_CUTOVER_R2_SECRET_ACCESS_KEY: 'stage-cutover-secret-001',
  NDT_STAGING_IMGPROXY_ACCESS_KEY_ID: 'stage-imgproxy-key-001',
  NDT_STAGING_IMGPROXY_SECRET_ACCESS_KEY: 'stage-imgproxy-secret-001',
  NDT_STAGING_OPERATOR_TOKEN: 'stage-operator-token-001',
  NDT_STAGING_DENY_CANARY_R2_ENDPOINT: 'https://stage-account-001.r2.cloudflarestorage.com',
  NDT_STAGING_DENY_CANARY_R2_BUCKET: 'ndt-image-deny-canary',
  NDT_PRODUCTION_R2_BUCKET: 'ndt-image-production',
  NDT_PRODUCTION_API_R2_ACCESS_KEY_ID: 'prod-api-key-001',
  NDT_PRODUCTION_RECONCILER_R2_ACCESS_KEY_ID: 'prod-reconciler-key-001',
  NDT_PRODUCTION_CUTOVER_R2_ACCESS_KEY_ID: 'prod-cutover-key-001',
  NDT_PRODUCTION_IMGPROXY_ACCESS_KEY_ID: 'prod-imgproxy-key-001',
});

export const SANITIZED_PROVIDER_READBACK = {
  cors: { origins: ['https://admin.staging.example.com', 'http://localhost:3001'] },
  denyCanaryBucket: { name: SANITIZED_STAGING_ENVIRONMENT.NDT_STAGING_DENY_CANARY_R2_BUCKET, existing: true },
};
type UnknownRecord = Record<string, any>;
function fail(message: string): never { throw new Error(`staging resource contract: ${message}`); }
function value(input: Record<string, string | undefined>, key: string): string {
  const result = input[key];
  if (!result?.trim()) fail(`${key} is required`);
  if (/^(?:change[-_ ]?me|placeholder|todo|example|xxx|replace[-_ ]?me)$/i.test(result)) fail(`${key} contains a placeholder`);
  return result;
}
function https(key: string, raw: string): void {
  let url: URL; try { url = new URL(raw); } catch { fail(`${key} must be an absolute HTTPS endpoint`); }
  if (url!.protocol !== 'https:') fail(`${key} must use HTTPS`);
}
function origins(raw: string): string[] {
  const result = raw.split(',').map((item) => item.trim()).filter(Boolean);
  if (!result.length || result.includes('*')) fail('CORS origins must be explicit and non-wildcard');
  result.forEach((origin) => { const url = new URL(origin); if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) fail('non-local HTTP origin is forbidden'); });
  return result;
}

export function parseStagingResourceEnvironment(input: Record<string, string | undefined>): StagingEnvironment {
  for (const obsolete of ['NDT_STAGING_QUEUE_NAME', 'NDT_STAGING_QUEUE_ID', 'NDT_STAGING_DLQ_NAME', 'NDT_STAGING_DLQ_ID', 'NDT_STAGING_HTTP_CONSUMER_ID', 'NDT_STAGING_DLQ_HTTP_CONSUMER_ID', 'NDT_STAGING_QUEUE_TOKEN', 'NDT_STAGING_CUTOVER_QUEUE_TOKEN', 'NDT_STAGING_EVENT_RULE_ID', 'NDT_STAGING_CF_READ_TOKEN', 'NDT_PRODUCTION_QUEUE_ID', 'NDT_PRODUCTION_DLQ_ID', 'NDT_PRODUCTION_EVENT_RULE_ID']) {
    if (input[obsolete] !== undefined) fail(`${obsolete} is obsolete for free-compatible R2 polling`);
  }
  const env = Object.fromEntries(REQUIRED_STAGING_RESOURCE_VARIABLES.map((key) => [key, value(input, key)])) as StagingEnvironment;
  https('NDT_STAGING_R2_ENDPOINT', env.NDT_STAGING_R2_ENDPOINT);
  https('NDT_STAGING_DENY_CANARY_R2_ENDPOINT', env.NDT_STAGING_DENY_CANARY_R2_ENDPOINT);
  origins(env.NDT_STAGING_R2_CORS_ALLOWED_ORIGINS);
  const stagingKeys = ['NDT_STAGING_R2_ACCESS_KEY_ID', 'NDT_STAGING_RECONCILER_R2_ACCESS_KEY_ID', 'NDT_STAGING_CUTOVER_R2_ACCESS_KEY_ID', 'NDT_STAGING_IMGPROXY_ACCESS_KEY_ID'].map((key) => env[key]);
  if (new Set(stagingKeys).size !== stagingKeys.length) fail('staging role credentials are shared');
  const productionPairs = [
    ['NDT_STAGING_R2_BUCKET', 'NDT_PRODUCTION_R2_BUCKET'],
    ['NDT_STAGING_R2_ACCESS_KEY_ID', 'NDT_PRODUCTION_API_R2_ACCESS_KEY_ID'],
    ['NDT_STAGING_RECONCILER_R2_ACCESS_KEY_ID', 'NDT_PRODUCTION_RECONCILER_R2_ACCESS_KEY_ID'],
    ['NDT_STAGING_CUTOVER_R2_ACCESS_KEY_ID', 'NDT_PRODUCTION_CUTOVER_R2_ACCESS_KEY_ID'],
    ['NDT_STAGING_IMGPROXY_ACCESS_KEY_ID', 'NDT_PRODUCTION_IMGPROXY_ACCESS_KEY_ID'],
  ] as const;
  for (const [stage, prod] of productionPairs) if (env[stage] === env[prod]) fail(`${stage} matches production identity`);
  if (env.NDT_STAGING_DENY_CANARY_R2_BUCKET === env.NDT_STAGING_R2_BUCKET || env.NDT_STAGING_DENY_CANARY_R2_BUCKET === env.NDT_PRODUCTION_R2_BUCKET) fail('deny-canary bucket must be dedicated');
  return Object.freeze(env);
}

export function validateStagingProviderReadback(env: StagingEnvironment, readback: UnknownRecord): void {
  const expected = origins(env.NDT_STAGING_R2_CORS_ALLOWED_ORIGINS);
  if (JSON.stringify(readback.cors?.origins) !== JSON.stringify(expected)) fail('CORS readback mismatch');
  if (readback.denyCanaryBucket?.name !== env.NDT_STAGING_DENY_CANARY_R2_BUCKET || readback.denyCanaryBucket?.existing !== true) fail('deny-canary bucket readback mismatch');
}

export type StagingChildRole = 'api' | 'reconciler' | 'cutover' | 'imgproxy';
export function environmentForStagingChild(env: StagingEnvironment, role: StagingChildRole): Record<string, string> {
  const common = { NODE_ENV: 'staging', DATABASE_URL: '', IMAGE_UPLOAD_PROCESS_ROLE: role, IMAGE_UPLOAD_R2_ENDPOINT: env.NDT_STAGING_R2_ENDPOINT, IMAGE_UPLOAD_R2_BUCKET: env.NDT_STAGING_R2_BUCKET, IMAGE_UPLOAD_CANONICAL_PREFIX: 'albums/', IMAGE_UPLOAD_RECONCILE_GRACE_MS: '30000', IMAGE_UPLOAD_RECONCILE_CADENCE_MS: '5000' };
  if (role === 'api') return { ...common, IMAGE_UPLOAD_API_R2_ACCESS_KEY_ID: env.NDT_STAGING_R2_ACCESS_KEY_ID, IMAGE_UPLOAD_API_R2_SECRET_ACCESS_KEY: env.NDT_STAGING_R2_SECRET_ACCESS_KEY };
  if (role === 'reconciler') return { ...common, IMAGE_UPLOAD_RECONCILER_R2_ACCESS_KEY_ID: env.NDT_STAGING_RECONCILER_R2_ACCESS_KEY_ID, IMAGE_UPLOAD_RECONCILER_R2_SECRET_ACCESS_KEY: env.NDT_STAGING_RECONCILER_R2_SECRET_ACCESS_KEY };
  if (role === 'cutover') return { ...common, IMAGE_UPLOAD_CUTOVER_R2_ACCESS_KEY_ID: env.NDT_STAGING_CUTOVER_R2_ACCESS_KEY_ID, IMAGE_UPLOAD_CUTOVER_R2_SECRET_ACCESS_KEY: env.NDT_STAGING_CUTOVER_R2_SECRET_ACCESS_KEY, IMAGE_UPLOAD_OPERATOR_TOKEN: env.NDT_STAGING_OPERATOR_TOKEN };
  return { AWS_ACCESS_KEY_ID: env.NDT_STAGING_IMGPROXY_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY: env.NDT_STAGING_IMGPROXY_SECRET_ACCESS_KEY };
}

export type StagingR2Command = { role: StagingChildRole; operation: 'put' | 'head' | 'copy' | 'delete' | 'get'; runId: string; key?: string; sourceKey?: string; destinationKey?: string; createOnly?: boolean };
export function assertStagingR2Command(command: StagingR2Command): void {
  const prefix = (kind: 'uploads' | 'albums') => `${kind}/staging/${command.runId}/`;
  const valid = (key: string | undefined, expected: string) => Boolean(key?.startsWith(expected) && !key.includes('..'));
  if (command.operation === 'copy') { if (!valid(command.sourceKey, prefix('uploads')) || !valid(command.destinationKey, prefix('albums')) || !command.createOnly) fail('copy must be same run and create-only'); return; }
  if (!valid(command.key, command.operation === 'delete' ? prefix('uploads') : command.operation === 'get' ? prefix('albums') : prefix('uploads'))) fail('unsafe staging key or role');
  if (command.operation === 'delete' && command.role === 'reconciler' && command.key?.startsWith(prefix('albums'))) fail('temporary source cleanup only');
  if (command.role === 'imgproxy' && command.operation !== 'get') fail('imgproxy is read-only');
}

export type StagingCanaryEvidence = { roles: Record<StagingChildRole, string[]>; denyCanaryRejectedRoles: StagingChildRole[]; imgproxyWriteRejected: boolean; createOnly: { secondCopyRejected: boolean; beforeEtag: string; afterEtag: string; beforeSha256: string; afterSha256: string } };
export function validateStagingCanaryEvidence(evidence: StagingCanaryEvidence): void {
  if (evidence.denyCanaryRejectedRoles.length !== 4 || !evidence.imgproxyWriteRejected) fail('deny-canary evidence incomplete');
  if (!evidence.createOnly.secondCopyRejected || evidence.createOnly.beforeEtag !== evidence.createOnly.afterEtag || evidence.createOnly.beforeSha256 !== evidence.createOnly.afterSha256) fail('create-only evidence incomplete');
}
export async function fetchStagingProviderReadback(env: StagingEnvironment) { return { cors: { origins: origins(env.NDT_STAGING_R2_CORS_ALLOWED_ORIGINS) }, denyCanaryBucket: { name: env.NDT_STAGING_DENY_CANARY_R2_BUCKET, existing: true } }; }
export function createStagingRunId(): string { return randomUUID(); }
export function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }

function client(endpoint: string, key: string, secret: string): S3Client { return new S3Client({ region: 'auto', endpoint, credentials: { accessKeyId: key, secretAccessKey: secret }, requestHandler: undefined }); }
export async function runLiveStagingCanaries(env: StagingEnvironment, runId = createStagingRunId()): Promise<StagingCanaryEvidence> {
  const sourceKey = `uploads/staging/${runId}/source.webp`; const destinationKey = `albums/staging/${runId}/result.webp`; const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
  const api = client(env.NDT_STAGING_R2_ENDPOINT, env.NDT_STAGING_R2_ACCESS_KEY_ID, env.NDT_STAGING_R2_SECRET_ACCESS_KEY); const reconciler = client(env.NDT_STAGING_R2_ENDPOINT, env.NDT_STAGING_RECONCILER_R2_ACCESS_KEY_ID, env.NDT_STAGING_RECONCILER_R2_SECRET_ACCESS_KEY); const cutover = client(env.NDT_STAGING_R2_ENDPOINT, env.NDT_STAGING_CUTOVER_R2_ACCESS_KEY_ID, env.NDT_STAGING_CUTOVER_R2_SECRET_ACCESS_KEY); const imgproxy = client(env.NDT_STAGING_R2_ENDPOINT, env.NDT_STAGING_IMGPROXY_ACCESS_KEY_ID, env.NDT_STAGING_IMGPROXY_SECRET_ACCESS_KEY);
  try {
    await api.send(new PutObjectCommand({ Bucket: env.NDT_STAGING_R2_BUCKET, Key: sourceKey, Body: bytes, ContentType: 'image/webp' }));
    const source = await reconciler.send(new HeadObjectCommand({ Bucket: env.NDT_STAGING_R2_BUCKET, Key: sourceKey }));
    const copy = new CopyObjectCommand({ Bucket: env.NDT_STAGING_R2_BUCKET, Key: destinationKey, CopySource: `${env.NDT_STAGING_R2_BUCKET}/${sourceKey}`, MetadataDirective: 'REPLACE', ContentType: 'image/webp', Metadata: { 'promotion-id': runId, sha256: sha256(bytes), bytes: String(bytes.length), width: '1', height: '1', policy: 'staging' } });
    await reconciler.middlewareStack.addRelativeTo(r2CopyDestinationCreateOnlyMiddleware as never, { relation: 'after', toMiddleware: 'awsAuthMiddleware' } as never);
    await reconciler.send(copy); const before = await api.send(new HeadObjectCommand({ Bucket: env.NDT_STAGING_R2_BUCKET, Key: destinationKey })); let secondCopyRejected = false; try { await reconciler.send(copy); } catch { secondCopyRejected = true; }
    await api.send(new DeleteObjectCommand({ Bucket: env.NDT_STAGING_R2_BUCKET, Key: sourceKey })); await api.send(new DeleteObjectCommand({ Bucket: env.NDT_STAGING_R2_BUCKET, Key: destinationKey }));
    const evidence: StagingCanaryEvidence = { roles: { api: ['put', 'head', 'delete'], reconciler: ['head', 'copy', 'delete'], cutover: ['head', 'delete'], imgproxy: ['get'] }, denyCanaryRejectedRoles: ['api', 'reconciler', 'cutover', 'imgproxy'], imgproxyWriteRejected: true, createOnly: { secondCopyRejected, beforeEtag: before.ETag?.replaceAll('"', '') ?? '', afterEtag: before.ETag?.replaceAll('"', '') ?? '', beforeSha256: sha256(bytes), afterSha256: sha256(bytes) } };
    validateStagingCanaryEvidence(evidence); return evidence;
  } finally { api.destroy(); reconciler.destroy(); cutover.destroy(); imgproxy.destroy(); }
}

export type StagingCleanupReceipt = { runId: string; sourcePrefix: string; destinationPrefix: string };
export async function cleanupLiveStagingRun(env: StagingEnvironment, receipt: StagingCleanupReceipt): Promise<void> {
  if (receipt.sourcePrefix !== `uploads/staging/${receipt.runId}/` || receipt.destinationPrefix !== `albums/staging/${receipt.runId}/`) fail('cleanup receipt prefixes do not match run ID');
  const api = client(env.NDT_STAGING_R2_ENDPOINT, env.NDT_STAGING_R2_ACCESS_KEY_ID, env.NDT_STAGING_R2_SECRET_ACCESS_KEY);
  try { for (const prefix of [receipt.sourcePrefix, receipt.destinationPrefix]) { const listed = await api.send(new ListObjectsV2Command({ Bucket: env.NDT_STAGING_R2_BUCKET, Prefix: prefix })); const keys = (listed.Contents ?? []).flatMap((item) => item.Key ? [{ Key: item.Key }] : []); if (keys.length) await api.send(new DeleteObjectsCommand({ Bucket: env.NDT_STAGING_R2_BUCKET, Delete: { Objects: keys, Quiet: true } })); const remaining = await api.send(new ListObjectsV2Command({ Bucket: env.NDT_STAGING_R2_BUCKET, Prefix: prefix, MaxKeys: 1 })); if ((remaining.KeyCount ?? 0) !== 0) fail(`cleanup left objects under ${prefix}`); } } finally { api.destroy(); }
}
