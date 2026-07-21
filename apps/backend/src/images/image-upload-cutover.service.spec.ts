import { createHash } from 'node:crypto';
import {
  ImageUploadCutoverService,
  assertPollingGate,
  assertTwoPollingSnapshots,
  canonicalReceiptSha256,
  deterministicCutoverLeaseToken,
  type CutoverRepository,
  type LegacyImageUploadRow,
  type PollingGateSnapshot,
  type CutoverObjectStore,
} from './image-upload-cutover.service';

const operatorFingerprint = (token: string) =>
  createHash('sha256').update(token, 'utf8').digest('hex');

const cleanSnapshot = (
  observedAt = new Date('2026-07-21T00:00:00.000Z'),
  overrides: Partial<PollingGateSnapshot> = {},
): PollingGateSnapshot => ({
  observedAt,
  activeUploads: 0,
  expiredUploads: 0,
  unresolvedPromotions: 0,
  invalidResponseHeadSettlement: 0,
  openConflicts: 0,
  dueTemporaryCleanup: 0,
  applicableImageDeletion: 0,
  invalidLegacyAuthority: 0,
  corsMismatch: 0,
  ...overrides,
});

const legacyRow = (
  overrides: Partial<LegacyImageUploadRow> = {},
): LegacyImageUploadRow => ({
  id: '10000000-0000-4000-8000-000000000001',
  albumId: '20000000-0000-4000-8000-000000000001',
  uploadObjectKey: 'uploads/private/source.webp',
  finalObjectKey: 'albums/private/final.webp',
  filename: 'final.webp',
  contentType: 'image/webp',
  fileSize: 123,
  status: 'pending',
  sourceEtag: null,
  finalizationStartedAt: null,
  expiresAt: new Date('2026-07-20T23:00:00.000Z'),
  consumedAt: null,
  createdAt: new Date('2026-07-20T22:00:00.000Z'),
  image: null,
  ...overrides,
});

class MemoryRepository implements CutoverRepository {
  readonly calls: string[] = [];
  rows: LegacyImageUploadRow[];
  failed = new Set<string>();
  bridges = new Set<string>();
  cleanupPending = new Set<string>();
  schemaReady = true;

  constructor(rows: LegacyImageUploadRow[]) {
    this.rows = rows;
  }

  readLegacyRows() {
    this.calls.push('readLegacyRows');
    return Promise.resolve(this.rows);
  }

  readPollingSnapshot(observedAt: Date) {
    this.calls.push('readPollingSnapshot');
    return Promise.resolve(cleanSnapshot(observedAt));
  }

  failLegacyUpload(
    input: Parameters<CutoverRepository['failLegacyUpload']>[0],
  ) {
    this.calls.push('failLegacyUpload');
    if (this.failed.has(input.uploadId)) {
      return Promise.resolve('already_applied' as const);
    }
    this.failed.add(input.uploadId);
    this.cleanupPending.add(input.uploadId);
    return Promise.resolve('applied' as const);
  }

  commitLegacyBridge(
    input: Parameters<CutoverRepository['commitLegacyBridge']>[0],
  ) {
    this.calls.push('commitLegacyBridge');
    if (this.bridges.has(input.uploadId)) {
      return Promise.resolve('already_applied' as const);
    }
    this.bridges.add(input.uploadId);
    this.cleanupPending.add(input.uploadId);
    return Promise.resolve('applied' as const);
  }

  assertPostMigrationSchema() {
    this.calls.push('assertPostMigrationSchema');
    return this.schemaReady
      ? Promise.resolve()
      : Promise.reject(new Error('post-migration schema preflight failed'));
  }

  ensureTemporaryCleanupPending(uploadId: string) {
    this.calls.push('ensureTemporaryCleanupPending');
    if (this.cleanupPending.has(uploadId)) {
      return Promise.resolve('pending' as const);
    }
    this.cleanupPending.add(uploadId);
    return Promise.resolve('pending' as const);
  }

  markTemporaryCleanupVerified(uploadId: string, verifiedAt: Date) {
    this.calls.push('markTemporaryCleanupVerified');
    if (!this.cleanupPending.has(uploadId)) {
      return Promise.reject(
        new Error('temporary cleanup was not durably pending'),
      );
    }
    this.failed.add(uploadId);
    expect(verifiedAt).toBeInstanceOf(Date);
    return Promise.resolve();
  }

  readAppliedState(uploadId: string) {
    this.calls.push('readAppliedState');
    if (this.bridges.has(uploadId)) {
      return Promise.resolve('bridged' as const);
    }
    if (this.failed.has(uploadId)) {
      return Promise.resolve('failed' as const);
    }
    return Promise.resolve(null);
  }
}

class MemoryObjects implements CutoverObjectStore {
  readonly calls: string[] = [];
  requirePendingFrom: MemoryRepository | null = null;
  readonly objects = new Map<
    string,
    { etag: string; bytes: number; mime: string; metadataSha256: string }
  >();

  head(objectKey: string) {
    this.calls.push(`head:${objectKey}`);
    return Promise.resolve(this.objects.get(objectKey) ?? null);
  }

  delete(objectKey: string, expectedEtag?: string) {
    if (
      this.requirePendingFrom !== null &&
      this.requirePendingFrom.cleanupPending.size === 0
    ) {
      return Promise.reject(
        new Error('object mutation happened before durable pending cleanup'),
      );
    }
    this.calls.push(`delete:${objectKey}:${expectedEtag ?? 'unconditional'}`);
    this.objects.delete(objectKey);
    return Promise.resolve();
  }
}

const backup = {
  receiptSha256: 'a'.repeat(64),
  approvalSha256: 'b'.repeat(64),
  receiptPathSha256: '7'.repeat(64),
  approvalPathSha256: '8'.repeat(64),
  databaseIdentitySha256: 'c'.repeat(64),
  backupSha256: 'd'.repeat(64),
  backupPathSha256: 'e'.repeat(64),
  quiescedAt: new Date('2026-07-20T21:00:00.000Z'),
};

describe('image upload cold-cutover service', () => {
  it('requires every polling gate and two all-zero snapshots at least 30 seconds apart', () => {
    expect(() =>
      assertTwoPollingSnapshots(
        cleanSnapshot(),
        cleanSnapshot(new Date('2026-07-21T00:00:30.000Z')),
      ),
    ).not.toThrow();
    expect(() =>
      assertPollingGate(cleanSnapshot(undefined, { activeUploads: 1 })),
    ).toThrow(/activeUploads/);
    expect(() =>
      assertPollingGate(
        cleanSnapshot(undefined, { invalidResponseHeadSettlement: 1 }),
      ),
    ).toThrow(/invalidResponseHeadSettlement/);
    expect(() =>
      assertTwoPollingSnapshots(
        cleanSnapshot(),
        cleanSnapshot(new Date('2026-07-21T00:00:29.999Z')),
      ),
    ).toThrow(/30-second/);
  });

  it('audits through read/head-only dependencies and emits no full object keys or ETags', async () => {
    const repository = new MemoryRepository([
      legacyRow(),
      legacyRow({
        id: '10000000-0000-4000-8000-000000000002',
        status: 'consumed',
        consumedAt: new Date('2026-07-20T22:30:00.000Z'),
        finalObjectKey: 'albums/private/committed.webp',
        image: {
          id: '30000000-0000-4000-8000-000000000001',
          albumId: '20000000-0000-4000-8000-000000000001',
          r2ObjectKey: 'albums/private/committed.webp',
        },
      }),
    ]);
    const objects = new MemoryObjects();
    const service = new ImageUploadCutoverService(repository, objects);

    const receipt = await service.audit({
      now: new Date('2026-07-21T00:00:30.000Z'),
      firstSnapshot: cleanSnapshot(),
      secondSnapshot: cleanSnapshot(new Date('2026-07-21T00:00:30.000Z')),
      backup,
      dispositions: [],
    });

    expect(receipt.rows.map((row) => row.classification)).toEqual([
      'legacy_pre_dispatch',
      'existing_image_authority',
    ]);
    expect(receipt.summary).toEqual({
      total: 2,
      legacyPreDispatch: 1,
      legacyDispatchEvidence: 0,
      existingImageAuthority: 1,
      ambiguous: 0,
      unresolvedAmbiguous: 0,
    });
    expect(repository.calls).toEqual(['readLegacyRows']);
    expect(objects.calls.every((call) => call.startsWith('head:'))).toBe(true);
    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain('uploads/private/source.webp');
    expect(serialized).not.toContain('albums/private/committed.webp');
    expect(serialized).not.toContain('"etag"');
    expect(receipt.canonicalSha256).toBe(canonicalReceiptSha256(receipt));
  });

  it('keeps consumed-without-Image and uncertain destination rows ambiguous', async () => {
    const repository = new MemoryRepository([
      legacyRow({
        status: 'consumed',
        consumedAt: new Date('2026-07-20T22:30:00.000Z'),
      }),
    ]);
    const objects = new MemoryObjects();
    objects.objects.set('albums/private/final.webp', {
      etag: '0123456789abcdef0123456789abcdef',
      bytes: 123,
      mime: 'image/webp',
      metadataSha256: 'f'.repeat(64),
    });
    const service = new ImageUploadCutoverService(repository, objects);
    const receipt = await service.audit({
      now: new Date('2026-07-21T00:00:30.000Z'),
      firstSnapshot: cleanSnapshot(),
      secondSnapshot: cleanSnapshot(new Date('2026-07-21T00:00:30.000Z')),
      backup,
      dispositions: [],
    });
    expect(receipt.rows[0].classification).toBe('legacy_ambiguous');
    expect(receipt.summary.unresolvedAmbiguous).toBe(1);
  });

  it('binds one protected disposition decision to one ambiguous row and exact evidence', async () => {
    const repository = new MemoryRepository([
      legacyRow({
        status: 'consumed',
        consumedAt: new Date('2026-07-20T22:30:00.000Z'),
      }),
    ]);
    const service = new ImageUploadCutoverService(
      repository,
      new MemoryObjects(),
    );
    const audit = await service.audit({
      now: new Date('2026-07-21T00:00:30.000Z'),
      firstSnapshot: cleanSnapshot(),
      secondSnapshot: cleanSnapshot(new Date('2026-07-21T00:00:30.000Z')),
      backup,
      dispositions: [],
    });
    const row = audit.rows[0];
    const disposition = service.createDisposition({
      auditReceipt: audit,
      uploadId: row.uploadId,
      decision: 'cleanup_authorized',
      auditReceiptPathSha256: audit.receiptPathSha256,
      auditReceiptDigestSha256: '7'.repeat(64),
      evidenceReceiptPathSha256: '8'.repeat(64),
      evidenceReceiptSha256: '9'.repeat(64),
      evidenceCanonicalSha256: 'a'.repeat(64),
      evidenceRowSha256: row.rowEvidenceSha256,
      operatorFingerprint: operatorFingerprint(
        'operator-token-with-meaningful-entropy',
      ),
      operatorToken: 'operator-token-with-meaningful-entropy',
      now: new Date('2026-07-21T00:01:00.000Z'),
    });
    expect(disposition.auditReceiptSha256).toBe(audit.canonicalSha256);
    expect(disposition.decision).toBe('cleanup_authorized');
    expect(() =>
      service.createDisposition({
        auditReceipt: audit,
        uploadId: row.uploadId,
        decision: 'cleanup_authorized',
        auditReceiptPathSha256: audit.receiptPathSha256,
        auditReceiptDigestSha256: '7'.repeat(64),
        evidenceReceiptPathSha256: '8'.repeat(64),
        evidenceReceiptSha256: '9'.repeat(64),
        evidenceCanonicalSha256: 'a'.repeat(64),
        evidenceRowSha256: '8'.repeat(64),
        operatorFingerprint: operatorFingerprint(
          'operator-token-with-meaningful-entropy',
        ),
        operatorToken: 'operator-token-with-meaningful-entropy',
        now: new Date('2026-07-21T00:01:00.000Z'),
      }),
    ).toThrow(/drift/);
    expect(() =>
      service.createDisposition({
        auditReceipt: audit,
        uploadId: '10000000-0000-4000-8000-000000000099',
        decision: 'cleanup_authorized',
        auditReceiptPathSha256: audit.receiptPathSha256,
        auditReceiptDigestSha256: '7'.repeat(64),
        evidenceReceiptPathSha256: '8'.repeat(64),
        evidenceReceiptSha256: '9'.repeat(64),
        evidenceCanonicalSha256: 'a'.repeat(64),
        evidenceRowSha256: row.rowEvidenceSha256,
        operatorFingerprint: operatorFingerprint(
          'operator-token-with-meaningful-entropy',
        ),
        operatorToken: 'operator-token-with-meaningful-entropy',
        now: new Date('2026-07-21T00:01:00.000Z'),
      }),
    ).toThrow(/cross-row/);
  });

  it('uses the canonical namespace and receipt binding for deterministic UUIDv5 tokens', () => {
    expect(
      deterministicCutoverLeaseToken(
        'f'.repeat(64),
        '10000000-0000-4000-8000-000000000001',
      ),
    ).toBe('057f315e-8909-57cc-bd55-28bc56afffae');
  });

  it('revalidates audit evidence, aborts pre-dispatch rows, and verifies temporary absence after expiry plus skew', async () => {
    const row = legacyRow();
    const repository = new MemoryRepository([row]);
    const objects = new MemoryObjects();
    objects.objects.set(row.uploadObjectKey, {
      etag: '0123456789abcdef0123456789abcdef',
      bytes: 123,
      mime: 'image/webp',
      metadataSha256: 'f'.repeat(64),
    });
    const service = new ImageUploadCutoverService(repository, objects);
    const audit = await service.audit({
      now: new Date('2026-07-21T00:00:30.000Z'),
      firstSnapshot: cleanSnapshot(),
      secondSnapshot: cleanSnapshot(new Date('2026-07-21T00:00:30.000Z')),
      backup,
      dispositions: [],
    });
    const approval = service.approve(audit, 'operator-fingerprint');

    const first = await service.apply({
      now: new Date('2026-07-21T00:01:00.000Z'),
      receipt: audit,
      approval,
      backup,
      dispositions: [],
      presignClockSkewSeconds: 60,
    });
    const restarted = await service.apply({
      now: new Date('2026-07-21T00:02:00.000Z'),
      receipt: audit,
      approval,
      backup,
      dispositions: [],
      presignClockSkewSeconds: 60,
    });

    expect(first).toEqual({ failed: 1, bridged: 0, preserved: 0, cleaned: 1 });
    expect(restarted).toEqual({
      failed: 0,
      bridged: 0,
      preserved: 0,
      cleaned: 1,
    });
    const deleteIndex = objects.calls.indexOf(
      `delete:${row.uploadObjectKey}:0123456789abcdef0123456789abcdef`,
    );
    expect(deleteIndex).toBeGreaterThanOrEqual(0);
    expect(objects.calls[deleteIndex + 1]).toBe(`head:${row.uploadObjectKey}`);
    expect(repository.calls).not.toContain('commitLegacyBridge');
  });

  it('blocks apply before any mutation when audit evidence drifts or ambiguity remains', async () => {
    const row = legacyRow({
      status: 'consumed',
      consumedAt: new Date('2026-07-20T22:30:00.000Z'),
    });
    const repository = new MemoryRepository([row]);
    const objects = new MemoryObjects();
    const service = new ImageUploadCutoverService(repository, objects);
    const audit = await service.audit({
      now: new Date('2026-07-21T00:00:30.000Z'),
      firstSnapshot: cleanSnapshot(),
      secondSnapshot: cleanSnapshot(new Date('2026-07-21T00:00:30.000Z')),
      backup,
      dispositions: [],
    });
    await expect(
      service.apply({
        now: new Date('2026-07-21T00:02:00.000Z'),
        receipt: audit,
        approval: service.approve(audit, 'operator-fingerprint'),
        backup,
        dispositions: [],
        presignClockSkewSeconds: 60,
      }),
    ).rejects.toThrow(/ambiguous/);
    expect(repository.calls).not.toContain('failLegacyUpload');
    expect(repository.calls).not.toContain('commitLegacyBridge');
  });

  it('creates a legacy bridge only when dispatch evidence has exact pre-existing Image authority', async () => {
    const row = legacyRow({
      status: 'finalizing',
      sourceEtag: '0123456789abcdef0123456789abcdef',
      finalizationStartedAt: new Date('2026-07-20T22:30:00.000Z'),
      image: {
        id: '30000000-0000-4000-8000-000000000001',
        albumId: '20000000-0000-4000-8000-000000000001',
        r2ObjectKey: 'albums/private/final.webp',
      },
    });
    const repository = new MemoryRepository([row]);
    const objects = new MemoryObjects();
    objects.objects.set(row.finalObjectKey, {
      etag: row.sourceEtag,
      bytes: row.fileSize,
      mime: row.contentType,
      metadataSha256: 'f'.repeat(64),
    });
    const service = new ImageUploadCutoverService(repository, objects);
    const audit = await service.audit({
      now: new Date('2026-07-21T00:00:30.000Z'),
      firstSnapshot: cleanSnapshot(),
      secondSnapshot: cleanSnapshot(new Date('2026-07-21T00:00:30.000Z')),
      backup,
      dispositions: [],
    });
    expect(audit.rows[0].classification).toBe('existing_image_authority');

    const result = await service.apply({
      now: new Date('2026-07-21T00:02:00.000Z'),
      receipt: audit,
      approval: service.approve(audit, 'operator-fingerprint'),
      backup,
      dispositions: [],
      presignClockSkewSeconds: 60,
    });
    expect(result.bridged).toBe(1);
    expect(repository.calls).toContain('commitLegacyBridge');
  });

  it('never bridges dispatch evidence without an exact pre-existing Image authority', async () => {
    const row = legacyRow({
      status: 'finalizing',
      sourceEtag: '0123456789abcdef0123456789abcdef',
      finalizationStartedAt: new Date('2026-07-20T22:30:00.000Z'),
    });
    const repository = new MemoryRepository([row]);
    const objects = new MemoryObjects();
    objects.objects.set(row.finalObjectKey, {
      etag: row.sourceEtag,
      bytes: row.fileSize,
      mime: row.contentType,
      metadataSha256: 'f'.repeat(64),
    });
    const service = new ImageUploadCutoverService(repository, objects);
    const audit = await service.audit({
      now: new Date('2026-07-21T00:00:30.000Z'),
      firstSnapshot: cleanSnapshot(),
      secondSnapshot: cleanSnapshot(new Date('2026-07-21T00:00:30.000Z')),
      backup,
      dispositions: [],
    });

    await expect(
      service.apply({
        now: new Date('2026-07-21T00:02:00.000Z'),
        receipt: audit,
        approval: service.approve(audit, 'a'.repeat(64)),
        backup,
        dispositions: [],
        presignClockSkewSeconds: 60,
      }),
    ).rejects.toThrow(/pre-existing Image authority/);
    expect(repository.calls).not.toContain('commitLegacyBridge');
  });

  it('runs post-migration schema preflight before any object mutation', async () => {
    const row = legacyRow();
    const repository = new MemoryRepository([row]);
    repository.schemaReady = false;
    const objects = new MemoryObjects();
    objects.objects.set(row.uploadObjectKey, {
      etag: '0123456789abcdef0123456789abcdef',
      bytes: row.fileSize,
      mime: row.contentType,
      metadataSha256: 'f'.repeat(64),
    });
    const service = new ImageUploadCutoverService(repository, objects);
    const audit = await service.audit({
      now: new Date('2026-07-21T00:00:30.000Z'),
      firstSnapshot: cleanSnapshot(),
      secondSnapshot: cleanSnapshot(new Date('2026-07-21T00:00:30.000Z')),
      backup,
      dispositions: [],
    });

    await expect(
      service.apply({
        now: new Date('2026-07-21T00:02:00.000Z'),
        receipt: audit,
        approval: service.approve(audit, 'a'.repeat(64)),
        backup,
        dispositions: [],
        presignClockSkewSeconds: 60,
      }),
    ).rejects.toThrow(/post-migration schema preflight/);
    expect(objects.calls.some((call) => call.startsWith('delete:'))).toBe(
      false,
    );
  });

  it('cryptographically binds disposition authority to exact audit/evidence paths and digests', async () => {
    const repository = new MemoryRepository([
      legacyRow({
        status: 'consumed',
        consumedAt: new Date('2026-07-20T22:30:00.000Z'),
      }),
    ]);
    const service = new ImageUploadCutoverService(
      repository,
      new MemoryObjects(),
    );
    const audit = await service.audit({
      now: new Date('2026-07-21T00:00:30.000Z'),
      firstSnapshot: cleanSnapshot(),
      secondSnapshot: cleanSnapshot(new Date('2026-07-21T00:00:30.000Z')),
      backup,
      dispositions: [],
    });
    const row = audit.rows[0];
    const operatorToken = 'operator-token-with-meaningful-entropy';
    const disposition = service.createDisposition({
      auditReceipt: audit,
      uploadId: row.uploadId,
      decision: 'cleanup_authorized',
      auditReceiptPathSha256: audit.receiptPathSha256,
      auditReceiptDigestSha256: '2'.repeat(64),
      evidenceReceiptPathSha256: '3'.repeat(64),
      evidenceReceiptSha256: '4'.repeat(64),
      evidenceCanonicalSha256: '5'.repeat(64),
      evidenceRowSha256: row.rowEvidenceSha256,
      operatorFingerprint: operatorFingerprint(operatorToken),
      operatorToken,
      now: new Date('2026-07-21T00:01:00.000Z'),
    });

    expect(disposition).toEqual(
      expect.objectContaining({
        auditReceiptPathSha256: audit.receiptPathSha256,
        auditReceiptDigestSha256: '2'.repeat(64),
        evidenceReceiptPathSha256: '3'.repeat(64),
        evidenceReceiptSha256: '4'.repeat(64),
        evidenceCanonicalSha256: '5'.repeat(64),
        operatorIdentityFingerprint: operatorFingerprint(operatorToken),
      }),
    );
    expect(disposition.approvalDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(disposition.approvalSignature).toMatch(/^[a-f0-9]{64}$/);

    const forgedDraft = {
      ...disposition,
      auditReceiptPathSha256: '7'.repeat(64),
    };
    const forged = {
      ...forgedDraft,
      canonicalSha256: canonicalReceiptSha256(forgedDraft),
    };
    await expect(
      service.audit({
        now: new Date('2026-07-21T00:02:00.000Z'),
        firstSnapshot: cleanSnapshot(),
        secondSnapshot: cleanSnapshot(new Date('2026-07-21T00:00:30.000Z')),
        backup,
        dispositions: [forged],
        operatorToken,
      }),
    ).rejects.toThrow(/signature|authorization/);
  });

  it('rejects meaningless operator identity when authorizing a disposition', async () => {
    const repository = new MemoryRepository([
      legacyRow({
        status: 'consumed',
        consumedAt: new Date('2026-07-20T22:30:00.000Z'),
      }),
    ]);
    const service = new ImageUploadCutoverService(
      repository,
      new MemoryObjects(),
    );
    const audit = await service.audit({
      now: new Date('2026-07-21T00:00:30.000Z'),
      firstSnapshot: cleanSnapshot(),
      secondSnapshot: cleanSnapshot(new Date('2026-07-21T00:00:30.000Z')),
      backup,
      dispositions: [],
    });
    expect(() =>
      service.createDisposition({
        auditReceipt: audit,
        uploadId: audit.rows[0].uploadId,
        decision: 'cleanup_authorized',
        auditReceiptPathSha256: audit.receiptPathSha256,
        auditReceiptDigestSha256: '2'.repeat(64),
        evidenceReceiptPathSha256: '3'.repeat(64),
        evidenceReceiptSha256: '4'.repeat(64),
        evidenceCanonicalSha256: '5'.repeat(64),
        evidenceRowSha256: audit.rows[0].rowEvidenceSha256,
        operatorFingerprint: 'f'.repeat(64),
        operatorToken: 'operator-token-with-meaningful-entropy',
        now: new Date('2026-07-21T00:01:00.000Z'),
      }),
    ).toThrow(/operator identity/);
  });

  it('skips DELETE when audit proves the temporary source is already absent', async () => {
    const row = legacyRow();
    const repository = new MemoryRepository([row]);
    const objects = new MemoryObjects();
    const service = new ImageUploadCutoverService(repository, objects);
    const audit = await service.audit({
      now: new Date('2026-07-21T00:00:30.000Z'),
      firstSnapshot: cleanSnapshot(),
      secondSnapshot: cleanSnapshot(new Date('2026-07-21T00:00:30.000Z')),
      backup,
      dispositions: [],
    });

    await service.apply({
      now: new Date('2026-07-21T00:02:00.000Z'),
      receipt: audit,
      approval: service.approve(audit, 'a'.repeat(64)),
      backup,
      dispositions: [],
      presignClockSkewSeconds: 60,
    });

    expect(
      objects.calls.some((call) =>
        call.startsWith(`delete:${row.uploadObjectKey}`),
      ),
    ).toBe(false);
    expect(objects.calls).toContain(`head:${row.uploadObjectKey}`);
  });

  it('durably marks retained existing-Image rows pending before temporary deletion', async () => {
    const row = legacyRow({
      status: 'consumed',
      consumedAt: new Date('2026-07-20T22:30:00.000Z'),
      image: {
        id: '30000000-0000-4000-8000-000000000001',
        albumId: '20000000-0000-4000-8000-000000000001',
        r2ObjectKey: 'albums/private/final.webp',
      },
    });
    const repository = new MemoryRepository([row]);
    const objects = new MemoryObjects();
    objects.requirePendingFrom = repository;
    objects.objects.set(row.uploadObjectKey, {
      etag: '0123456789abcdef0123456789abcdef',
      bytes: row.fileSize,
      mime: row.contentType,
      metadataSha256: 'f'.repeat(64),
    });
    const service = new ImageUploadCutoverService(repository, objects);
    const audit = await service.audit({
      now: new Date('2026-07-21T00:00:30.000Z'),
      firstSnapshot: cleanSnapshot(),
      secondSnapshot: cleanSnapshot(new Date('2026-07-21T00:00:30.000Z')),
      backup,
      dispositions: [],
    });

    await expect(
      service.apply({
        now: new Date('2026-07-21T00:02:00.000Z'),
        receipt: audit,
        approval: service.approve(audit, 'a'.repeat(64)),
        backup,
        dispositions: [],
        presignClockSkewSeconds: 60,
      }),
    ).resolves.toEqual({
      failed: 0,
      bridged: 0,
      preserved: 1,
      cleaned: 1,
    });
    const pendingIndex = repository.calls.indexOf(
      'ensureTemporaryCleanupPending',
    );
    const deleteIndex = objects.calls.findIndex((call) =>
      call.startsWith(`delete:${row.uploadObjectKey}`),
    );
    expect(pendingIndex).toBeGreaterThanOrEqual(0);
    expect(deleteIndex).toBeGreaterThanOrEqual(0);
    expect(repository.calls).toContain('markTemporaryCleanupVerified');
  });
});
