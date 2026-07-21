import {
  chmodSync,
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve, sep, dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import { S3Client } from '@aws-sdk/client-s3';
import { parseImageUploadRuntimeConfig } from '../images/image-upload-runtime-config';
import {
  ImageUploadCutoverService,
  canonicalReceiptSha256,
  type CutoverAuditApproval,
  type CutoverAuditReceipt,
  type CutoverDispositionDecision,
  type CutoverDispositionReceipt,
} from '../images/image-upload-cutover.service';
import {
  PgCutoverRepository,
  R2CutoverObjectStore,
  backupBinding,
  type QuiescedBackupApproval,
  type QuiescedBackupReceipt,
} from '../images/image-upload-cutover.pg';

type AclVerifier = (absolutePath: string, output: boolean) => boolean;

function defaultRepositoryRoot(): string {
  return __dirname.includes(`${sep}src${sep}`)
    ? resolve(__dirname, '../../../..')
    : resolve(__dirname, '../..');
}

function defaultAclVerifier(absolutePath: string, output: boolean): boolean {
  const checkedPath =
    output && !existsSync(absolutePath) ? dirname(absolutePath) : absolutePath;
  const stats = statSync(checkedPath);
  if (process.platform === 'win32')
    return stats.isFile() || stats.isDirectory();
  return (stats.mode & 0o077) === 0;
}

export function assertCutoverEnvironment(env: NodeJS.ProcessEnv) {
  const config = parseImageUploadRuntimeConfig(env, 'cutover');
  if (config.presignEnabled)
    throw new Error('cutover requires presign disabled');
  return config;
}

export function assertProtectedPath(
  path: string,
  repositoryRoot = defaultRepositoryRoot(),
  aclVerifier: AclVerifier = defaultAclVerifier,
  output = !existsSync(path),
): string {
  if (!isAbsolute(path)) {
    throw new Error('cutover evidence path must be absolute');
  }
  const absolute = resolve(path);
  const root = resolve(repositoryRoot);
  const relation = relative(root, absolute);
  if (
    relation === '' ||
    (!relation.startsWith('..') && !isAbsolute(relation))
  ) {
    throw new Error('cutover evidence must be outside the repository');
  }
  if (!aclVerifier(absolute, output)) {
    throw new Error('cutover evidence path is not protected by ACL');
  }
  return absolute;
}

type ParsedCutoverCommand = Readonly<{
  mode: 'audit' | 'disposition' | 'approve' | 'apply';
  values: Readonly<Record<string, string>>;
}>;

const REQUIRED = {
  audit: ['--receipt', '--backup-receipt', '--backup-approval'],
  disposition: [
    '--audit-receipt',
    '--upload-id',
    '--decision',
    '--evidence-receipt',
    '--output',
    '--operator-fingerprint',
  ],
  approve: ['--receipt', '--approval'],
  apply: ['--receipt', '--approval', '--backup-receipt', '--backup-approval'],
} as const;

const OPTIONAL = {
  audit: ['--dispositions'],
  disposition: [],
  approve: ['--operator-fingerprint'],
  apply: ['--dispositions'],
} as const;

const PATH_OPTIONS = new Set([
  '--receipt',
  '--backup-receipt',
  '--backup-approval',
  '--audit-receipt',
  '--evidence-receipt',
  '--output',
  '--approval',
  '--dispositions',
]);

export function parseCutoverCommand(
  args: readonly string[],
): ParsedCutoverCommand {
  const mode = args[0];
  if (!['audit', 'disposition', 'approve', 'apply'].includes(mode ?? '')) {
    throw new Error('invalid cutover mode');
  }
  const typedMode = mode as ParsedCutoverCommand['mode'];
  const allowed = new Set<string>([
    ...REQUIRED[typedMode],
    ...OPTIONAL[typedMode],
  ]);
  const values: Record<string, string> = {};
  for (const argument of args.slice(1)) {
    const separator = argument.indexOf('=');
    if (separator <= 2) throw new Error('cutover options require --name=value');
    const key = argument.slice(0, separator);
    const value = argument.slice(separator + 1);
    if (!allowed.has(key)) throw new Error(`unknown cutover option ${key}`);
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      throw new Error(`duplicate cutover option ${key}`);
    }
    if (!value) throw new Error(`${key} is required`);
    values[key] = value;
  }
  for (const key of REQUIRED[typedMode]) {
    if (!values[key]) throw new Error(`${key} is required`);
  }
  if (
    typedMode === 'disposition' &&
    !['committed_authorized', 'cleanup_authorized'].includes(
      values['--decision'],
    )
  ) {
    throw new Error('--decision is invalid');
  }
  if (
    values['--operator-fingerprint'] !== undefined &&
    !/^[a-f0-9]{64}$/.test(values['--operator-fingerprint'])
  ) {
    throw new Error('--operator-fingerprint must be canonical sha256');
  }
  for (const [key, value] of Object.entries(values)) {
    if (PATH_OPTIONS.has(key)) {
      assertProtectedPath(value);
    }
  }
  const paths = Object.entries(values)
    .filter(([key]) => PATH_OPTIONS.has(key))
    .map(([, value]) => resolve(value));
  if (new Set(paths).size !== paths.length) {
    throw new Error('cutover evidence and approval paths must be distinct');
  }
  return Object.freeze({ mode: typedMode, values: Object.freeze(values) });
}

function digest(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function readJson<T>(path: string): T {
  const raw = readFileSync(path);
  try {
    return JSON.parse(raw.toString('utf8')) as T;
  } catch {
    throw new Error(
      `invalid JSON evidence at pathHash=${digest(resolve(path))}`,
    );
  }
}

function writeExclusiveJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
  if (process.platform !== 'win32') chmodSync(path, 0o600);
}

export class CutoverAuditAmbiguityError extends Error {
  constructor(readonly receiptSha256: string) {
    super('cutover audit has unresolved ambiguous rows');
    this.name = 'CutoverAuditAmbiguityError';
  }
}

export function persistAuditReceipt(
  path: string,
  receipt: {
    canonicalSha256: string;
    summary: { unresolvedAmbiguous: number };
  },
): void {
  writeExclusiveJson(path, receipt);
  if (receipt.summary.unresolvedAmbiguous > 0) {
    throw new CutoverAuditAmbiguityError(receipt.canonicalSha256);
  }
}

export function verifyBackupEvidence(
  receiptPath: string,
  approvalPath: string,
  repositoryRoot = defaultRepositoryRoot(),
  aclVerifier: AclVerifier = defaultAclVerifier,
) {
  const protectedReceipt = assertProtectedPath(
    receiptPath,
    repositoryRoot,
    aclVerifier,
    false,
  );
  const protectedApproval = assertProtectedPath(
    approvalPath,
    repositoryRoot,
    aclVerifier,
    false,
  );
  if (protectedReceipt === protectedApproval) {
    throw new Error('backup receipt and approval must be distinct');
  }
  const receiptBytes = readFileSync(protectedReceipt);
  const approvalBytes = readFileSync(protectedApproval);
  const receipt = readJson<QuiescedBackupReceipt>(protectedReceipt);
  const approval = readJson<QuiescedBackupApproval>(protectedApproval);
  if (
    receipt.schemaVersion !== 'image-upload-quiesced-backup/v1' ||
    canonicalReceiptSha256(receipt) !== receipt.canonicalSha256
  ) {
    throw new Error('backup receipt canonical hash mismatch');
  }
  if (
    approval.schemaVersion !== 'image-upload-quiesced-backup-approval/v1' ||
    canonicalReceiptSha256(approval) !== approval.canonicalSha256
  ) {
    throw new Error('backup approval canonical hash mismatch');
  }
  const protectedBackup = assertProtectedPath(
    receipt.backupPath,
    repositoryRoot,
    aclVerifier,
    false,
  );
  const backupPathSha256 = digest(protectedBackup);
  if (approval.backupApprovalPathSha256 !== digest(protectedApproval)) {
    throw new Error('backup approval path binding mismatch');
  }
  if (
    approval.backupReceiptPathSha256 !== digest(protectedReceipt) ||
    approval.backupReceiptSha256 !== digest(receiptBytes) ||
    approval.backupPathSha256 !== backupPathSha256 ||
    approval.backupSha256 !== receipt.backupSha256
  ) {
    throw new Error('backup digest/path binding mismatch');
  }
  if (digest(readFileSync(protectedBackup)) !== receipt.backupSha256) {
    throw new Error('backup digest does not match authoritative bytes');
  }
  if (
    !Number.isFinite(new Date(receipt.quiescedAt).getTime()) ||
    !Number.isFinite(new Date(approval.approvedAt).getTime()) ||
    new Date(approval.approvedAt) < new Date(receipt.quiescedAt)
  ) {
    throw new Error('backup quiescence/approval time is invalid');
  }
  if (!approval.operatorFingerprint.trim()) {
    throw new Error('backup approval operator fingerprint is required');
  }
  return backupBinding(
    digest(receiptBytes),
    digest(approvalBytes),
    digest(protectedReceipt),
    digest(protectedApproval),
    receipt,
    backupPathSha256,
  );
}

function loadDispositions(
  manifestPath: string | undefined,
): readonly CutoverDispositionReceipt[] {
  if (!manifestPath) return [];
  const paths = readJson<unknown>(manifestPath);
  if (
    !Array.isArray(paths) ||
    !paths.every((entry) => typeof entry === 'string')
  ) {
    throw new Error('disposition manifest must be an array of absolute paths');
  }
  return paths.map((path) => {
    assertProtectedPath(path, undefined, undefined, false);
    return readJson<CutoverDispositionReceipt>(path);
  });
}

function cutoverDispositionDecision(value: string): CutoverDispositionDecision {
  if (value === 'committed_authorized' || value === 'cleanup_authorized') {
    return value;
  }
  throw new Error('--decision is invalid');
}

function accountIdFromEndpoint(endpoint: string): string {
  const hostname = new URL(endpoint).hostname;
  const accountId = hostname.split('.')[0];
  if (!accountId) throw new Error('R2 endpoint does not contain an account');
  return accountId;
}

export async function runCutoverCommand(
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  sleep: (milliseconds: number) => Promise<unknown> = delay,
): Promise<Record<string, unknown>> {
  const config = assertCutoverEnvironment(env);
  const command = parseCutoverCommand(args);
  const values = command.values;
  const backup =
    command.mode === 'audit' || command.mode === 'apply'
      ? verifyBackupEvidence(
          values['--backup-receipt'],
          values['--backup-approval'],
        )
      : null;

  if (command.mode === 'approve') {
    const receipt = readJson<CutoverAuditReceipt>(values['--receipt']);
    if (receipt.receiptPathSha256 !== digest(resolve(values['--receipt']))) {
      throw new Error('audit receipt path binding mismatch');
    }
    const service = new ImageUploadCutoverService(null, null);
    const fingerprint =
      values['--operator-fingerprint'] ??
      digest(config.values.IMAGE_UPLOAD_OPERATOR_TOKEN);
    const approval = service.approve(
      receipt,
      fingerprint,
      new Date(),
      digest(resolve(values['--receipt'])),
    );
    writeExclusiveJson(values['--approval'], approval);
    return { mode: 'approve', receiptSha256: receipt.canonicalSha256 };
  }

  if (command.mode === 'disposition') {
    const auditReceiptBytes = readFileSync(values['--audit-receipt']);
    const receipt = JSON.parse(
      auditReceiptBytes.toString('utf8'),
    ) as CutoverAuditReceipt;
    const auditReceiptPathSha256 = digest(resolve(values['--audit-receipt']));
    if (receipt.receiptPathSha256 !== auditReceiptPathSha256) {
      throw new Error('audit receipt path binding rejects relocated input');
    }
    const evidenceBytes = readFileSync(values['--evidence-receipt']);
    const evidence = JSON.parse(evidenceBytes.toString('utf8')) as {
      schemaVersion?: string;
      uploadId?: string;
      rowEvidenceSha256?: string;
      evidenceReceiptPathSha256?: string;
      canonicalSha256?: string;
    };
    if (
      evidence.schemaVersion !== 'image-upload-cutover-row-evidence/v1' ||
      evidence.uploadId !== values['--upload-id'] ||
      !evidence.rowEvidenceSha256 ||
      evidence.evidenceReceiptPathSha256 !==
        digest(resolve(values['--evidence-receipt'])) ||
      canonicalReceiptSha256(evidence) !== evidence.canonicalSha256
    ) {
      throw new Error('cross-row or drifted evidence receipt');
    }
    const service = new ImageUploadCutoverService(null, null);
    const disposition = service.createDisposition({
      auditReceipt: receipt,
      uploadId: values['--upload-id'],
      decision: cutoverDispositionDecision(values['--decision']),
      auditReceiptPathSha256,
      auditReceiptDigestSha256: digest(auditReceiptBytes),
      evidenceReceiptPathSha256: evidence.evidenceReceiptPathSha256,
      evidenceReceiptSha256: digest(evidenceBytes),
      evidenceCanonicalSha256: evidence.canonicalSha256,
      evidenceRowSha256: evidence.rowEvidenceSha256,
      operatorFingerprint: values['--operator-fingerprint'],
      operatorToken: config.values.IMAGE_UPLOAD_OPERATOR_TOKEN,
      now: new Date(),
    });
    writeExclusiveJson(values['--output'], disposition);
    return { mode: 'disposition', uploadId: disposition.uploadId };
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: config.r2Endpoint,
    credentials: {
      accessKeyId: config.values.IMAGE_UPLOAD_CUTOVER_R2_ACCESS_KEY_ID,
      secretAccessKey: config.values.IMAGE_UPLOAD_CUTOVER_R2_SECRET_ACCESS_KEY,
    },
  });
  const objects = new R2CutoverObjectStore(
    client,
    config.r2Bucket,
    (env.IMAGE_UPLOAD_EXPECTED_CORS_ORIGINS ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
    config.r2ControlTimeoutSeconds * 1000,
  );
  const pool = new Pool({ connectionString: config.databaseUrl });
  const repository = new PgCutoverRepository(
    pool,
    accountIdFromEndpoint(config.r2Endpoint),
    config.r2Bucket,
    () => objects.corsMismatch(),
  );
  const service = new ImageUploadCutoverService(repository, objects);
  try {
    const dispositions = loadDispositions(values['--dispositions']);
    if (command.mode === 'audit') {
      const first = await service.collectPollingSnapshot(new Date());
      await sleep(30_000);
      const second = await service.collectPollingSnapshot(new Date());
      const receipt = await service.audit({
        now: new Date(),
        firstSnapshot: first,
        secondSnapshot: second,
        backup,
        dispositions,
        receiptPathSha256: digest(resolve(values['--receipt'])),
        operatorToken: config.values.IMAGE_UPLOAD_OPERATOR_TOKEN,
      });
      persistAuditReceipt(values['--receipt'], receipt);
      return {
        mode: 'audit',
        receiptSha256: receipt.canonicalSha256,
        summary: receipt.summary,
      };
    }

    const receipt = readJson<CutoverAuditReceipt>(values['--receipt']);
    const approval = readJson<CutoverAuditApproval>(values['--approval']);
    if (approval.receiptPathSha256 !== digest(resolve(values['--receipt']))) {
      throw new Error('audit approval path binding mismatch');
    }
    const result = await service.apply({
      now: new Date(),
      receipt,
      approval,
      backup,
      dispositions,
      operatorToken: config.values.IMAGE_UPLOAD_OPERATOR_TOKEN,
      presignClockSkewSeconds: config.presignClockSkewSeconds,
    });
    return { mode: 'apply', ...result };
  } finally {
    await pool.end();
    client.destroy();
  }
}

if (require.main === module) {
  void runCutoverCommand(process.argv.slice(2), process.env)
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    })
    .catch((error) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
