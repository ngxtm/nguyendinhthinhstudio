import { ImageUploadPromotionRepository } from './image-upload-promotion.repository';

function harness() {
  const promotion = {
    create: jest.fn(async ({ data }: { data: unknown }) => data),
    findUnique: jest.fn(),
    updateMany: jest.fn(async () => ({ count: 1 })),
  };
  const tx = {
    imageUploadPromotion: promotion,
    image: {
      create: jest.fn(async ({ data }: { data: { id: string } }) => data),
      findFirst: jest.fn(),
    },
    album: { updateMany: jest.fn(async () => ({ count: 1 })) },
    imageUpload: { updateMany: jest.fn(async () => ({ count: 1 })) },
    imageUploadIdempotency: {
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    imageUploadPromotionConflict: {
      upsert: jest.fn(async ({ create }: { create: unknown }) => create),
      findUnique: jest.fn(),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn(async (work: (client: typeof tx) => unknown) =>
      work(tx),
    ),
  };
  return { prisma, tx, promotion };
}

const base = {
  uploadId: 'upload-1',
  albumId: 'album-1',
  finalizationLeaseToken: '11111111-1111-4111-8111-111111111111',
  accountId: 'account',
  bucket: 'bucket',
  sourceObjectKey: 'uploads/upload-1/photo.webp',
  sourceEtag: 'source-etag',
  destinationObjectKey: 'albums/album-1/photo.webp',
  inspectedSha256: 'a'.repeat(64),
  inspectedByteSize: 1024,
  canonicalMime: 'image/webp' as const,
  inspectedWidth: 640,
  inspectedHeight: 480,
  now: new Date('2026-07-19T00:00:00.000Z'),
  reconcileGraceMs: 30_000,
};

const imageCommit = {
  uploadId: 'upload-1',
  createdByAdminId: 'admin-1',
  finalizationLeaseToken: base.finalizationLeaseToken,
  observedAt: base.now,
  image: {
    id: 'image-1',
    albumId: 'album-1',
    filename: 'photo.webp',
    r2ObjectKey: base.destinationObjectKey,
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
  temporaryCleanupNextAttemptAt: base.now,
};

describe('ImageUploadPromotionRepository', () => {
  it('schedules the first polling observation exactly 30 seconds after dispatch', async () => {
    const { prisma, promotion } = harness();
    const repository = new ImageUploadPromotionRepository(prisma as never);

    await repository.createDispatchedPromotion(base);

    expect(promotion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        copyState: 'dispatched',
        nextReconcileAt: new Date('2026-07-19T00:00:30.000Z'),
        dispatchAttempts: 1,
      }),
    });
    expect(
      (promotion.create.mock.calls[0][0] as { data: Record<string, unknown> })
        .data,
    ).not.toHaveProperty('policyVersion');
  });

  it('settles an exact destination HEAD with all identity evidence', async () => {
    const { prisma, tx, promotion } = harness();
    promotion.findUnique
      .mockResolvedValueOnce({
        uploadId: 'upload-1',
        finalizationLeaseToken: base.finalizationLeaseToken,
        copyState: 'dispatched',
        disposition: 'pending',
        copyResponseEtag: null,
        destinationHeadEtag: null,
      })
      .mockResolvedValueOnce({
        uploadId: 'upload-1',
        disposition: 'committed',
      });

    const repository = new ImageUploadPromotionRepository(prisma as never);
    await repository.settleDestinationHeadAndCommit({
      ...imageCommit,
      destinationHeadEtag: 'destination-etag',
      destinationHeadBytes: 1024,
      destinationHeadMime: 'image/webp',
      destinationHeadMetadataSha256: 'b'.repeat(64),
    });

    expect(tx.imageUploadPromotion.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        copyState: { in: ['dispatched', 'provider_settled'] },
      }),
      data: expect.objectContaining({
        copyState: 'provider_settled',
        destinationHeadEtag: 'destination-etag',
        destinationHeadBytes: 1024,
        destinationHeadMime: 'image/webp',
        destinationHeadMetadataSha256: 'b'.repeat(64),
      }),
    });
  });

  it('assigns an image order inside the serializable settlement transaction', async () => {
    const { prisma, tx, promotion } = harness();
    tx.image.findFirst.mockResolvedValue({ orderIndex: 7 });
    promotion.findUnique
      .mockResolvedValueOnce({
        uploadId: 'upload-1',
        finalizationLeaseToken: base.finalizationLeaseToken,
        copyState: 'dispatched',
        disposition: 'pending',
        copyResponseEtag: null,
        destinationHeadEtag: null,
      })
      .mockResolvedValueOnce({
        uploadId: 'upload-1',
        disposition: 'committed',
      });

    const repository = new ImageUploadPromotionRepository(prisma as never);

    await repository.settleCopyResponseAndCommit({
      ...imageCommit,
      copyResponseEtag: 'destination-etag',
    });

    expect(tx.image.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ orderIndex: 8 }),
    });
  });

  it('retries a serializable conflict while settling a copy response', async () => {
    const { prisma, promotion } = harness();
    prisma.$transaction.mockRejectedValueOnce(
      Object.assign(new Error('write conflict'), { code: 'P2034' }),
    );
    promotion.findUnique
      .mockResolvedValueOnce({
        uploadId: 'upload-1',
        finalizationLeaseToken: base.finalizationLeaseToken,
        copyState: 'dispatched',
        disposition: 'pending',
        copyResponseEtag: null,
        destinationHeadEtag: null,
      })
      .mockResolvedValueOnce({
        uploadId: 'upload-1',
        disposition: 'committed',
      });

    const repository = new ImageUploadPromotionRepository(prisma as never);

    await expect(
      repository.settleCopyResponseAndCommit({
        ...imageCommit,
        copyResponseEtag: 'destination-etag',
      }),
    ).resolves.toEqual(expect.objectContaining({ disposition: 'committed' }));
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('opens a destination conflict without performing an R2 mutation', async () => {
    const { prisma, tx } = harness();
    const repository = new ImageUploadPromotionRepository(prisma as never);

    await repository.openDestinationConflict({
      promotionId: 'promotion-1',
      accountId: 'account',
      bucket: 'bucket',
      sourceObjectKeyHash: 'c'.repeat(64),
      destinationObjectKeyHash: 'd'.repeat(64),
      expectedDestinationEtag: 'expected-etag',
      observedDestinationEtag: 'observed-etag',
      observedDestinationBytes: 2048,
      observedDestinationMime: 'image/webp',
      destinationMetadataSha256: 'e'.repeat(64),
      mismatchReason: 'destination_etag_mismatch',
      observedAt: base.now,
    });

    expect(tx.imageUploadPromotionConflict.upsert).toHaveBeenCalledWith({
      where: { promotionId: 'promotion-1' },
      create: expect.objectContaining({
        state: 'open',
        mismatchReason: 'destination_etag_mismatch',
        conflictEvidenceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      update: {},
    });
    expect(tx.imageUploadPromotion.updateMany).not.toHaveBeenCalled();
  });

  it('exports only the polling promotion mutation surface', () => {
    expect(
      Object.getOwnPropertyNames(
        ImageUploadPromotionRepository.prototype,
      ).sort(),
    ).toEqual(
      [
        'constructor',
        'createDispatchedPromotion',
        'markCommitted',
        'markDispatchRejectedNotCreated',
        'markVerifiedDeleted',
        'openDestinationConflict',
        'requireCleanup',
        'resolveDestinationConflict',
        'settleCopyResponseAndCommit',
        'settleDestinationHeadAndCommit',
      ].sort(),
    );
  });
});
