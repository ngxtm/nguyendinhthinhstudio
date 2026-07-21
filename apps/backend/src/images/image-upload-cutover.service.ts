import { createHash } from 'node:crypto';

export type PollingGateSnapshot = Readonly<{
  observedAt: Date;
  activeUploads: number;
  expiredUploads: number;
  unresolvedPromotions: number;
  invalidResponseHeadSettlement: number;
  openConflicts: number;
  dueTemporaryCleanup: number;
  applicableImageDeletion: number;
  invalidLegacyAuthority: number;
  corsMismatch: number;
}>;

const ZERO_KEYS = [
  'activeUploads',
  'expiredUploads',
  'unresolvedPromotions',
  'invalidResponseHeadSettlement',
  'openConflicts',
  'dueTemporaryCleanup',
  'applicableImageDeletion',
  'invalidLegacyAuthority',
  'corsMismatch',
] as const;

export function assertPollingGate(snapshot: PollingGateSnapshot): void {
  if (
    !(snapshot.observedAt instanceof Date) ||
    !Number.isFinite(snapshot.observedAt.getTime())
  ) {
    throw new Error('invalid polling gate observedAt');
  }
  for (const key of ZERO_KEYS) {
    if (!Number.isSafeInteger(snapshot[key]) || snapshot[key] < 0) {
      throw new Error(`invalid polling gate ${key}`);
    }
    if (snapshot[key] !== 0) {
      throw new Error(`polling gate ${key} is non-zero`);
    }
  }
}

export function assertTwoPollingSnapshots(
  first: PollingGateSnapshot,
  second: PollingGateSnapshot,
  barrierMs = 30_000,
): void {
  assertPollingGate(first);
  assertPollingGate(second);
  if (second.observedAt.getTime() - first.observedAt.getTime() < barrierMs) {
    throw new Error(
      'polling snapshots are not separated by the 30-second barrier',
    );
  }
}

export type LegacyImageAuthority = Readonly<{
  id: string;
  albumId: string;
  r2ObjectKey: string;
}>;

export type LegacyImageUploadRow = Readonly<{
  id: string;
  albumId: string;
  uploadObjectKey: string;
  finalObjectKey: string;
  filename: string;
  contentType: string;
  fileSize: number;
  status: string;
  sourceEtag: string | null;
  finalizationStartedAt: Date | null;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
  image: LegacyImageAuthority | null;
}>;

export type CutoverObjectIdentity = Readonly<{
  etag: string;
  bytes: number;
  mime: string;
  metadataSha256: string;
}>;

export interface CutoverObjectStore {
  head(objectKey: string): Promise<CutoverObjectIdentity | null>;
  delete(objectKey: string, expectedEtag?: string): Promise<void>;
}

export type FailLegacyUploadInput = Readonly<{
  uploadId: string;
  rowEvidenceSha256: string;
  now: Date;
  presignExpiresAt: Date;
  cleanupNotBefore: Date;
  row: LegacyImageUploadRow;
}>;

export type CommitLegacyBridgeInput = Readonly<{
  uploadId: string;
  rowEvidenceSha256: string;
  receiptSha256: string;
  finalizationToken: string;
  now: Date;
  presignExpiresAt: Date;
  cleanupNotBefore: Date;
  row: LegacyImageUploadRow;
  destination: CutoverObjectIdentity;
  committedAuthorized: boolean;
}>;

export interface CutoverRepository {
  readLegacyRows(): Promise<readonly LegacyImageUploadRow[]>;
  readPollingSnapshot(observedAt: Date): Promise<PollingGateSnapshot>;
  failLegacyUpload(
    input: FailLegacyUploadInput,
  ): Promise<'applied' | 'already_applied'>;
  commitLegacyBridge(
    input: CommitLegacyBridgeInput,
  ): Promise<'applied' | 'already_applied'>;
  markTemporaryCleanupVerified(
    uploadId: string,
    verifiedAt: Date,
  ): Promise<void>;
  readAppliedState(
    uploadId: string,
    finalizationToken: string,
  ): Promise<'failed' | 'bridged' | 'preserved' | null>;
}

export type CutoverRowClassification =
  | 'legacy_pre_dispatch'
  | 'legacy_dispatch_evidence'
  | 'existing_image_authority'
  | 'legacy_ambiguous';

export type CutoverDispositionDecision =
  | 'committed_authorized'
  | 'cleanup_authorized';

export type CutoverDispositionReceipt = Readonly<{
  schemaVersion: 'image-upload-cutover-disposition/v1';
  auditReceiptSha256: string;
  uploadId: string;
  decision: CutoverDispositionDecision;
  rowEvidenceSha256: string;
  evidenceReceiptSha256: string;
  operatorFingerprint: string;
  createdAt: string;
  canonicalSha256: string;
}>;

export type CutoverRowReceipt = Readonly<{
  uploadId: string;
  classification: CutoverRowClassification;
  rowEvidenceSha256: string;
  sourceIdentitySha256: string | null;
  destinationIdentitySha256: string | null;
  imageAuthoritySha256: string | null;
  dispositionSha256: string | null;
}>;

type SerializablePollingGateSnapshot = Readonly<
  Omit<PollingGateSnapshot, 'observedAt'> & { observedAt: string }
>;

export type CutoverBackupBinding = Readonly<{
  receiptSha256: string;
  approvalSha256: string;
  databaseIdentitySha256: string;
  backupSha256: string;
  backupPathSha256: string;
  quiescedAt: Date;
}>;

export type CutoverAuditReceipt = Readonly<{
  schemaVersion: 'image-upload-cutover-audit/v1';
  generatedAt: string;
  backup: Readonly<{
    receiptSha256: string;
    approvalSha256: string;
    databaseIdentitySha256: string;
    backupSha256: string;
    backupPathSha256: string;
    quiescedAt: string;
  }>;
  pollingSnapshots: readonly [
    SerializablePollingGateSnapshot,
    SerializablePollingGateSnapshot,
  ];
  rows: readonly CutoverRowReceipt[];
  summary: Readonly<{
    total: number;
    legacyPreDispatch: number;
    legacyDispatchEvidence: number;
    existingImageAuthority: number;
    ambiguous: number;
    unresolvedAmbiguous: number;
  }>;
  canonicalSha256: string;
}>;

export type CutoverAuditApproval = Readonly<{
  schemaVersion: 'image-upload-cutover-approval/v1';
  receiptSha256: string;
  receiptPathSha256: string;
  operatorFingerprint: string;
  approvedAt: string;
  canonicalSha256: string;
}>;

type InspectedRow = Readonly<{
  source: CutoverObjectIdentity | null;
  destination: CutoverObjectIdentity | null;
  receipt: CutoverRowReceipt;
}>;

const SHA256 = /^[a-f0-9]{64}$/;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const CUTOVER_NAMESPACE = '16e0d6a7-6c39-5dc9-bc41-24f847e2f36a';

function requireSha256(value: string, field: string): void {
  if (!SHA256.test(value)) throw new Error(`${field} must be canonical sha256`);
}

function normalizeEtag(value: string): string {
  const normalized = value
    .trim()
    .replace(/^W\//, '')
    .replace(/^"|"$/g, '')
    .toLowerCase();
  if (!normalized || /[\r\n]/.test(normalized)) {
    throw new Error('object ETag is invalid');
  }
  return normalized;
}

function normalizeIdentity(
  identity: CutoverObjectIdentity | null,
): CutoverObjectIdentity | null {
  if (identity === null) return null;
  if (!Number.isSafeInteger(identity.bytes) || identity.bytes < 0) {
    throw new Error('object byte count is invalid');
  }
  requireSha256(identity.metadataSha256, 'metadataSha256');
  if (!identity.mime.trim()) throw new Error('object mime is invalid');
  return Object.freeze({
    etag: normalizeEtag(identity.etag),
    bytes: identity.bytes,
    mime: identity.mime.trim().toLowerCase(),
    metadataSha256: identity.metadataSha256,
  });
}

function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== 'canonicalSha256')
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function canonicalReceiptSha256(value: unknown): string {
  return sha256(stableJson(value));
}

function uuidBytes(value: string): Buffer {
  if (!UUID.test(value)) throw new Error('UUID is invalid');
  return Buffer.from(value.replace(/-/g, ''), 'hex');
}

function uuidV5(namespace: string, name: string): string {
  const digest = createHash('sha1')
    .update(uuidBytes(namespace))
    .update(name, 'utf8')
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

export function deterministicCutoverLeaseToken(
  receiptSha256: string,
  uploadId: string,
): string {
  requireSha256(receiptSha256, 'receiptSha256');
  if (!UUID.test(uploadId)) throw new Error('uploadId must be a UUID');
  return uuidV5(CUTOVER_NAMESPACE, `${receiptSha256}:${uploadId}`);
}

function snapshotForReceipt(
  snapshot: PollingGateSnapshot,
): SerializablePollingGateSnapshot {
  return Object.freeze({
    observedAt: snapshot.observedAt.toISOString(),
    activeUploads: snapshot.activeUploads,
    expiredUploads: snapshot.expiredUploads,
    unresolvedPromotions: snapshot.unresolvedPromotions,
    invalidResponseHeadSettlement: snapshot.invalidResponseHeadSettlement,
    openConflicts: snapshot.openConflicts,
    dueTemporaryCleanup: snapshot.dueTemporaryCleanup,
    applicableImageDeletion: snapshot.applicableImageDeletion,
    invalidLegacyAuthority: snapshot.invalidLegacyAuthority,
    corsMismatch: snapshot.corsMismatch,
  });
}

function snapshotFromReceipt(
  snapshot: SerializablePollingGateSnapshot,
): PollingGateSnapshot {
  return {
    ...snapshot,
    observedAt: new Date(snapshot.observedAt),
  };
}

function rowEvidence(
  row: LegacyImageUploadRow,
  source: CutoverObjectIdentity | null,
  destination: CutoverObjectIdentity | null,
): string {
  return canonicalReceiptSha256({
    id: row.id,
    albumId: row.albumId,
    uploadObjectKey: row.uploadObjectKey,
    finalObjectKey: row.finalObjectKey,
    filename: row.filename,
    contentType: row.contentType,
    fileSize: row.fileSize,
    status: row.status,
    sourceEtag: row.sourceEtag ? normalizeEtag(row.sourceEtag) : null,
    finalizationStartedAt: row.finalizationStartedAt,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    createdAt: row.createdAt,
    image: row.image,
    source,
    destination,
  });
}

function exactImageAuthority(row: LegacyImageUploadRow): boolean {
  return (
    row.image !== null &&
    row.image.albumId === row.albumId &&
    row.image.r2ObjectKey === row.finalObjectKey
  );
}

function exactDispatchEvidence(
  row: LegacyImageUploadRow,
  destination: CutoverObjectIdentity | null,
): boolean {
  return (
    row.image === null &&
    row.status === 'finalizing' &&
    row.sourceEtag !== null &&
    row.finalizationStartedAt !== null &&
    row.consumedAt === null &&
    destination !== null &&
    normalizeEtag(row.sourceEtag) === destination.etag &&
    row.fileSize === destination.bytes &&
    row.contentType.toLowerCase() === destination.mime
  );
}

function isPreDispatch(
  row: LegacyImageUploadRow,
  destination: CutoverObjectIdentity | null,
): boolean {
  return (
    row.image === null &&
    row.sourceEtag === null &&
    row.finalizationStartedAt === null &&
    row.consumedAt === null &&
    destination === null &&
    ['pending', 'failed'].includes(row.status)
  );
}

function dispositionFor(
  dispositions: readonly CutoverDispositionReceipt[],
  uploadId: string,
  evidenceSha256: string,
): CutoverDispositionReceipt | null {
  const matches = dispositions.filter((entry) => entry.uploadId === uploadId);
  if (matches.length > 1) {
    throw new Error(`duplicate disposition for upload ${uploadId}`);
  }
  const disposition = matches[0];
  if (!disposition) return null;
  if (
    disposition.schemaVersion !== 'image-upload-cutover-disposition/v1' ||
    canonicalReceiptSha256(disposition) !== disposition.canonicalSha256
  ) {
    throw new Error('disposition canonical hash mismatch');
  }
  requireSha256(disposition.auditReceiptSha256, 'auditReceiptSha256');
  if (disposition.rowEvidenceSha256 !== evidenceSha256) {
    throw new Error('disposition evidence drift');
  }
  if (
    !['committed_authorized', 'cleanup_authorized'].includes(
      disposition.decision,
    )
  ) {
    throw new Error('invalid disposition decision');
  }
  requireSha256(disposition.evidenceReceiptSha256, 'evidenceReceiptSha256');
  if (!disposition.operatorFingerprint.trim()) {
    throw new Error('operator fingerprint is required');
  }
  return disposition;
}

function assertBackupBinding(
  receipt: CutoverAuditReceipt,
  backup: CutoverBackupBinding,
): void {
  const expected = {
    receiptSha256: backup.receiptSha256,
    approvalSha256: backup.approvalSha256,
    databaseIdentitySha256: backup.databaseIdentitySha256,
    backupSha256: backup.backupSha256,
    backupPathSha256: backup.backupPathSha256,
    quiescedAt: backup.quiescedAt.toISOString(),
  };
  for (const value of Object.values(expected).slice(0, 5)) {
    requireSha256(value, 'backup binding');
  }
  if (stableJson(receipt.backup) !== stableJson(expected)) {
    throw new Error('backup receipt/approval binding mismatch');
  }
  if (backup.quiescedAt.getTime() > new Date(receipt.generatedAt).getTime()) {
    throw new Error('backup is not a quiesced pre-audit backup');
  }
}

export class ImageUploadCutoverService {
  constructor(
    private readonly repository: CutoverRepository,
    private readonly objects: CutoverObjectStore,
  ) {}

  async collectPollingSnapshot(observedAt: Date): Promise<PollingGateSnapshot> {
    const snapshot = await this.repository.readPollingSnapshot(observedAt);
    assertPollingGate(snapshot);
    return snapshot;
  }

  private async inspectRows(): Promise<
    readonly { row: LegacyImageUploadRow; inspected: InspectedRow }[]
  > {
    const rows = await this.repository.readLegacyRows();
    const duplicateIds = rows.filter(
      (row, index) =>
        rows.findIndex((candidate) => candidate.id === row.id) !== index,
    );
    if (duplicateIds.length !== 0)
      throw new Error('duplicate legacy upload row');

    return Promise.all(
      rows.map(async (row) => {
        const [sourceRaw, destinationRaw] = await Promise.all([
          this.objects.head(row.uploadObjectKey),
          this.objects.head(row.finalObjectKey),
        ]);
        const source = normalizeIdentity(sourceRaw);
        const destination = normalizeIdentity(destinationRaw);
        const evidenceSha256 = rowEvidence(row, source, destination);
        let classification: CutoverRowClassification = 'legacy_ambiguous';
        if (exactImageAuthority(row)) {
          classification = 'existing_image_authority';
        } else if (isPreDispatch(row, destination)) {
          classification = 'legacy_pre_dispatch';
        } else if (exactDispatchEvidence(row, destination)) {
          classification = 'legacy_dispatch_evidence';
        }
        return {
          row,
          inspected: {
            source,
            destination,
            receipt: {
              uploadId: row.id,
              classification,
              rowEvidenceSha256: evidenceSha256,
              sourceIdentitySha256: source
                ? canonicalReceiptSha256(source)
                : null,
              destinationIdentitySha256: destination
                ? canonicalReceiptSha256(destination)
                : null,
              imageAuthoritySha256: row.image
                ? canonicalReceiptSha256(row.image)
                : null,
              dispositionSha256: null,
            },
          },
        };
      }),
    );
  }

  async audit(input: {
    now: Date;
    firstSnapshot: PollingGateSnapshot;
    secondSnapshot: PollingGateSnapshot;
    backup: CutoverBackupBinding;
    dispositions: readonly CutoverDispositionReceipt[];
  }): Promise<CutoverAuditReceipt> {
    assertTwoPollingSnapshots(input.firstSnapshot, input.secondSnapshot);
    if (input.secondSnapshot.observedAt.getTime() > input.now.getTime()) {
      throw new Error('audit time precedes polling evidence');
    }
    const inspected = await this.inspectRows();
    const knownIds = new Set(inspected.map(({ row }) => row.id));
    for (const disposition of input.dispositions) {
      if (!knownIds.has(disposition.uploadId)) {
        throw new Error('cross-row disposition is not in this audit');
      }
    }
    const rows = inspected.map(({ inspected: entry }) => {
      const disposition = dispositionFor(
        input.dispositions,
        entry.receipt.uploadId,
        entry.receipt.rowEvidenceSha256,
      );
      return Object.freeze({
        ...entry.receipt,
        dispositionSha256: disposition?.canonicalSha256 ?? null,
      });
    });
    const count = (classification: CutoverRowClassification) =>
      rows.filter((row) => row.classification === classification).length;
    const unresolvedAmbiguous = rows.filter(
      (row) =>
        row.classification === 'legacy_ambiguous' &&
        row.dispositionSha256 === null,
    ).length;
    const draft = {
      schemaVersion: 'image-upload-cutover-audit/v1' as const,
      generatedAt: input.now.toISOString(),
      backup: Object.freeze({
        receiptSha256: input.backup.receiptSha256,
        approvalSha256: input.backup.approvalSha256,
        databaseIdentitySha256: input.backup.databaseIdentitySha256,
        backupSha256: input.backup.backupSha256,
        backupPathSha256: input.backup.backupPathSha256,
        quiescedAt: input.backup.quiescedAt.toISOString(),
      }),
      pollingSnapshots: Object.freeze([
        snapshotForReceipt(input.firstSnapshot),
        snapshotForReceipt(input.secondSnapshot),
      ]) as readonly [
        SerializablePollingGateSnapshot,
        SerializablePollingGateSnapshot,
      ],
      rows: Object.freeze(rows),
      summary: Object.freeze({
        total: rows.length,
        legacyPreDispatch: count('legacy_pre_dispatch'),
        legacyDispatchEvidence: count('legacy_dispatch_evidence'),
        existingImageAuthority: count('existing_image_authority'),
        ambiguous: count('legacy_ambiguous'),
        unresolvedAmbiguous,
      }),
    };
    for (const value of Object.values(draft.backup).slice(0, 5)) {
      requireSha256(value, 'backup binding');
    }
    if (input.backup.quiescedAt.getTime() > input.now.getTime()) {
      throw new Error('backup is not quiesced before audit');
    }
    return Object.freeze({
      ...draft,
      canonicalSha256: canonicalReceiptSha256(draft),
    });
  }

  createDisposition(input: {
    auditReceipt: CutoverAuditReceipt;
    uploadId: string;
    decision: CutoverDispositionDecision;
    evidenceReceiptSha256: string;
    evidenceRowSha256: string;
    operatorFingerprint: string;
    now: Date;
  }): CutoverDispositionReceipt {
    this.assertAuditReceipt(input.auditReceipt);
    const row = input.auditReceipt.rows.find(
      (entry) => entry.uploadId === input.uploadId,
    );
    if (!row) throw new Error('cross-row disposition upload is absent');
    if (row.classification !== 'legacy_ambiguous') {
      throw new Error('disposition is only valid for an ambiguous row');
    }
    if (row.dispositionSha256 !== null) {
      throw new Error('duplicate disposition is not allowed');
    }
    if (row.rowEvidenceSha256 !== input.evidenceRowSha256) {
      throw new Error('disposition evidence drift');
    }
    requireSha256(input.evidenceReceiptSha256, 'evidenceReceiptSha256');
    if (!input.operatorFingerprint.trim()) {
      throw new Error('operator fingerprint is required');
    }
    const draft = {
      schemaVersion: 'image-upload-cutover-disposition/v1' as const,
      auditReceiptSha256: input.auditReceipt.canonicalSha256,
      uploadId: input.uploadId,
      decision: input.decision,
      rowEvidenceSha256: row.rowEvidenceSha256,
      evidenceReceiptSha256: input.evidenceReceiptSha256,
      operatorFingerprint: input.operatorFingerprint,
      createdAt: input.now.toISOString(),
    };
    return Object.freeze({
      ...draft,
      canonicalSha256: canonicalReceiptSha256(draft),
    });
  }

  approve(
    receipt: CutoverAuditReceipt,
    operatorFingerprint: string,
    now = new Date(receipt.generatedAt),
    receiptPathSha256 = sha256('in-memory-cutover-receipt'),
  ): CutoverAuditApproval {
    this.assertAuditReceipt(receipt);
    if (!operatorFingerprint.trim()) {
      throw new Error('operator fingerprint is required');
    }
    requireSha256(receiptPathSha256, 'receiptPathSha256');
    const draft = {
      schemaVersion: 'image-upload-cutover-approval/v1' as const,
      receiptSha256: receipt.canonicalSha256,
      receiptPathSha256,
      operatorFingerprint,
      approvedAt: now.toISOString(),
    };
    return Object.freeze({
      ...draft,
      canonicalSha256: canonicalReceiptSha256(draft),
    });
  }

  private assertAuditReceipt(receipt: CutoverAuditReceipt): void {
    if (receipt.schemaVersion !== 'image-upload-cutover-audit/v1') {
      throw new Error('audit receipt schema is invalid');
    }
    if (canonicalReceiptSha256(receipt) !== receipt.canonicalSha256) {
      throw new Error('audit receipt canonical hash mismatch');
    }
    assertTwoPollingSnapshots(
      snapshotFromReceipt(receipt.pollingSnapshots[0]),
      snapshotFromReceipt(receipt.pollingSnapshots[1]),
    );
  }

  async apply(input: {
    now: Date;
    receipt: CutoverAuditReceipt;
    approval: CutoverAuditApproval;
    backup: CutoverBackupBinding;
    dispositions: readonly CutoverDispositionReceipt[];
    presignClockSkewSeconds: number;
  }): Promise<{
    failed: number;
    bridged: number;
    preserved: number;
    cleaned: number;
  }> {
    this.assertAuditReceipt(input.receipt);
    const approvedAt = new Date(input.approval.approvedAt);
    if (
      input.approval.schemaVersion !== 'image-upload-cutover-approval/v1' ||
      canonicalReceiptSha256(input.approval) !==
        input.approval.canonicalSha256 ||
      input.approval.receiptSha256 !== input.receipt.canonicalSha256 ||
      !input.approval.operatorFingerprint.trim() ||
      !Number.isFinite(approvedAt.getTime()) ||
      approvedAt < new Date(input.receipt.generatedAt) ||
      approvedAt > input.now
    ) {
      throw new Error('audit approval binding mismatch');
    }
    requireSha256(input.approval.receiptPathSha256, 'receiptPathSha256');
    assertBackupBinding(input.receipt, input.backup);
    if (
      !Number.isSafeInteger(input.presignClockSkewSeconds) ||
      input.presignClockSkewSeconds < 0 ||
      input.presignClockSkewSeconds > 300
    ) {
      throw new Error('presign clock skew is invalid');
    }

    const inspected = await this.inspectRows();
    const byId = new Map(inspected.map((entry) => [entry.row.id, entry]));
    if (byId.size !== input.receipt.rows.length) {
      throw new Error('audit row set drift');
    }

    const actions: Array<{
      row: LegacyImageUploadRow;
      inspected: InspectedRow;
      disposition: CutoverDispositionReceipt | null;
      cleanupNotBefore: Date;
      auditRow: CutoverRowReceipt;
      evidenceMatches: boolean;
    }> = [];
    for (const receiptRow of input.receipt.rows) {
      const current = byId.get(receiptRow.uploadId);
      const finalizationToken = deterministicCutoverLeaseToken(
        input.receipt.canonicalSha256,
        receiptRow.uploadId,
      );
      const evidenceMatches =
        current !== undefined &&
        current.inspected.receipt.rowEvidenceSha256 ===
          receiptRow.rowEvidenceSha256 &&
        current.inspected.receipt.classification === receiptRow.classification;
      if (!evidenceMatches) {
        const state = await this.repository.readAppliedState(
          receiptRow.uploadId,
          finalizationToken,
        );
        const expected =
          receiptRow.classification === 'existing_image_authority'
            ? 'preserved'
            : receiptRow.classification === 'legacy_dispatch_evidence' ||
                input.dispositions.some(
                  (entry) =>
                    entry.uploadId === receiptRow.uploadId &&
                    entry.decision === 'committed_authorized',
                )
              ? 'bridged'
              : 'failed';
        if (state !== expected || current === undefined) {
          throw new Error(
            `audit evidence drift for upload ${receiptRow.uploadId}`,
          );
        }
      }
      const disposition = dispositionFor(
        input.dispositions,
        receiptRow.uploadId,
        receiptRow.rowEvidenceSha256,
      );
      if (
        (receiptRow.dispositionSha256 ?? null) !==
        (disposition?.canonicalSha256 ?? null)
      ) {
        throw new Error('audit disposition binding mismatch');
      }
      if (
        receiptRow.classification === 'legacy_ambiguous' &&
        disposition === null
      ) {
        throw new Error('legacy ambiguous row blocks apply');
      }
      const presignExpiresAt = new Date(
        Math.max(
          current.row.expiresAt.getTime(),
          current.row.createdAt.getTime() + 60 * 60 * 1000,
        ),
      );
      const cleanupNotBefore = new Date(
        presignExpiresAt.getTime() + input.presignClockSkewSeconds * 1000,
      );
      if (input.now.getTime() < cleanupNotBefore.getTime()) {
        throw new Error('temporary cleanup requires expiry plus clock skew');
      }
      if (
        disposition?.decision === 'committed_authorized' &&
        current.inspected.destination === null
      ) {
        throw new Error(
          'committed disposition has no destination HEAD evidence',
        );
      }
      actions.push({
        ...current,
        disposition,
        cleanupNotBefore,
        auditRow: receiptRow,
        evidenceMatches,
      });
    }

    let failed = 0;
    let bridged = 0;
    let preserved = 0;
    let cleaned = 0;
    for (const action of actions) {
      const {
        row,
        inspected,
        disposition,
        cleanupNotBefore,
        auditRow,
        evidenceMatches,
      } = action;
      if (evidenceMatches) {
        const [liveSource, liveDestination] = await Promise.all([
          this.objects.head(row.uploadObjectKey),
          this.objects.head(row.finalObjectKey),
        ]);
        const liveSourceSha256 = liveSource
          ? canonicalReceiptSha256(normalizeIdentity(liveSource))
          : null;
        const liveDestinationSha256 = liveDestination
          ? canonicalReceiptSha256(normalizeIdentity(liveDestination))
          : null;
        if (
          liveSourceSha256 !== auditRow.sourceIdentitySha256 ||
          liveDestinationSha256 !== auditRow.destinationIdentitySha256
        ) {
          throw new Error(`live object evidence drift for upload ${row.id}`);
        }
      }
      if (inspected.receipt.classification === 'existing_image_authority') {
        preserved += 1;
      } else if (
        inspected.receipt.classification === 'legacy_dispatch_evidence' ||
        disposition?.decision === 'committed_authorized'
      ) {
        const result = await this.repository.commitLegacyBridge({
          uploadId: row.id,
          rowEvidenceSha256: inspected.receipt.rowEvidenceSha256,
          receiptSha256: input.receipt.canonicalSha256,
          finalizationToken: deterministicCutoverLeaseToken(
            input.receipt.canonicalSha256,
            row.id,
          ),
          now: input.now,
          presignExpiresAt: new Date(
            Math.max(
              row.expiresAt.getTime(),
              row.createdAt.getTime() + 60 * 60 * 1000,
            ),
          ),
          cleanupNotBefore,
          row,
          destination: inspected.destination,
          committedAuthorized: disposition?.decision === 'committed_authorized',
        });
        if (result === 'applied') bridged += 1;
      } else {
        const result = await this.repository.failLegacyUpload({
          uploadId: row.id,
          rowEvidenceSha256: inspected.receipt.rowEvidenceSha256,
          now: input.now,
          presignExpiresAt: new Date(
            Math.max(
              row.expiresAt.getTime(),
              row.createdAt.getTime() + 60 * 60 * 1000,
            ),
          ),
          cleanupNotBefore,
          row,
        });
        if (result === 'applied') failed += 1;
        if (disposition?.decision === 'cleanup_authorized') {
          if (inspected.destination !== null) {
            await this.objects.delete(
              row.finalObjectKey,
              inspected.destination.etag,
            );
          }
          if ((await this.objects.head(row.finalObjectKey)) !== null) {
            throw new Error('canonical cleanup did not reach final absence');
          }
        }
      }

      await this.objects.delete(row.uploadObjectKey, inspected.source?.etag);
      if ((await this.objects.head(row.uploadObjectKey)) !== null) {
        throw new Error('temporary cleanup did not reach final absence');
      }
      await this.repository.markTemporaryCleanupVerified(row.id, input.now);
      cleaned += 1;
    }
    return { failed, bridged, preserved, cleaned };
  }
}
