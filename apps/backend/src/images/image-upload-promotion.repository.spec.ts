import { createHash } from 'node:crypto';
import { ImageUploadPromotionRepository } from './image-upload-promotion.repository';

function prismaHarness() {
  const promotion = {
    create: jest.fn(async ({ data }: { data: unknown }) => data),
    findUnique: jest.fn(),
    updateMany: jest.fn(async (_args: unknown) => ({ count: 1 })),
    update: jest.fn(),
  };
  const quarantine = {
    upsert: jest.fn(async ({ create }: { create: unknown }) => create),
    findUnique: jest.fn(),
    updateMany: jest.fn(async () => ({ count: 1 })),
  };
  const tx = {
    imageUploadPromotion: promotion,
    imageUploadPromotionConflict: {
      upsert: jest.fn(async ({ create }: { create: unknown }) => create),
      findUnique: jest.fn(),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    imageUploadProviderEventQuarantine: quarantine,
    imageUploadProviderEventQuarantineLocation: {
      create: jest.fn(),
    },
    imageUploadProviderEventQuarantineAction: {
      create: jest.fn(),
      count: jest.fn(async () => 0),
    },
    imageUploadProviderEventQuarantineResolution: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    image: {
      findFirst: jest.fn(),
      create: jest.fn(),
      count: jest.fn(async () => 0),
    },
    imageUpload: {
      updateMany: jest.fn(async () => ({ count: 1 })),
      findUnique: jest.fn(),
    },
    imageUploadIdempotency: {
      updateMany: jest.fn(async () => ({ count: 1 })),
      findUnique: jest.fn(),
    },
    imageObjectDeletion: {
      findFirst: jest.fn(),
    },
    album: {
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn(async (work: (client: typeof tx) => unknown) =>
      work(tx),
    ),
  };
  return { prisma, tx, promotion, quarantine };
}

const currentInput = {
  uploadId: 'upload-1',
  albumId: 'album-1',
  finalizationLeaseToken: '11111111-1111-4111-8111-111111111111',
  accountId: 'account',
  bucket: 'bucket',
  sourceObjectKey: 'uploads/upload-1/photo.webp',
  sourceEtag: 'abc123',
  destinationObjectKey: 'albums/album-1/photo.webp',
  inspectedSha256: 'a'.repeat(64),
  inspectedByteSize: 1024,
  canonicalMime: 'image/webp' as const,
  inspectedWidth: 640,
  inspectedHeight: 480,
  policyVersion: 'web-v1-hash',
  now: new Date('2026-07-19T00:00:00.000Z'),
  eventGraceMs: 30_000,
};

describe('ImageUploadPromotionRepository', () => {
  it('creates one complete current dispatch record before provider work can begin', async () => {
    const { prisma, promotion } = prismaHarness();
    const repository = new ImageUploadPromotionRepository(prisma as never);
    let providerStarted = false;

    const record = await repository.createDispatchedPromotion(currentInput);
    providerStarted = true;

    expect(providerStarted).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(promotion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        uploadId: currentInput.uploadId,
        origin: 'current',
        copyState: 'dispatched',
        disposition: 'pending',
        sourceEtag: 'abc123',
        copyDispatchedAt: currentInput.now,
        lastDispatchAttemptAt: currentInput.now,
        nextReconcileAt: new Date('2026-07-19T00:00:30.000Z'),
        dispatchAttempts: 1,
      }),
    });
    expect(record).toEqual(expect.objectContaining({ uploadId: 'upload-1' }));
  });

  it.each([
    ['sourceEtag', null],
    ['inspectedSha256', ''],
    ['inspectedByteSize', 0],
    ['canonicalMime', null],
    ['inspectedWidth', 0],
    ['inspectedHeight', 0],
    ['policyVersion', ''],
    ['eventGraceMs', 0],
  ] as const)('rejects a current dispatch missing %s', async (field, value) => {
    const { prisma, promotion } = prismaHarness();
    const repository = new ImageUploadPromotionRepository(prisma as never);

    await expect(
      repository.createDispatchedPromotion({
        ...currentInput,
        [field]: value,
      } as never),
    ).rejects.toThrow();
    expect(promotion.create).not.toHaveBeenCalled();
  });

  it('rejects quoted, weak, or control-character source ETags without case-folding', async () => {
    for (const sourceEtag of ['"abc123"', 'W/abc123', 'abc\n123']) {
      const { prisma } = prismaHarness();
      const repository = new ImageUploadPromotionRepository(prisma as never);
      await expect(
        repository.createDispatchedPromotion({
          ...currentInput,
          sourceEtag,
        }),
      ).rejects.toThrow();
    }
  });

  it('uses stable provider-event and relocation-stable fallback quarantine fingerprints', async () => {
    const { prisma, quarantine } = prismaHarness();
    const repository = new ImageUploadPromotionRepository(prisma as never);

    await repository.openProviderEventQuarantine({
      providerEventId: 'provider-event',
      messageId: 'ephemeral-a',
      sourceQueueId: 'source',
      currentQueueId: 'source',
      leaseId: 'lease-a',
      leaseDeadline: currentInput.now,
      attempts: 1,
      rawBody: '{"event":true}',
      eventEnvelope: { event: true },
      reason: 'unmatched_event',
      observedAt: currentInput.now,
    });
    expect(quarantine.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          quarantineFingerprintSha256: createHash('sha256')
            .update('{"providerEventId":"provider-event"}')
            .digest('hex'),
        },
      }),
    );

    await repository.openProviderEventQuarantine({
      providerEventId: null,
      messageId: 'ephemeral-b',
      sourceQueueId: 'source',
      currentQueueId: 'dlq',
      leaseId: 'lease-b',
      leaseDeadline: currentInput.now,
      attempts: 2,
      rawBody: 'malformed',
      eventEnvelope: null,
      reason: 'malformed_event',
      observedAt: currentInput.now,
    });
    const bodySha256 = createHash('sha256').update('malformed').digest('hex');
    expect(quarantine.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          quarantineFingerprintSha256: createHash('sha256')
            .update(`{"bodySha256":"${bodySha256}","sourceQueueId":"source"}`)
            .digest('hex'),
        },
      }),
    );
    expect(quarantine.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          latestLocationObservationSha256:
            expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      }),
    );
  });

  it('hashes parseable provider envelopes canonically across key order', async () => {
    const { prisma, quarantine } = prismaHarness();
    const repository = new ImageUploadPromotionRepository(prisma as never);
    const base = {
      messageId: 'message',
      sourceQueueId: 'source',
      currentQueueId: 'source',
      leaseId: 'lease',
      leaseDeadline: currentInput.now,
      attempts: 1,
      rawBody: '{"valid":true}',
      reason: 'unmatched_event' as const,
      observedAt: currentInput.now,
    };

    await repository.openProviderEventQuarantine({
      ...base,
      providerEventId: 'event-a',
      eventEnvelope: { z: 1, a: { y: 2, b: 3 } },
    });
    await repository.openProviderEventQuarantine({
      ...base,
      providerEventId: 'event-b',
      eventEnvelope: { a: { b: 3, y: 2 }, z: 1 },
    });

    const first = quarantine.upsert.mock.calls[0][0].create as {
      eventEnvelopeSha256: string;
    };
    const second = quarantine.upsert.mock.calls[1][0].create as {
      eventEnvelopeSha256: string;
    };
    expect(first.eventEnvelopeSha256).toBe(second.eventEnvelopeSha256);
  });

  it('requires two ordered destination absences and a mismatching source before rejection', async () => {
    const { prisma, promotion } = prismaHarness();
    const repository = new ImageUploadPromotionRepository(prisma as never);
    const first = new Date('2026-07-19T00:00:00.000Z');
    const second = new Date('2026-07-19T00:00:30.000Z');

    await expect(
      repository.markDispatchRejectedNotCreated({
        uploadId: 'upload-1',
        createdByAdminId: 'admin-1',
        finalizationLeaseToken: currentInput.finalizationLeaseToken,
        sourceEtag: currentInput.sourceEtag,
        observedSourceEtag: currentInput.sourceEtag,
        reason: 'source_etag_mismatch',
        firstDestinationAbsentAt: first,
        destinationAbsentVerifiedAt: second,
        visibilityTimeoutMs: 30_000,
        now: second,
      }),
    ).rejects.toThrow();
    expect(promotion.updateMany).not.toHaveBeenCalled();
  });

  it('settles an exact CopyObject response and commits without inventing event fields', async () => {
    const { prisma, tx, promotion } = prismaHarness();
    const repository = new ImageUploadPromotionRepository(prisma as never);
    promotion.findUnique.mockResolvedValue({
      uploadId: 'upload-1',
      finalizationLeaseToken: currentInput.finalizationLeaseToken,
      copyState: 'dispatched',
      providerObjectEtag: null,
    });
    tx.image.create.mockResolvedValue({ id: 'image-1' });

    await repository.settleCopyResponseAndCommit({
      uploadId: 'upload-1',
      createdByAdminId: 'admin-1',
      finalizationLeaseToken: currentInput.finalizationLeaseToken,
      copyResponseEtag: 'etag-response',
      observedAt: currentInput.now,
      image: {
        id: 'image-1',
        albumId: 'album-1',
        filename: 'photo.webp',
        r2ObjectKey: currentInput.destinationObjectKey,
        width: 640,
        height: 480,
        fileSizeBytes: 1024,
        thumbnailUrl: 'thumbnail',
        smallUrl: 'small',
        mediumUrl: 'medium',
        largeUrl: 'large',
        xlargeUrl: 'xlarge',
        orderIndex: 1,
      },
      resultRetentionExpiresAt: new Date('2026-08-18T00:00:00.000Z'),
      temporaryCleanupNextAttemptAt: currentInput.now,
    });

    expect(promotion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          copyState: 'provider_settled',
          disposition: 'committed',
          copyResponseEtag: 'etag-response',
        }),
      }),
    );
    const update = (
      promotion.updateMany.mock.calls[0]![0] as {
        data: Record<string, unknown>;
      }
    ).data;
    expect(update.providerEventId).toBeUndefined();
    expect(update.providerEventObservedAt).toBeUndefined();
    expect(update.settlementSource).toBeUndefined();
    expect(tx.imageUpload.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'consumed',
          temporaryCleanupState: 'pending',
        }),
      }),
    );
  });

  it('attaches later exact Queue evidence to response-settled state', async () => {
    const { prisma, promotion } = prismaHarness();
    const repository = new ImageUploadPromotionRepository(prisma as never);
    promotion.findUnique.mockResolvedValue({
      uploadId: 'upload-1',
      finalizationLeaseToken: currentInput.finalizationLeaseToken,
      copyState: 'provider_settled',
      disposition: 'committed',
      copyResponseEtag: 'same-etag',
    });

    await repository.recordProviderSettlement({
      uploadId: 'upload-1',
      finalizationLeaseToken: currentInput.finalizationLeaseToken,
      providerEventId: 'event-1',
      providerEventObservedAt: currentInput.now,
      providerSettlementObservedAt: currentInput.now,
      settlementSource: 'r2_event',
      providerObjectEtag: 'same-etag',
    });

    expect(promotion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerEventId: 'event-1',
          providerObjectEtag: 'same-etag',
          copyState: 'provider_settled',
        }),
      }),
    );
  });

  it('opens a late-event conflict without mutating rejected promotion evidence', async () => {
    const { prisma, tx, promotion } = prismaHarness();
    const repository = new ImageUploadPromotionRepository(prisma as never);
    promotion.findUnique.mockResolvedValue({
      id: 'promotion-1',
      uploadId: 'upload-1',
      accountId: 'account',
      bucket: 'bucket',
      copyState: 'dispatch_rejected',
      disposition: 'not_created',
      dispatchRejectedAt: currentInput.now,
      dispatchRejectionReason: 'source_missing',
      dispatchRejectionObservedSourceEtag: null,
      firstDestinationAbsentAt: new Date('2026-07-18T23:59:00.000Z'),
      destinationAbsentVerifiedAt: currentInput.now,
    });

    await repository.recordProviderSettlement({
      uploadId: 'upload-1',
      finalizationLeaseToken: currentInput.finalizationLeaseToken,
      providerEventId: 'late-event',
      providerEventObservedAt: currentInput.now,
      providerSettlementObservedAt: currentInput.now,
      settlementSource: 'r2_event',
      providerObjectEtag: 'late-etag',
      eventEnvelopeSha256: 'b'.repeat(64),
      eventTime: currentInput.now,
      sourceObjectKeyHash: 'c'.repeat(64),
      destinationObjectKeyHash: 'd'.repeat(64),
    });

    expect(promotion.updateMany).not.toHaveBeenCalled();
    expect(tx.imageUploadPromotionConflict.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          providerEventId: 'late-event',
          rejectionEvidenceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          state: 'open',
        }),
      }),
    );
  });

  it('rejects late-conflict resolution when the immutable snapshot hash drifts', async () => {
    const { prisma, tx } = prismaHarness();
    const repository = new ImageUploadPromotionRepository(prisma as never);
    tx.imageUploadPromotionConflict.findUnique.mockResolvedValue({
      id: 'conflict-1',
      accountId: 'account',
      bucket: 'bucket',
      sourceObjectKeyHash: 'a'.repeat(64),
      destinationObjectKeyHash: 'b'.repeat(64),
      eventTime: currentInput.now,
      eventEnvelopeSha256: 'c'.repeat(64),
      providerObjectEtag: 'provider-etag',
      rejectionDispatchRejectedAt: currentInput.now,
      rejectionReason: 'source_missing',
      rejectionObservedSourceEtag: null,
      rejectionFirstDestinationAbsentAt: new Date('2026-07-18T23:59:00.000Z'),
      rejectionDestinationAbsentVerifiedAt: currentInput.now,
      rejectionEvidenceSha256: '0'.repeat(64),
      state: 'open',
    });

    await expect(
      repository.resolveLateEventConflict({
        id: 'conflict-1',
        expectedState: 'open',
        resolution: 'confirmed_absent_ack',
        operatorIdentityFingerprint: 'operator',
        approvalDigest: 'approval',
        resolvedAt: currentInput.now,
      }),
    ).rejects.toThrow('snapshot hash');
    expect(tx.imageUploadPromotionConflict.updateMany).not.toHaveBeenCalled();
  });

  it('requires an exact live Image before newly committing a promotion', async () => {
    const { prisma, tx, promotion } = prismaHarness();
    const repository = new ImageUploadPromotionRepository(prisma as never);
    tx.image.findFirst.mockResolvedValue(null);

    await expect(
      repository.markCommitted({
        uploadId: 'upload-1',
        finalizationLeaseToken: currentInput.finalizationLeaseToken,
        imageId: 'image-1',
        destinationObjectKey: currentInput.destinationObjectKey,
      }),
    ).rejects.toThrow();
    expect(promotion.updateMany).not.toHaveBeenCalled();
  });

  it('never transitions a committed promotion to cleanup-required', async () => {
    const { prisma, promotion } = prismaHarness();
    const repository = new ImageUploadPromotionRepository(prisma as never);
    promotion.findUnique.mockResolvedValue({
      uploadId: 'upload-1',
      finalizationLeaseToken: currentInput.finalizationLeaseToken,
      copyState: 'provider_settled',
      disposition: 'committed',
      committedResultImageId: 'image-1',
      destinationObjectKey: currentInput.destinationObjectKey,
    });

    await expect(
      repository.requireCleanup({
        uploadId: 'upload-1',
        finalizationLeaseToken: currentInput.finalizationLeaseToken,
      }),
    ).rejects.toThrow();
    expect(promotion.updateMany).not.toHaveBeenCalled();
  });

  it('finalizes quarantine from the durable begin snapshot, not caller-invented identity', async () => {
    const { prisma, tx, quarantine } = prismaHarness();
    const repository = new ImageUploadPromotionRepository(prisma as never);
    quarantine.findUnique.mockResolvedValue({
      id: 'quarantine-1',
      state: 'resolving',
      resolutionAttemptId: 'attempt-1',
      resolution: 'quarantined_ack',
      resolutionStartedAt: new Date('2026-07-19T00:00:00.000Z'),
      operatorIdentityFingerprint: 'operator-fingerprint',
      approvalDigest: 'approval-digest',
    });
    tx.imageUploadProviderEventQuarantineAction.count.mockResolvedValue(0);

    await repository.finalizeProviderEventQuarantineResolution({
      id: 'quarantine-1',
      resolutionAttemptId: 'attempt-1',
      resolution: 'quarantined_ack',
      acknowledgedLocationCount: 0,
      resolutionScanCompletedAt: new Date('2026-07-19T00:00:30.000Z'),
      acknowledgedAt: new Date('2026-07-19T00:00:31.000Z'),
      resolvedAt: new Date('2026-07-19T00:00:32.000Z'),
      resolutionEvidenceSha256: 'e'.repeat(64),
    });

    expect(
      tx.imageUploadProviderEventQuarantineResolution.create,
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({
        resolutionStartedAt: new Date('2026-07-19T00:00:00.000Z'),
        operatorIdentityFingerprint: 'operator-fingerprint',
        approvalDigest: 'approval-digest',
      }),
    });
  });

  it('atomically terminalizes upload and permanent idempotency after proven source rejection', async () => {
    const { prisma, tx, promotion } = prismaHarness();
    const repository = new ImageUploadPromotionRepository(prisma as never);
    promotion.findUnique.mockResolvedValue({
      uploadId: 'upload-1',
      finalizationLeaseToken: currentInput.finalizationLeaseToken,
      sourceEtag: currentInput.sourceEtag,
      destinationObjectKey: currentInput.destinationObjectKey,
      copyState: 'dispatched',
      disposition: 'pending',
      providerSettlementObservedAt: null,
      providerEventId: null,
      copyResponseObservedAt: null,
    });
    tx.image.findFirst.mockResolvedValue(null);

    await expect(
      repository.markDispatchRejectedNotCreated({
        uploadId: 'upload-1',
        createdByAdminId: 'admin-1',
        finalizationLeaseToken: currentInput.finalizationLeaseToken,
        sourceEtag: currentInput.sourceEtag,
        observedSourceEtag: null,
        reason: 'source_missing',
        firstDestinationAbsentAt: new Date('2026-07-18T23:59:30.000Z'),
        destinationAbsentVerifiedAt: currentInput.now,
        visibilityTimeoutMs: 30_000,
        now: currentInput.now,
      }),
    ).resolves.toBe(true);

    expect(tx.imageUpload.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'failed',
          failureCode: 'upload_dispatch_rejected',
          temporaryCleanupState: 'pending',
          resultRetentionExpiresAt: new Date('2026-08-18T00:00:00.000Z'),
        }),
      }),
    );
    expect(tx.imageUploadIdempotency.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          terminalOutcome: 'failed',
          failureCode: 'upload_dispatch_rejected',
          resultRetentionExpiresAt: new Date('2026-08-18T00:00:00.000Z'),
        }),
      }),
    );
  });

  it('exports only the closed promotion mutation surface', () => {
    expect(
      Object.getOwnPropertyNames(ImageUploadPromotionRepository.prototype)
        .filter((name) => name !== 'constructor')
        .sort(),
    ).toEqual(
      [
        'beginProviderEventQuarantineResolution',
        'createDispatchedPromotion',
        'finalizeProviderEventQuarantineResolution',
        'markCommitted',
        'markDispatchRejectedNotCreated',
        'markVerifiedDeleted',
        'openLateEventConflict',
        'openProviderEventQuarantine',
        'recordProviderSettlement',
        'reopenProviderEventQuarantineAfterReplay',
        'requireCleanup',
        'resolveLateEventConflict',
        'settleCopyResponseAndCommit',
      ].sort(),
    );
  });
});
