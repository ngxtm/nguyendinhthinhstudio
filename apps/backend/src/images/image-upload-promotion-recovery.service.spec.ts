import { ImageUploadPromotionRecoveryService } from './image-upload-promotion-recovery.service';

const now = new Date('2026-07-20T01:00:00.000Z');
const promotion = {
  id: 'promotion-1',
  promotionId: 'promotion-1',
  uploadId: 'upload-1',
  albumId: 'album-1',
  accountId: 'account-1',
  bucket: 'images',
  finalizationLeaseToken: '11111111-1111-4111-8111-111111111111',
  sourceObjectKey: 'uploads/upload-1/photo.webp',
  sourceEtag: 'source-etag',
  destinationObjectKey: 'albums/album-1/photo.webp',
  inspectedSha256: 'a'.repeat(64),
  inspectedByteSize: 1024,
  canonicalMime: 'image/webp',
  inspectedWidth: 100,
  inspectedHeight: 80,
  copyState: 'dispatched',
  disposition: 'pending',
  nextReconcileAt: new Date(now.getTime() - 1),
  firstDestinationAbsentAt: null,
};

const exactDestination = {
  etag: 'source-etag',
  contentLength: 1024,
  contentType: 'image/webp',
  metadata: {
    'promotion-id': 'promotion-1',
    sha256: 'a'.repeat(64),
    bytes: '1024',
    width: '100',
    height: '80',
    policy: 'web-v1-legacy',
  },
};

function harness(row = promotion) {
  const calls: string[] = [];
  const prisma = {
    imageUploadPromotionConflict: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    imageUploadPromotion: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([row]),
      updateMany: jest.fn().mockImplementation(async () => {
        calls.push('claim');
        return { count: 1 };
      }),
    },
    imageUpload: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'upload-1',
        createdByAdminId: 'admin-1',
        albumId: 'album-1',
        filename: 'photo.webp',
        status: 'finalizing',
        finalizationLeaseToken: promotion.finalizationLeaseToken,
        presignExpiresAt: new Date('2026-07-20T02:00:00.000Z'),
        expiresAt: new Date('2026-07-20T02:00:00.000Z'),
      }),
    },
    image: {
      findFirst: jest.fn().mockResolvedValue({ orderIndex: 2 }),
    },
  };
  const storage = {
    headObjectIdentity: jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ etag: 'source-etag' }),
    promoteObject: jest.fn().mockImplementation(async () => {
      calls.push('copy');
      return 'source-etag';
    }),
  };
  const promotions = {
    settleCopyResponseAndCommit: jest.fn().mockResolvedValue({}),
    settleDestinationHeadAndCommit: jest.fn().mockResolvedValue({}),
    openDestinationConflict: jest.fn().mockResolvedValue({}),
    markDispatchRejectedNotCreated: jest.fn().mockResolvedValue(true),
  };
  return { prisma, storage, promotions, calls };
}

describe('ImageUploadPromotionRecoveryService', () => {
  it('fails closed when current dispatched rows have null scheduling facts', async () => {
    const h = harness();
    h.prisma.imageUploadPromotion.count.mockResolvedValue(1);
    const service = new ImageUploadPromotionRecoveryService(
      h.prisma as never,
      h.storage as never,
      h.promotions as never,
    );

    await expect(service.recoverDue(100, now)).rejects.toThrow(
      'promotion scheduling invariant',
    );
    expect(h.prisma.imageUploadPromotion.findMany).not.toHaveBeenCalled();
  });

  it('excludes open conflicts so operator-owned decisions are not automatically retried', async () => {
    const h = harness();
    h.prisma.imageUploadPromotionConflict.findMany.mockResolvedValue([
      { promotionId: 'promotion-blocked' },
    ]);
    const service = new ImageUploadPromotionRecoveryService(
      h.prisma as never,
      h.storage as never,
      h.promotions as never,
    );

    await service.recoverDue(100, now);

    expect(h.prisma.imageUploadPromotion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { notIn: ['promotion-blocked'] },
        }),
      }),
    );
  });

  it('settles and commits exact destination HEAD evidence with historical policy metadata without another COPY', async () => {
    const h = harness();
    h.storage.headObjectIdentity.mockReset();
    h.storage.headObjectIdentity.mockResolvedValue(exactDestination);
    const service = new ImageUploadPromotionRecoveryService(
      h.prisma as never,
      h.storage as never,
      h.promotions as never,
    );

    const result = await service.recoverDue(100, now);

    expect(h.storage.promoteObject).not.toHaveBeenCalled();
    expect(h.promotions.settleDestinationHeadAndCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadId: promotion.uploadId,
        destinationHeadEtag: exactDestination.etag,
        destinationHeadBytes: 1024,
        destinationHeadMime: 'image/webp',
        image: expect.objectContaining({
          r2ObjectKey: promotion.destinationObjectKey,
        }),
      }),
    );
    expect(result).toMatchObject({ scanned: 1, committed: 1, conflicts: 0 });
  });

  it('opens a durable conflict for mismatched destination evidence and never overwrites or deletes it', async () => {
    const h = harness();
    h.storage.headObjectIdentity.mockReset();
    h.storage.headObjectIdentity.mockResolvedValue({
      ...exactDestination,
      metadata: { ...exactDestination.metadata, sha256: 'b'.repeat(64) },
    });
    const service = new ImageUploadPromotionRecoveryService(
      h.prisma as never,
      h.storage as never,
      h.promotions as never,
    );

    const result = await service.recoverDue(100, now);

    expect(h.promotions.openDestinationConflict).toHaveBeenCalledWith(
      expect.objectContaining({
        promotionId: 'promotion-1',
        accountId: 'account-1',
        bucket: 'images',
        mismatchReason: 'destination_metadata_mismatch',
      }),
    );
    expect(h.storage.promoteObject).not.toHaveBeenCalled();
    expect(result).toMatchObject({ conflicts: 1, committed: 0 });
  });

  it('claims an absent-destination retry before conditional COPY and commits its response', async () => {
    const h = harness();
    const service = new ImageUploadPromotionRecoveryService(
      h.prisma as never,
      h.storage as never,
      h.promotions as never,
    );

    const result = await service.recoverDue(100, now);

    expect(h.calls).toEqual(['claim', 'copy']);
    expect(h.storage.promoteObject).toHaveBeenCalledWith(
      expect.objectContaining({ promotionId: 'promotion-1' }),
      expect.any(Object),
    );
    expect(h.promotions.settleCopyResponseAndCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadId: promotion.uploadId,
        copyResponseEtag: 'source-etag',
      }),
    );
    expect(result).toMatchObject({ redispatched: 1, committed: 1 });
  });

  it('terminalizes only after two absent destination observations at least 30 seconds apart', async () => {
    const firstAbsentAt = new Date(now.getTime() - 30_000);
    const h = harness({
      ...promotion,
      firstDestinationAbsentAt: firstAbsentAt,
    });
    h.storage.headObjectIdentity.mockReset();
    h.storage.headObjectIdentity
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const service = new ImageUploadPromotionRecoveryService(
      h.prisma as never,
      h.storage as never,
      h.promotions as never,
    );

    const result = await service.recoverDue(100, now);

    expect(h.promotions.markDispatchRejectedNotCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        firstDestinationAbsentAt: firstAbsentAt,
        destinationAbsentVerifiedAt: now,
        observedSourceEtag: null,
        reason: 'source_missing',
        reconcileBarrierMs: 30_000,
      }),
    );
    expect(h.storage.promoteObject).not.toHaveBeenCalled();
    expect(result).toMatchObject({ rejected: 1 });
  });

  it('does not swallow a lock-loss abort during COPY', async () => {
    const h = harness();
    h.storage.promoteObject.mockRejectedValue(
      Object.assign(new Error('aborted'), { name: 'AbortError' }),
    );
    const service = new ImageUploadPromotionRecoveryService(
      h.prisma as never,
      h.storage as never,
      h.promotions as never,
    );

    await expect(service.recoverDue(100, now)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(h.promotions.settleCopyResponseAndCommit).not.toHaveBeenCalled();
  });
});
