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

function harness(selected = row()) {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const client: ProductionSmokePgClient = {
    query: jest.fn(async (text: string, values?: readonly unknown[]) => {
      queries.push({ text, values });
      if (text.includes('FOR UPDATE')) return { rows: [selected], rowCount: 1 };
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
    expect(queries.flatMap((query) => query.values ?? [])).not.toContain(
      'uploads/%',
    );
  });
});
