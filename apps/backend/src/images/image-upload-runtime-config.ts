import { isIP } from 'node:net';
import {
  type ImageUploadIngressMode,
  type ImageUploadIngressRuntime,
  parseImageUploadIngress,
} from './image-upload-ingress';

export type ImageUploadProcessRole = 'api' | 'reconciler';

type Environment = Readonly<Record<string, string | undefined>>;

type RuntimeFingerprint = Readonly<{
  role: ImageUploadProcessRole;
  processCount: number;
  decodePermitsPerProcess: number;
  r2ControlTimeoutSeconds: number;
  r2ReadTimeoutSeconds: number;
  presignEnabled: boolean;
  ingressMode: ImageUploadIngressMode;
  operatorSmokeTokenSha256?: string;
  presignClockSkewSeconds: number;
  rateLimitCleanupBatch: number;
  reconcileGraceMs?: number;
  reconcileCadenceMs?: number;
  r2Bucket: string;
  canonicalPrefix: string;
  trustedProxyCount?: number;
}>;

export type ImageUploadRuntimeConfig = Readonly<{
  processRole: ImageUploadProcessRole;
  databaseUrl: string;
  processCount: number;
  decodePermitsPerProcess: number;
  r2ControlTimeoutSeconds: number;
  r2ReadTimeoutSeconds: number;
  presignEnabled: boolean;
  ingress: ImageUploadIngressRuntime;
  presignClockSkewSeconds: number;
  rateLimitCleanupBatch: number;
  reconcileGraceMs: number;
  reconcileCadenceMs: number;
  r2Endpoint: string;
  r2Bucket: string;
  canonicalPrefix: string;
  trustedProxyAllowlist: readonly string[];
  values: Readonly<Record<string, string>>;
  fingerprint: RuntimeFingerprint;
}>;

const roles = new Set<ImageUploadProcessRole>(['api', 'reconciler']);

const commonRequired = [
  'DATABASE_URL',
  'IMAGE_UPLOAD_PROCESS_COUNT',
  'IMAGE_UPLOAD_DECODE_PERMITS_PER_PROCESS',
  'IMAGE_UPLOAD_R2_CONTROL_TIMEOUT_SECONDS',
  'IMAGE_UPLOAD_R2_READ_TIMEOUT_SECONDS',
  'IMAGE_UPLOAD_PRESIGN_ENABLED',
  'IMAGE_UPLOAD_PRESIGN_CLOCK_SKEW_SECONDS',
  'IMAGE_UPLOAD_RATE_LIMIT_CLEANUP_BATCH',
  'IMAGE_UPLOAD_R2_ENDPOINT',
  'IMAGE_UPLOAD_R2_BUCKET',
  'IMAGE_UPLOAD_CANONICAL_PREFIX',
] as const;

const roleRequired = {
  api: [
    'IMAGE_UPLOAD_API_R2_ACCESS_KEY_ID',
    'IMAGE_UPLOAD_API_R2_SECRET_ACCESS_KEY',
    'IMGPROXY_BASE_URL',
    'IMGPROXY_KEY',
    'IMGPROXY_SALT',
    'IMAGE_UPLOAD_TRUSTED_PROXY_ALLOWLIST',
  ],
  reconciler: [
    'IMAGE_UPLOAD_RECONCILER_R2_ACCESS_KEY_ID',
    'IMAGE_UPLOAD_RECONCILER_R2_SECRET_ACCESS_KEY',
    'IMAGE_UPLOAD_RECONCILE_GRACE_MS',
    'IMAGE_UPLOAD_RECONCILE_CADENCE_MS',
  ],
} as const satisfies Record<ImageUploadProcessRole, readonly string[]>;

const obsoleteVariables = [
  'IMAGE_UPLOAD_QUEUE_ID',
  'IMAGE_UPLOAD_DLQ_ID',
  'IMAGE_UPLOAD_SOURCE_CONSUMER_ID',
  'IMAGE_UPLOAD_DLQ_CONSUMER_ID',
  'IMAGE_UPLOAD_QUEUE_TOKEN',
  'NDT_STAGING_QUEUE_TOKEN',
  'NDT_STAGING_EVENT_RULE_ID',
  'NDT_PRODUCTION_EVENT_RULE_ID',
] as const;

const roleForbidden = {
  api: [
    'IMAGE_UPLOAD_QUEUE_TOKEN',
    'IMAGE_UPLOAD_RECONCILER_R2_ACCESS_KEY_ID',
    'IMAGE_UPLOAD_RECONCILER_R2_SECRET_ACCESS_KEY',
  ],
  reconciler: [
    'IMAGE_UPLOAD_API_R2_ACCESS_KEY_ID',
    'IMAGE_UPLOAD_API_R2_SECRET_ACCESS_KEY',
    'IMGPROXY_BASE_URL',
    'IMGPROXY_KEY',
    'IMGPROXY_SALT',
    'IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN',
  ],
} as const satisfies Record<ImageUploadProcessRole, readonly string[]>;

function required(env: Environment, key: string): string {
  const value = env[key];
  if (value === undefined || value.trim() === '') {
    throw new TypeError(`${key} is required`);
  }
  return value;
}

function integer(
  env: Environment,
  key: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const raw = required(env, key);
  if (!/^(0|[1-9]\d*)$/.test(raw)) {
    throw new TypeError(`${key} must be an integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${key} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function rejectPlaceholders(key: string, value: string): void {
  if (
    /^(change[-_ ]?me|placeholder|todo|example|xxx|replace[-_ ]?me)$/i.test(
      value.trim(),
    )
  ) {
    throw new TypeError(`${key} contains a placeholder`);
  }
}

function validateEnvironmentBinding(
  env: Environment,
  key: string,
  value: string,
): void {
  const nodeEnvironment = env.NODE_ENV;
  if (
    nodeEnvironment === 'production' &&
    /(?:^|[-_.])(staging|stage|dev|development|local|test)(?:$|[-_.])/i.test(
      value,
    )
  ) {
    throw new TypeError(`${key} contains a cross-environment value`);
  }
  if (
    nodeEnvironment === 'staging' &&
    /(?:^|[-_.])(production|prod)(?:$|[-_.])/i.test(value)
  ) {
    throw new TypeError(`${key} contains a cross-environment value`);
  }
}

function trustedProxyAllowlist(env: Environment): readonly string[] {
  const raw = required(env, 'IMAGE_UPLOAD_TRUSTED_PROXY_ALLOWLIST');
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const invalid = entries.some((entry) => {
    const match = /^(.*?)(?:\/(\d+))?$/.exec(entry);
    if (!match) return true;
    const version = isIP(match[1]);
    if (version === 0) return true;
    if (match[2] === undefined) return false;
    const prefix = Number(match[2]);
    return prefix === 0 || prefix > (version === 4 ? 32 : 128);
  });
  if (entries.length === 0 || invalid) {
    throw new TypeError(
      'IMAGE_UPLOAD_TRUSTED_PROXY_ALLOWLIST must contain explicit trusted proxy addresses',
    );
  }
  return Object.freeze([...new Set(entries)]);
}

function validateRole(
  env: Environment,
  expectedRole?: ImageUploadProcessRole,
): ImageUploadProcessRole {
  const raw = required(env, 'IMAGE_UPLOAD_PROCESS_ROLE');
  if (!roles.has(raw as ImageUploadProcessRole)) {
    throw new TypeError('unknown role in IMAGE_UPLOAD_PROCESS_ROLE');
  }
  const role = raw as ImageUploadProcessRole;
  if (expectedRole !== undefined && role !== expectedRole) {
    throw new TypeError(
      `IMAGE_UPLOAD_PROCESS_ROLE does not match expected role ${expectedRole}`,
    );
  }
  return role;
}

export function parseImageUploadRuntimeConfig(
  env: Environment,
  expectedRole?: ImageUploadProcessRole,
): ImageUploadRuntimeConfig {
  const role = validateRole(env, expectedRole);

  for (const key of obsoleteVariables) {
    if (env[key] !== undefined) {
      throw new TypeError(`${key} is obsolete for free-compatible polling`);
    }
  }

  for (const key of roleForbidden[role]) {
    if (env[key] !== undefined) {
      throw new TypeError(`${key} is forbidden for ${role}`);
    }
  }

  const values: Record<string, string> = {};
  for (const key of [...commonRequired, ...roleRequired[role]]) {
    const value = required(env, key);
    rejectPlaceholders(key, value);
    values[key] = value;
  }

  const processCount = integer(env, 'IMAGE_UPLOAD_PROCESS_COUNT', 1);
  const decodePermitsPerProcess = integer(
    env,
    'IMAGE_UPLOAD_DECODE_PERMITS_PER_PROCESS',
    1,
  );
  if (processCount * decodePermitsPerProcess > 2) {
    throw new TypeError(
      'IMAGE_UPLOAD_PROCESS_COUNT multiplied by IMAGE_UPLOAD_DECODE_PERMITS_PER_PROCESS must be at most 2',
    );
  }
  const r2ControlTimeoutSeconds = integer(
    env,
    'IMAGE_UPLOAD_R2_CONTROL_TIMEOUT_SECONDS',
    1,
    120,
  );
  const r2ReadTimeoutSeconds = integer(
    env,
    'IMAGE_UPLOAD_R2_READ_TIMEOUT_SECONDS',
    1,
    120,
  );
  const ingress = parseImageUploadIngress(env, role);
  const presignEnabled = ingress.presignEnabled;
  const presignClockSkewSeconds = integer(
    env,
    'IMAGE_UPLOAD_PRESIGN_CLOCK_SKEW_SECONDS',
    0,
    300,
  );
  const rateLimitCleanupBatch = integer(
    env,
    'IMAGE_UPLOAD_RATE_LIMIT_CLEANUP_BATCH',
    100,
    10_000,
  );
  const reconcileGraceMs =
    role === 'reconciler'
      ? integer(env, 'IMAGE_UPLOAD_RECONCILE_GRACE_MS', 30_000, 30_000)
      : 30_000;
  const reconcileCadenceMs =
    role === 'reconciler'
      ? integer(env, 'IMAGE_UPLOAD_RECONCILE_CADENCE_MS', 5_000, 5_000)
      : 5_000;

  const environmentBoundKeys = [
    'DATABASE_URL',
    'IMAGE_UPLOAD_R2_ENDPOINT',
    'IMAGE_UPLOAD_R2_BUCKET',
  ];
  for (const key of environmentBoundKeys) {
    if (env[key] !== undefined) {
      validateEnvironmentBinding(env, key, env[key] as string);
    }
  }

  const proxies =
    role === 'api' ? trustedProxyAllowlist(env) : Object.freeze([]);

  const canonicalPrefix = required(env, 'IMAGE_UPLOAD_CANONICAL_PREFIX');
  if (env.NODE_ENV === 'production' && canonicalPrefix !== 'albums/') {
    throw new TypeError(
      'IMAGE_UPLOAD_CANONICAL_PREFIX must be exactly albums/ in production',
    );
  }

  const fingerprint: RuntimeFingerprint = Object.freeze({
    role,
    processCount,
    decodePermitsPerProcess,
    r2ControlTimeoutSeconds,
    r2ReadTimeoutSeconds,
    presignEnabled,
    ingressMode: ingress.mode,
    ...(ingress.smokeTokenSha256
      ? { operatorSmokeTokenSha256: ingress.smokeTokenSha256 }
      : {}),
    presignClockSkewSeconds,
    rateLimitCleanupBatch,
    ...(role === 'reconciler' ? { reconcileGraceMs, reconcileCadenceMs } : {}),
    r2Bucket: values.IMAGE_UPLOAD_R2_BUCKET,
    canonicalPrefix,
    ...(role === 'api' ? { trustedProxyCount: proxies.length } : {}),
  });

  return Object.freeze({
    processRole: role,
    databaseUrl: values.DATABASE_URL,
    processCount,
    decodePermitsPerProcess,
    r2ControlTimeoutSeconds,
    r2ReadTimeoutSeconds,
    presignEnabled,
    ingress,
    presignClockSkewSeconds,
    rateLimitCleanupBatch,
    reconcileGraceMs,
    reconcileCadenceMs,
    r2Endpoint: values.IMAGE_UPLOAD_R2_ENDPOINT,
    r2Bucket: values.IMAGE_UPLOAD_R2_BUCKET,
    canonicalPrefix,
    trustedProxyAllowlist: proxies,
    values: Object.freeze(values),
    fingerprint,
  });
}
