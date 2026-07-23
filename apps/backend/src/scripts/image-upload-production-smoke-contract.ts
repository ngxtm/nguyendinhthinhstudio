import { createHash, randomUUID } from 'node:crypto';
import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
} from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

export const PRODUCTION_SMOKE_CHECKS = [
  'browserUpload',
  'absoluteExpiryRetry',
  'allowedCorsPut',
  'deniedCorsPut',
  'responseFirstSettlement',
  'copyResponseLossHeadSettlement',
  'unchangedDestinationRetry',
  'conflictFailClosed',
  'committedDeletion',
  'failedPromotionCleanup',
  'temporaryCleanupAfterExpiry',
  'imgproxyRendering',
] as const;

export type ProductionSmokeCheck = (typeof PRODUCTION_SMOKE_CHECKS)[number];

export type ReleaseTuple = Readonly<{
  imageReference: string;
  imageDigest: string;
  commitSha: string;
  releaseFingerprint: string;
}>;

export type SmokeOwnedResource = Readonly<{
  kind: 'upload' | 'promotion' | 'conflict' | 'image' | 'deletion' | 'object';
  id: string;
  objectKey?: string;
  objectKeySha256?: string;
}>;

export type ProductionSmokeJournalDraft = Readonly<{
  runId: string;
  release: ReleaseTuple;
  adminIdSha256: string;
  lifecycle:
    | 'authorized'
    | 'running'
    | 'checks-passed'
    | 'cleaning'
    | 'complete'
    | 'failed';
  completedChecks: readonly ProductionSmokeCheck[];
  resources: readonly SmokeOwnedResource[];
  cleanupStatus: 'pending' | 'running' | 'complete' | 'failed';
  updatedAt: string;
}>;

export type ProductionSmokeJournal = ProductionSmokeJournalDraft &
  Readonly<{
    schemaVersion: 'image-upload-operator-smoke-journal/v1';
    canonicalSha256: string;
  }>;

export type OperatorSmokeReceipt = Readonly<{
  schemaVersion: 'image-upload-operator-smoke-receipt/v1-polling';
  receiptId: string;
  receiptPathSha256: string;
  createdAt: string;
  release: ReleaseTuple;
  authorizationPathSha256: string;
  authorizationSha256: string;
  checks: Readonly<Record<ProductionSmokeCheck, true>>;
  canonicalSha256: string;
}>;

type Environment = Readonly<Record<string, string | undefined>>;

export type ProductionSmokeEnvironment = Readonly<{
  apiBaseUrl: string;
  imgproxyBaseUrl: string;
  r2Endpoint: string;
  r2Bucket: string;
  release: ReleaseTuple;
  paths: Readonly<{
    phase1Receipt: string;
    phase1Approval: string;
    authorization: string;
    journal: string;
    receipt: string;
  }>;
  secrets: Readonly<{
    adminBearerToken: string;
    smokeToken: string;
    operatorToken: string;
    databaseUrl: string;
    r2AccessKeyId: string;
    r2SecretAccessKey: string;
  }>;
  sanitized: Readonly<{
    apiOrigin: string;
    imgproxyOrigin: string;
    r2Origin: string;
    r2Bucket: string;
    release: ReleaseTuple;
    evidencePathSha256: Readonly<Record<string, string>>;
  }>;
}>;

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable(record[key])}`)
    .join(',')}}`;
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  name: string,
): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    const sensitive = unknown.some((key) =>
      /token|secret|password|credential|authorization|bearer/i.test(key),
    );
    throw new Error(
      `${name} contains ${sensitive ? 'sensitive' : 'unknown'} fields`,
    );
  }
}

function assertRelease(value: unknown, name: string): ReleaseTuple {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  const release = value as Record<string, unknown>;
  assertExactKeys(
    release,
    ['imageReference', 'imageDigest', 'commitSha', 'releaseFingerprint'],
    name,
  );
  if (
    typeof release.imageReference !== 'string' ||
    release.imageReference.length < 1 ||
    release.imageReference.length > 255 ||
    typeof release.imageDigest !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(release.imageDigest) ||
    typeof release.commitSha !== 'string' ||
    !/^[a-f0-9]{40}$/.test(release.commitSha) ||
    typeof release.releaseFingerprint !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(release.releaseFingerprint)
  ) {
    throw new Error(`${name} is invalid`);
  }
  return release as ReleaseTuple;
}

export function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalSha256(value: object): string {
  const body = { ...(value as Record<string, unknown>) };
  delete body.canonicalSha256;
  return sha256(Buffer.from(stable(body)));
}

function required(env: Environment, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === '') {
    throw new TypeError(`${name} is required`);
  }
  return value;
}

function httpsOrigin(env: Environment, name: string): string {
  const raw = required(env, name);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new TypeError(`${name} must be a valid URL`);
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== '/' && parsed.pathname !== '')
  ) {
    throw new TypeError(`${name} must be an HTTPS origin`);
  }
  return parsed.origin;
}

function sha256Digest(env: Environment, name: string): string {
  const value = required(env, name);
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new TypeError(`${name} must be an immutable sha256 digest`);
  }
  return value;
}

function commitSha(env: Environment, name: string): string {
  const value = required(env, name);
  if (!/^[a-f0-9]{40}$/.test(value)) {
    throw new TypeError(`${name} must be a lowercase 40-character commit`);
  }
  return value;
}

function strongSecret(env: Environment, name: string): string {
  const value = required(env, name);
  const bytes = Buffer.byteLength(value, 'utf8');
  if (bytes < 32 || bytes > 4096) {
    throw new TypeError(`${name} must contain between 32 and 4096 UTF-8 bytes`);
  }
  return value;
}

function absoluteOutsideRepository(
  env: Environment,
  name: string,
  repositoryRoot: string,
): string {
  const raw = required(env, name);
  if (!isAbsolute(raw)) throw new TypeError(`${name} must be absolute`);
  const absolute = resolve(raw);
  const relation = relative(resolve(repositoryRoot), absolute);
  if (
    relation === '' ||
    (!relation.startsWith('..') && !isAbsolute(relation))
  ) {
    throw new TypeError(`${name} must be outside the repository`);
  }
  return absolute;
}

function assertDistinctPaths(paths: Readonly<Record<string, string>>): void {
  const normalized = Object.values(paths).map((path) =>
    process.platform === 'win32' ? path.toLowerCase() : path,
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError('production smoke evidence paths must be distinct');
  }
}

export function parseProductionSmokeEnvironment(
  env: Environment,
  repositoryRoot: string,
): ProductionSmokeEnvironment {
  const apiBaseUrl = httpsOrigin(env, 'NDT_PRODUCTION_SMOKE_API_BASE_URL');
  const imgproxyBaseUrl = httpsOrigin(
    env,
    'NDT_PRODUCTION_SMOKE_IMGPROXY_BASE_URL',
  );
  const r2Endpoint = httpsOrigin(env, 'IMAGE_UPLOAD_R2_ENDPOINT');
  const r2Bucket = required(env, 'IMAGE_UPLOAD_R2_BUCKET');
  const release = Object.freeze({
    imageReference: required(env, 'NDT_PRODUCTION_SMOKE_IMAGE_REFERENCE'),
    imageDigest: sha256Digest(env, 'NDT_PRODUCTION_SMOKE_IMAGE_DIGEST'),
    commitSha: commitSha(env, 'IMAGE_UPLOAD_RELEASE_COMMIT'),
    releaseFingerprint: sha256Digest(env, 'IMAGE_UPLOAD_BUILD_FINGERPRINT'),
  });
  const paths = Object.freeze({
    phase1Receipt: absoluteOutsideRepository(
      env,
      'NDT_PRODUCTION_SMOKE_PHASE1_RECEIPT',
      repositoryRoot,
    ),
    phase1Approval: absoluteOutsideRepository(
      env,
      'NDT_PRODUCTION_SMOKE_PHASE1_APPROVAL',
      repositoryRoot,
    ),
    authorization: absoluteOutsideRepository(
      env,
      'NDT_PRODUCTION_SMOKE_AUTHORIZATION',
      repositoryRoot,
    ),
    journal: absoluteOutsideRepository(
      env,
      'NDT_PRODUCTION_SMOKE_JOURNAL',
      repositoryRoot,
    ),
    receipt: absoluteOutsideRepository(
      env,
      'NDT_PRODUCTION_SMOKE_RECEIPT',
      repositoryRoot,
    ),
  });
  assertDistinctPaths(paths);
  const secrets = Object.freeze({
    adminBearerToken: required(env, 'NDT_PRODUCTION_SMOKE_ADMIN_BEARER_TOKEN'),
    smokeToken: strongSecret(env, 'NDT_PRODUCTION_SMOKE_TOKEN'),
    operatorToken: required(env, 'NDT_PRODUCTION_SMOKE_OPERATOR_TOKEN'),
    databaseUrl: required(env, 'DATABASE_URL'),
    r2AccessKeyId: required(env, 'IMAGE_UPLOAD_CUTOVER_R2_ACCESS_KEY_ID'),
    r2SecretAccessKey: required(
      env,
      'IMAGE_UPLOAD_CUTOVER_R2_SECRET_ACCESS_KEY',
    ),
  });
  const evidencePathSha256 = Object.fromEntries(
    Object.entries(paths).map(([name, path]) => [
      name,
      sha256(Buffer.from(path)),
    ]),
  );
  return Object.freeze({
    apiBaseUrl,
    imgproxyBaseUrl,
    r2Endpoint,
    r2Bucket,
    release,
    paths,
    secrets,
    sanitized: Object.freeze({
      apiOrigin: apiBaseUrl,
      imgproxyOrigin: imgproxyBaseUrl,
      r2Origin: r2Endpoint,
      r2Bucket,
      release,
      evidencePathSha256: Object.freeze(evidencePathSha256),
    }),
  });
}

async function assertProtectedMode(path: string): Promise<void> {
  if (process.platform === 'win32') return;
  const details = await stat(path);
  if ((details.mode & 0o777) !== 0o600) {
    throw new Error(`${path} must have mode 600`);
  }
}

export async function readProtectedJson(
  path: string,
): Promise<Record<string, unknown>> {
  await assertProtectedMode(path);
  const bytes = await readFile(path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error(`${path} must contain valid JSON`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${path} must contain a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function assertJournalDraft(
  value: Record<string, unknown>,
): ProductionSmokeJournalDraft {
  assertExactKeys(
    value,
    [
      'runId',
      'release',
      'adminIdSha256',
      'lifecycle',
      'completedChecks',
      'resources',
      'cleanupStatus',
      'updatedAt',
    ],
    'journal',
  );
  if (
    typeof value.runId !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      value.runId,
    ) ||
    typeof value.adminIdSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.adminIdSha256) ||
    typeof value.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.updatedAt))
  ) {
    throw new Error('journal identifiers or timestamp are invalid');
  }
  assertRelease(value.release, 'journal release');
  if (
    ![
      'authorized',
      'running',
      'checks-passed',
      'cleaning',
      'complete',
      'failed',
    ].includes(String(value.lifecycle)) ||
    !['pending', 'running', 'complete', 'failed'].includes(
      String(value.cleanupStatus),
    )
  ) {
    throw new Error('journal lifecycle is invalid');
  }
  if (!Array.isArray(value.completedChecks)) {
    throw new Error('journal completedChecks must be an array');
  }
  const checks = value.completedChecks as unknown[];
  if (
    new Set(checks).size !== checks.length ||
    checks.some(
      (check) =>
        typeof check !== 'string' ||
        !PRODUCTION_SMOKE_CHECKS.includes(check as ProductionSmokeCheck),
    )
  ) {
    throw new Error('journal completedChecks are invalid');
  }
  if (!Array.isArray(value.resources)) {
    throw new Error('journal resources must be an array');
  }
  const kinds = new Set([
    'upload',
    'promotion',
    'conflict',
    'image',
    'deletion',
    'object',
  ]);
  for (const item of value.resources) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('journal resource must be an object');
    }
    const resource = item as Record<string, unknown>;
    assertExactKeys(
      resource,
      ['kind', 'id', 'objectKey', 'objectKeySha256'],
      'journal resource',
    );
    if (
      typeof resource.kind !== 'string' ||
      !kinds.has(resource.kind) ||
      typeof resource.id !== 'string' ||
      resource.id.length < 1 ||
      resource.id.length > 255
    ) {
      throw new Error('journal resource is invalid');
    }
    if (resource.objectKey !== undefined) {
      if (
        typeof resource.objectKey !== 'string' ||
        resource.objectKey.length < 1 ||
        resource.objectKey.length > 1024 ||
        resource.objectKey.includes('..') ||
        (!resource.objectKey.startsWith('uploads/') &&
          !resource.objectKey.startsWith('albums/'))
      ) {
        throw new Error('journal resource objectKey is invalid');
      }
    }
    if (
      resource.objectKeySha256 !== undefined &&
      (typeof resource.objectKeySha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(resource.objectKeySha256))
    ) {
      throw new Error('journal resource objectKeySha256 is invalid');
    }
  }
  return value as ProductionSmokeJournalDraft;
}

function assertJournal(value: Record<string, unknown>): ProductionSmokeJournal {
  assertExactKeys(
    value,
    [
      'schemaVersion',
      'runId',
      'release',
      'adminIdSha256',
      'lifecycle',
      'completedChecks',
      'resources',
      'cleanupStatus',
      'updatedAt',
      'canonicalSha256',
    ],
    'journal',
  );
  if (value.schemaVersion !== 'image-upload-operator-smoke-journal/v1') {
    throw new Error('journal schemaVersion is invalid');
  }
  if (value.canonicalSha256 !== canonicalSha256(value)) {
    throw new Error('journal canonicalSha256 is invalid');
  }
  const draft = { ...value };
  delete draft.schemaVersion;
  delete draft.canonicalSha256;
  assertJournalDraft(draft);
  return value as ProductionSmokeJournal;
}

async function writeExclusive(path: string, value: object): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
  } finally {
    await handle.close();
  }
  if (process.platform !== 'win32') await chmod(path, 0o600);
}

function journalDocument(
  draft: ProductionSmokeJournalDraft,
): ProductionSmokeJournal {
  const normalized = { ...(draft as Record<string, unknown>) };
  delete normalized.schemaVersion;
  delete normalized.canonicalSha256;
  assertJournalDraft(normalized);
  const body = {
    schemaVersion: 'image-upload-operator-smoke-journal/v1' as const,
    ...(normalized as ProductionSmokeJournalDraft),
  };
  return Object.freeze({ ...body, canonicalSha256: canonicalSha256(body) });
}

export async function createSmokeJournal(
  path: string,
  draft: ProductionSmokeJournalDraft,
): Promise<ProductionSmokeJournal> {
  const document = journalDocument(draft);
  await writeExclusive(path, document);
  return document;
}

export async function readSmokeJournal(
  path: string,
): Promise<ProductionSmokeJournal> {
  return assertJournal(await readProtectedJson(path));
}

export async function updateSmokeJournal(
  path: string,
  draft: ProductionSmokeJournalDraft | ProductionSmokeJournal,
): Promise<ProductionSmokeJournal> {
  const current = await readSmokeJournal(path);
  if (
    current.runId !== draft.runId ||
    current.adminIdSha256 !== draft.adminIdSha256 ||
    stable(current.release) !== stable(draft.release)
  ) {
    throw new Error('journal immutable binding changed');
  }
  const document = journalDocument(draft);
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeExclusive(temporary, document);
    await rename(temporary, path);
    if (process.platform !== 'win32') await chmod(path, 0o600);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  return document;
}

function assertUuid(value: string, name: string): void {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      value,
    )
  ) {
    throw new Error(`${name} must be a UUID`);
  }
}

export async function writeSmokeReceipt(options: {
  path: string;
  authorizationPath: string;
  journal: ProductionSmokeJournal;
  receiptId: string;
  createdAt: string;
}): Promise<OperatorSmokeReceipt> {
  const completed = new Set(options.journal.completedChecks);
  if (
    options.journal.lifecycle !== 'complete' ||
    options.journal.cleanupStatus !== 'complete' ||
    completed.size !== PRODUCTION_SMOKE_CHECKS.length ||
    PRODUCTION_SMOKE_CHECKS.some((check) => !completed.has(check))
  ) {
    throw new Error('all smoke checks and cleanup must pass before receipt');
  }
  assertUuid(options.receiptId, 'receiptId');
  if (!Number.isFinite(Date.parse(options.createdAt))) {
    throw new Error('createdAt must be an RFC 3339 timestamp');
  }
  const authorizationBytes = await readFile(options.authorizationPath);
  const authorization = await readProtectedJson(options.authorizationPath);
  assertExactKeys(
    authorization,
    [
      'schemaVersion',
      'release',
      'operatorFingerprintSha256',
      'approvedAt',
      'decision',
      'canonicalSha256',
    ],
    'smoke authorization',
  );
  assertRelease(authorization.release, 'smoke authorization release');
  if (
    authorization.schemaVersion !==
      'image-upload-operator-smoke-authorization/v1' ||
    authorization.decision !== 'approved' ||
    authorization.canonicalSha256 !== canonicalSha256(authorization) ||
    stable(authorization.release) !== stable(options.journal.release) ||
    typeof authorization.operatorFingerprintSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(authorization.operatorFingerprintSha256)
  ) {
    throw new Error('smoke authorization is invalid or release-drifted');
  }
  const approvedAt = Date.parse(String(authorization.approvedAt));
  if (
    !Number.isFinite(approvedAt) ||
    Date.parse(options.createdAt) < approvedAt
  ) {
    throw new Error('smoke receipt predates authorization');
  }
  const checks = Object.freeze(
    Object.fromEntries(PRODUCTION_SMOKE_CHECKS.map((check) => [check, true])),
  ) as Readonly<Record<ProductionSmokeCheck, true>>;
  const body = {
    schemaVersion: 'image-upload-operator-smoke-receipt/v1-polling' as const,
    receiptId: options.receiptId,
    receiptPathSha256: sha256(Buffer.from(resolve(options.path))),
    createdAt: options.createdAt,
    release: options.journal.release,
    authorizationPathSha256: sha256(
      Buffer.from(resolve(options.authorizationPath)),
    ),
    authorizationSha256: sha256(authorizationBytes),
    checks,
  };
  const receipt = Object.freeze({
    ...body,
    canonicalSha256: canonicalSha256(body),
  });
  await writeExclusive(options.path, receipt);
  return receipt;
}
