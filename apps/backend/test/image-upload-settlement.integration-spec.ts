import { ImageUploadPromotionRecoveryService } from '../src/images/image-upload-promotion-recovery.service';

describe('image upload response-loss polling restart integration', () => {
  it('settles exact destination HEAD evidence once and remains committed after restart', async () => {
    const now = new Date('2026-07-21T00:00:35.000Z');
    let copyState = 'dispatched';
    const row = {
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
      policyVersion: 'web-v1-test',
      copyState: 'dispatched',
      disposition: 'pending',
      nextReconcileAt: new Date('2026-07-21T00:00:30.000Z'),
      firstDestinationAbsentAt: null,
    };
    const prisma = {
      imageUploadPromotionConflict: { findMany: jest.fn().mockResolvedValue([]) },
      imageUploadPromotion: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockImplementation(async () => copyState === 'dispatched' ? [row] : []),
      },
      imageUpload: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'upload-1', createdByAdminId: 'admin-1', filename: 'photo.webp',
          presignExpiresAt: new Date('2026-07-21T01:00:00.000Z'),
          expiresAt: new Date('2026-07-21T01:00:00.000Z'),
        }),
      },
      image: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const storage = {
      headObjectIdentity: jest.fn().mockResolvedValue({
        etag: 'source-etag', contentLength: 1024, contentType: 'image/webp',
        metadata: {
          'promotion-id': 'promotion-1', sha256: 'a'.repeat(64), bytes: '1024',
          width: '100', height: '80', policy: 'web-v1-test',
        },
      }),
      promoteObject: jest.fn(),
    };
    const promotions = {
      settleDestinationHeadAndCommit: jest.fn().mockImplementation(async () => {
        copyState = 'provider_settled';
        return {};
      }),
    };

    const firstProcess = new ImageUploadPromotionRecoveryService(
      prisma as never, storage as never, promotions as never,
    );
    await expect(firstProcess.recoverDue(100, now)).resolves.toMatchObject({ committed: 1 });

    const restartedProcess = new ImageUploadPromotionRecoveryService(
      prisma as never, storage as never, promotions as never,
    );
    await expect(restartedProcess.recoverDue(100, now)).resolves.toMatchObject({ scanned: 0, committed: 0 });
    expect(promotions.settleDestinationHeadAndCommit).toHaveBeenCalledTimes(1);
    expect(storage.promoteObject).not.toHaveBeenCalled();
  });
});
