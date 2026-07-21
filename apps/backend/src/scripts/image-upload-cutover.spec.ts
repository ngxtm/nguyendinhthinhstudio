import {
  assertCutoverEnvironment,
  assertProtectedPath,
  parseCutoverCommand,
  verifyBackupEvidence,
} from './image-upload-cutover';
import {
  canonicalReceiptSha256,
  type QuiescedBackupApproval,
  type QuiescedBackupReceipt,
} from '../images/image-upload-cutover.pg';
import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const env = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://db/app',
  IMAGE_UPLOAD_PROCESS_ROLE: 'cutover',
  IMAGE_UPLOAD_PROCESS_COUNT: '1',
  IMAGE_UPLOAD_DECODE_PERMITS_PER_PROCESS: '2',
  IMAGE_UPLOAD_R2_CONTROL_TIMEOUT_SECONDS: '30',
  IMAGE_UPLOAD_R2_READ_TIMEOUT_SECONDS: '60',
  IMAGE_UPLOAD_PRESIGN_ENABLED: 'false',
  IMAGE_UPLOAD_PRESIGN_CLOCK_SKEW_SECONDS: '60',
  IMAGE_UPLOAD_RATE_LIMIT_CLEANUP_BATCH: '1000',
  IMAGE_UPLOAD_POLICY_VERSION:
    'web-v1-18da64f64a7d4a645b549c56ebc5dce84ed830f69defdf8b6d7f2b8d9659baef',
  IMAGE_UPLOAD_R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
  IMAGE_UPLOAD_R2_BUCKET: 'production-images',
  IMAGE_UPLOAD_CANONICAL_PREFIX: 'albums/',
  IMAGE_UPLOAD_CUTOVER_R2_ACCESS_KEY_ID: 'cutover-key',
  IMAGE_UPLOAD_CUTOVER_R2_SECRET_ACCESS_KEY: 'cutover-secret',
  IMAGE_UPLOAD_OPERATOR_TOKEN: 'operator-token',
};

const digest = (value: Buffer | string) =>
  createHash('sha256').update(value).digest('hex');

describe('image upload cutover command contract', () => {
  it('accepts cutover-only polling configuration and rejects obsolete Queue/Event variables', () => {
    expect(assertCutoverEnvironment(env).processRole).toBe('cutover');
    expect(() =>
      assertCutoverEnvironment({
        ...env,
        IMAGE_UPLOAD_CUTOVER_QUEUE_TOKEN: 'obsolete',
      }),
    ).toThrow(/obsolete|polling/i);
    expect(() =>
      assertCutoverEnvironment({
        ...env,
        NDT_PRODUCTION_EVENT_RULE_ID: 'obsolete',
      }),
    ).toThrow(/obsolete|polling/i);
  });

  it('requires protected absolute paths, an ACL verifier, closed modes, and apply approval', () => {
    const outside = (name: string) => join(tmpdir(), name);
    expect(() => assertProtectedPath('relative.json')).toThrow(/absolute/);
    expect(() =>
      assertProtectedPath(outside('denied.json'), undefined, () => false),
    ).toThrow(/protected/);
    expect(() =>
      parseCutoverCommand([
        'audit',
        `--receipt=${outside('r.json')}`,
        `--backup-receipt=${outside('b.json')}`,
        `--backup-approval=${outside('ba.json')}`,
      ]),
    ).not.toThrow();
    expect(() =>
      parseCutoverCommand([
        'apply',
        `--receipt=${outside('r.json')}`,
        `--backup-receipt=${outside('b.json')}`,
        `--backup-approval=${outside('ba.json')}`,
      ]),
    ).toThrow(/--approval/);
    expect(() =>
      parseCutoverCommand([
        'disposition',
        `--audit-receipt=${outside('a.json')}`,
        '--upload-id=10000000-0000-4000-8000-000000000001',
        '--decision=cleanup_authorized',
        `--evidence-receipt=${outside('e.json')}`,
        `--output=${outside('o.json')}`,
        '--operator-fingerprint=f',
      ]),
    ).not.toThrow();
    expect(() =>
      parseCutoverCommand([
        'approve',
        `--receipt=${outside('same.json')}`,
        `--approval=${outside('same.json')}`,
      ]),
    ).toThrow(/distinct/);
    expect(() =>
      parseCutoverCommand([
        'audit',
        `--receipt=${outside('r1.json')}`,
        `--receipt=${outside('r2.json')}`,
        `--backup-receipt=${outside('b.json')}`,
        `--backup-approval=${outside('ba.json')}`,
      ]),
    ).toThrow(/duplicate/);
  });

  it('verifies authoritative backup bytes, canonical receipt, path binding, and distinct approval', () => {
    const directory = mkdtempSync(join(tmpdir(), 'cutover-backup-'));
    const backupPath = join(directory, 'quiesced.dump');
    const receiptPath = join(directory, 'backup-receipt.json');
    const approvalPath = join(directory, 'backup-approval.json');
    writeFileSync(backupPath, 'quiesced backup bytes', { mode: 0o600 });

    const receiptDraft = {
      schemaVersion: 'image-upload-quiesced-backup/v1' as const,
      backupPath,
      backupSha256: digest(readFileSync(backupPath)),
      databaseIdentitySha256: 'c'.repeat(64),
      quiescedAt: '2026-07-21T00:00:00.000Z',
    };
    const receipt: QuiescedBackupReceipt = {
      ...receiptDraft,
      canonicalSha256: canonicalReceiptSha256(receiptDraft),
    };
    writeFileSync(receiptPath, JSON.stringify(receipt), { mode: 0o600 });
    const approvalDraft = {
      schemaVersion: 'image-upload-quiesced-backup-approval/v1' as const,
      backupReceiptPathSha256: digest(resolve(receiptPath)),
      backupReceiptSha256: digest(readFileSync(receiptPath)),
      backupPathSha256: digest(resolve(backupPath)),
      backupSha256: receipt.backupSha256,
      operatorFingerprint: 'operator-fingerprint',
      approvedAt: '2026-07-21T00:00:01.000Z',
    };
    const approval: QuiescedBackupApproval = {
      ...approvalDraft,
      canonicalSha256: canonicalReceiptSha256(approvalDraft),
    };
    writeFileSync(approvalPath, JSON.stringify(approval), { mode: 0o600 });
    chmodSync(directory, 0o700);

    const binding = verifyBackupEvidence(
      receiptPath,
      approvalPath,
      resolve(__dirname, '../../..'),
      () => true,
    );
    expect(binding.backupSha256).toBe(receipt.backupSha256);
    expect(binding.backupPathSha256).toBe(digest(resolve(backupPath)));

    writeFileSync(backupPath, 'drifted backup bytes', { mode: 0o600 });
    expect(() =>
      verifyBackupEvidence(
        receiptPath,
        approvalPath,
        resolve(__dirname, '../../..'),
        () => true,
      ),
    ).toThrow(/backup digest/i);
  });
});
