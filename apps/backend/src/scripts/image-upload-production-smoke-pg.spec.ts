import {
  ProductionSmokePgAdapter,
  type ProductionSmokePgBinding,
  type ProductionSmokePgClient,
} from './image-upload-production-smoke-pg';

const BINDING: ProductionSmokePgBinding = {
  uploadId: 'upload-owned',
  adminId: 'admin-owned',
  clientRequestId: 'request-owned',
  promotionId: 'promotion-owned',
  sourceObjectKey: 'uploads/upload-owned/smoke.webp',
  destinationObjectKey: 'albums/album-owned/smoke.webp',
  releaseFingerprint: `sha256:${'a'.repeat(64)}`,
  runStartedAt: '2026-07-23T08:00:00.000Z',
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    uploadId: BINDING.uploadId,
    adminId: BINDING.adminId,
    clientRequestId: BINDING.clientRequestId,
    uploadCreatedAt: new Date('2026-07-23T08:00:01.000Z'),
    createdInRun: true,
    promotionId: BINDING.promotionId,
    sourceObjectKey: BINDING.sourceObjectKey,
    destinationObjectKey: BINDING.destinationObjectKey,
    ...overrides,
  };
}

function harness(
  selected = row(),
  rateRows: readonly Record<string, unknown>[] = [],
) {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const client: ProductionSmokePgClient = {
    query: jest.fn(async (text: string, values?: readonly unknown[]) => {
      queries.push({ text, values });
      if (text.includes('FOR UPDATE')) return { rows: [selected], rowCount: 1 };
      if (text.includes('FROM "ImageUpload"')) {
        return {
          rows: [
            {
              albumId: 'album-owned',
              sourceObjectKey: BINDING.sourceObjectKey,
              destinationObjectKey: BINDING.destinationObjectKey,
              contentType: 'image/webp',
              fileSize: 24,
              processedSha256: 'a'.repeat(64),
              createdAt: new Date('2026-07-23T08:00:01.000Z'),
            },
          ],
          rowCount: 1,
        };
      }
      if (text.includes('ImageUploadRateLimitEvent')) {
        return { rows: rateRows, rowCount: rateRows.length };
      }
      return { rows: [], rowCount: 1 };
    }),
    release: jest.fn(),
  };
  const pool = { connect: jest.fn().mockResolvedValue(client) };
  return {
    adapter: new ProductionSmokePgAdapter(pool, BINDING.releaseFingerprint),
    queries,
  };
}

describe('ProductionSmokePgAdapter', () => {
  it.each([
    ['adminId', 'foreign-admin'],
    ['clientRequestId', 'foreign-request'],
    ['promotionId', 'foreign-promotion'],
    ['sourceObjectKey', 'uploads/foreign/source.webp'],
    ['destinationObjectKey', 'albums/foreign/destination.webp'],
    ['createdInRun', false],
  ])('rejects a locked row with changed %s', async (field, changed) => {
    const { adapter, queries } = harness(row({ [field]: changed }));

    await expect(adapter.prepareResponseLoss(BINDING)).rejects.toThrow(
      'production smoke PostgreSQL ownership precondition failed',
    );

    expect(queries.filter((query) => /^\s*UPDATE/i.test(query.text))).toEqual(
      [],
    );
  });

  it('rejects release fingerprint drift before opening a transaction', async () => {
    const { adapter, queries } = harness();
    await expect(
      adapter.prepareResponseLoss({
        ...BINDING,
        releaseFingerprint: `sha256:${'b'.repeat(64)}`,
      }),
    ).rejects.toThrow('production smoke release fingerprint drift');
    expect(queries).toEqual([]);
  });

  it('uses a locked exact-id precondition before response-loss mutation', async () => {
    const { adapter, queries } = harness();
    await adapter.prepareResponseLoss(BINDING);

    expect(
      queries.map((query) => query.text.trim().split(/\s+/, 1)[0]),
    ).toEqual(['BEGIN', 'SELECT', 'UPDATE', 'COMMIT']);
    expect(queries[1].text).toContain('FOR UPDATE');
    expect(queries[1].values).toEqual([
      BINDING.uploadId,
      BINDING.promotionId,
      BINDING.runStartedAt,
    ]);
    expect(queries[2].text).toContain(`"copyState" = 'dispatched'`);
    expect(queries[2].text).toContain(`"disposition" = 'pending'`);
    expect(queries[2].text).not.toMatch(/\bLIKE\b/i);
  });

  it('expires the presign window before making failed cleanup due', async () => {
    const { adapter, queries } = harness();

    await adapter.makeFailedCleanupDue(BINDING);

    expect(
      queries.map((query) => query.text.trim().split(/\s+/, 1)[0]),
    ).toEqual(['BEGIN', 'SELECT', 'UPDATE', 'COMMIT']);
    expect(queries[2].text).toContain(
      `"presignExpiresAt" = CURRENT_TIMESTAMP - INTERVAL '10 minutes'`,
    );
    expect(queries[2].text).toContain(
      `"expiresAt" = CURRENT_TIMESTAMP - INTERVAL '10 minutes'`,
    );
    expect(queries[2].text).toContain(
      `"temporaryCleanupNextAttemptAt" = CURRENT_TIMESTAMP`,
    );
  });

  it('uses only exact journal ids for cleanup and never prefix LIKE deletion', async () => {
    const { adapter, queries } = harness();
    await adapter.cleanup({
      resources: [
        { kind: 'conflict', id: 'conflict-owned' },
        { kind: 'promotion', id: 'promotion-owned' },
        { kind: 'deletion', id: 'deletion-owned' },
        { kind: 'image', id: 'image-owned' },
        { kind: 'upload', id: 'upload-owned' },
        {
          kind: 'object',
          id: 'source-owned',
          objectKey: 'uploads/upload-owned/smoke.webp',
        },
      ],
    });

    const sql = queries.map((query) => query.text).join('\n');
    expect(sql).not.toMatch(/\bLIKE\b/i);
    expect(sql).not.toContain('ImageUploadRateLimitEvent');
    expect(sql).toContain('RETURNING "albumId"');
    expect(sql).toContain('"imageCount" = GREATEST("imageCount" - 1, 0)');
    expect(queries.flatMap((query) => query.values ?? [])).not.toContain(
      'uploads/%',
    );
  });

  it('does not select or persist policy fields for smoke-owned uploads and promotions', async () => {
    const { adapter, queries } = harness();

    await adapter.inspectOwnedPendingUpload({
      uploadId: BINDING.uploadId,
      adminId: BINDING.adminId,
      clientRequestId: BINDING.clientRequestId,
      runStartedAt: BINDING.runStartedAt,
      releaseFingerprint: BINDING.releaseFingerprint,
    });
    await adapter.prepareDispatchedPromotion(BINDING, {
      sourceEtag: 'source-etag',
      inspectedSha256: 'a'.repeat(64),
      inspectedByteSize: 24,
      canonicalMime: 'image/webp',
      inspectedWidth: 2,
      inspectedHeight: 2,
      accountId: 'account-owned',
      bucket: 'bucket-owned',
      leaseToken: '00000000-0000-4000-8000-000000000005',
      dispatchedAt: '2026-07-23T08:00:03.000Z',
      nextReconcileAt: '2026-07-23T08:00:33.000Z',
    });

    const sql = queries.map((query) => query.text).join('\n');
    expect(sql).not.toContain('policyVersion');
    expect(sql).not.toContain('policySnapshot');
  });

  it('refuses to start when the full run would exceed a route limit', async () => {
    const { adapter } = harness(row(), [
      { routeScope: 'upload_url', count: 12 },
      { routeScope: 'confirm_upload', count: 0 },
      { routeScope: 'upload_status', count: 0 },
    ]);

    await expect(
      adapter.assertRateLimitCapacity('admin-owned', {
        upload_url: 9,
        confirm_upload: 1,
        upload_status: 60,
      }),
    ).rejects.toThrow('production smoke rate-limit capacity is insufficient');
  });
});
