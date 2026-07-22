import {
  assertCutoverEnvironment,
  assertProtectedPath,
  parseCutoverCommand,
  verifyBackupEvidence,
} from './image-upload-cutover';
import * as cutoverScript from './image-upload-cutover';
import {
  canonicalReceiptSha256,
  type QuiescedBackupApproval,
  type QuiescedBackupReceipt,
} from '../images/image-upload-cutover.pg';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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
  IMAGE_UPLOAD_CUTOVER_R2_CONFIG_READ_ACCESS_KEY_ID: 'config-read-key',
  IMAGE_UPLOAD_CUTOVER_R2_CONFIG_READ_SECRET_ACCESS_KEY:
    'config-read-secret',
  IMAGE_UPLOAD_OPERATOR_TOKEN: 'operator-token',
};

const digest = (value: Buffer | string) =>
  createHash('sha256').update(value).digest('hex');

const protectedCliEvidenceDirectory = mkdtempSync(
  join(tmpdir(), 'cutover-cli-evidence-'),
);
chmodSync(protectedCliEvidenceDirectory, 0o700);

afterAll(() => {
  rmSync(protectedCliEvidenceDirectory, { recursive: true, force: true });
});

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
    const outside = (name: string) =>
      join(protectedCliEvidenceDirectory, name);
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
        `--operator-fingerprint=${'f'.repeat(64)}`,
      ]),
    ).not.toThrow();
    expect(() =>
      parseCutoverCommand([
        'disposition',
        `--audit-receipt=${outside('a2.json')}`,
        '--upload-id=10000000-0000-4000-8000-000000000001',
        '--decision=cleanup_authorized',
        `--evidence-receipt=${outside('e2.json')}`,
        `--output=${outside('o2.json')}`,
        '--operator-fingerprint=f',
      ]),
    ).toThrow(/operator.*fingerprint/i);
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

    const firstDisposition = outside('row-1.json');
    const secondDisposition = outside('row-2.json');
    expect(
      parseCutoverCommand([
        'audit',
        `--receipt=${outside('audit.json')}`,
        `--backup-receipt=${outside('backup.json')}`,
        `--backup-approval=${outside('backup-approval.json')}`,
        `--disposition=${firstDisposition}`,
        `--disposition=${secondDisposition}`,
      ]).dispositionPaths,
    ).toEqual([resolve(firstDisposition), resolve(secondDisposition)]);
    expect(
      parseCutoverCommand([
        'audit',
        '--receipt',
        outside('audit-space.json'),
        '--backup-receipt',
        outside('backup-space.json'),
        '--backup-approval',
        outside('backup-approval-space.json'),
        '--disposition',
        firstDisposition,
      ]).dispositionPaths,
    ).toEqual([resolve(firstDisposition)]);
    expect(() =>
      parseCutoverCommand([
        'audit',
        `--receipt=${outside('audit-legacy-option.json')}`,
        `--backup-receipt=${outside('backup-legacy-option.json')}`,
        `--backup-approval=${outside('backup-approval-legacy-option.json')}`,
        `--dispositions=${outside('manifest.json')}`,
      ]),
    ).toThrow(/unknown.*--dispositions/);
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
      backupApprovalPathSha256: digest(resolve(approvalPath)),
      backupReceiptSha256: digest(readFileSync(receiptPath)),
      backupPathSha256: digest(resolve(backupPath)),
      backupSha256: receipt.backupSha256,
      operatorFingerprint: 'f'.repeat(64),
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
    expect(binding.receiptPathSha256).toBe(digest(resolve(receiptPath)));
    expect(binding.approvalPathSha256).toBe(digest(resolve(approvalPath)));

    const invalidApprovalDraft = {
      ...approvalDraft,
      operatorFingerprint: 'operator-fingerprint',
    };
    const invalidApproval = {
      ...invalidApprovalDraft,
      canonicalSha256: canonicalReceiptSha256(invalidApprovalDraft),
    };
    writeFileSync(approvalPath, JSON.stringify(invalidApproval), {
      mode: 0o600,
    });
    expect(() =>
      verifyBackupEvidence(
        receiptPath,
        approvalPath,
        resolve(__dirname, '../../..'),
        () => true,
      ),
    ).toThrow(/operator.*fingerprint|sha256/i);
    writeFileSync(approvalPath, JSON.stringify(approval), { mode: 0o600 });

    const relocatedApproval = join(directory, 'relocated-approval.json');
    copyFileSync(approvalPath, relocatedApproval);
    expect(() =>
      verifyBackupEvidence(
        receiptPath,
        relocatedApproval,
        resolve(__dirname, '../../..'),
        () => true,
      ),
    ).toThrow(/approval path/i);

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

  it('writes the diagnostic audit receipt before signaling unresolved ambiguity', () => {
    const directory = mkdtempSync(join(tmpdir(), 'cutover-audit-output-'));
    chmodSync(directory, 0o700);
    const output = join(directory, 'audit.json');
    const receipt = {
      schemaVersion: 'image-upload-cutover-audit/v1',
      summary: { unresolvedAmbiguous: 1 },
      canonicalSha256: 'a'.repeat(64),
    };
    expect(() => cutoverScript.persistAuditReceipt(output, receipt)).toThrow(
      /ambiguous/i,
    );
    expect(existsSync(output)).toBe(true);
    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual(receipt);
  });

  it('rejects relocated audit/evidence inputs when creating a disposition', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'cutover-disposition-'));
    chmodSync(directory, 0o700);
    const canonicalAuditPath = join(directory, 'canonical-audit.json');
    const relocatedAuditPath = join(directory, 'relocated-audit.json');
    const evidencePath = join(directory, 'row-evidence.json');
    const outputPath = join(directory, 'disposition.json');
    const first = {
      observedAt: '2026-07-21T00:00:00.000Z',
      activeUploads: 0,
      expiredUploads: 0,
      unresolvedPromotions: 0,
      invalidResponseHeadSettlement: 0,
      openConflicts: 0,
      dueTemporaryCleanup: 0,
      applicableImageDeletion: 0,
      invalidLegacyAuthority: 0,
      corsMismatch: 0,
    };
    const rowEvidenceSha256 = '8'.repeat(64);
    const auditDraft = {
      schemaVersion: 'image-upload-cutover-audit/v1' as const,
      receiptPathSha256: digest(resolve(canonicalAuditPath)),
      generatedAt: '2026-07-21T00:00:30.000Z',
      outstandingPutDeadline: '2026-07-20T21:00:00.000Z',
      backup: {
        receiptSha256: 'a'.repeat(64),
        approvalSha256: 'b'.repeat(64),
        receiptPathSha256: 'c'.repeat(64),
        approvalPathSha256: 'd'.repeat(64),
        databaseIdentitySha256: 'e'.repeat(64),
        backupSha256: 'f'.repeat(64),
        backupPathSha256: '1'.repeat(64),
        quiescedAt: '2026-07-20T21:00:00.000Z',
      },
      pollingSnapshots: [
        first,
        { ...first, observedAt: '2026-07-21T00:00:30.000Z' },
      ],
      rows: [
        {
          uploadId: '10000000-0000-4000-8000-000000000001',
          classification: 'legacy_ambiguous',
          rowEvidenceSha256,
          sourceIdentitySha256: null,
          destinationIdentitySha256: null,
          imageAuthoritySha256: null,
          dispositionSha256: null,
          dispositionPathSha256: null,
        },
      ],
      summary: {
        total: 1,
        legacyPreDispatch: 0,
        legacyDispatchEvidence: 0,
        existingImageAuthority: 0,
        ambiguous: 1,
        unresolvedAmbiguous: 1,
      },
    };
    const audit = {
      ...auditDraft,
      canonicalSha256: canonicalReceiptSha256(auditDraft),
    };
    writeFileSync(relocatedAuditPath, JSON.stringify(audit), { mode: 0o600 });
    const evidenceDraft = {
      schemaVersion: 'image-upload-cutover-row-evidence/v1',
      uploadId: audit.rows[0].uploadId,
      rowEvidenceSha256,
      evidenceReceiptPathSha256: digest(resolve(evidencePath)),
    };
    const evidence = {
      ...evidenceDraft,
      canonicalSha256: canonicalReceiptSha256(evidenceDraft),
    };
    writeFileSync(evidencePath, JSON.stringify(evidence), { mode: 0o600 });

    await expect(
      cutoverScript.runCutoverCommand(
        [
          'disposition',
          `--audit-receipt=${relocatedAuditPath}`,
          `--upload-id=${audit.rows[0].uploadId}`,
          '--decision=cleanup_authorized',
          `--evidence-receipt=${evidencePath}`,
          `--output=${outputPath}`,
          `--operator-fingerprint=${'9'.repeat(64)}`,
        ],
        env,
      ),
    ).rejects.toThrow(/audit.*path|relocat/i);
    expect(existsSync(outputPath)).toBe(false);
  });
});
