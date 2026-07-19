import { R2CopySettlementService } from './r2-copy-settlement.service';

describe('R2CopySettlementService', () => {
  const event: any = { account: 'a', bucket: 'b', action: 'CopyObject', object: 'albums/dest', copySource: 'uploads/source', eventTime: new Date('2026-07-20T00:00:00Z'), destinationEtag: 'etag', providerEventId: 'event-1' };

  it('settles only an exact account/bucket/source/destination match', async () => {
    const prisma = { imageUploadPromotion: { findFirst: jest.fn().mockResolvedValue({ uploadId: 'u1', finalizationLeaseToken: 'lease-1' }) } };
    const promotions = { recordProviderSettlement: jest.fn().mockResolvedValue({ copyState: 'provider_settled', providerEventId: 'event-1' }) };
    const result = await new R2CopySettlementService(prisma, promotions as never).settle(event);
    expect(result.outcome).toBe('settled');
    expect(promotions.recordProviderSettlement).toHaveBeenCalledWith(expect.objectContaining({ uploadId: 'u1', finalizationLeaseToken: 'lease-1', providerObjectEtag: 'etag', providerEventId: 'event-1' }));
  });

  it('returns unmatched without repository mutation', async () => {
    const prisma = { imageUploadPromotion: { findFirst: jest.fn().mockResolvedValue(null) } };
    const promotions = { recordProviderSettlement: jest.fn() };
    await expect(new R2CopySettlementService(prisma, promotions as never).settle(event)).resolves.toEqual({ outcome: 'unmatched' });
    expect(promotions.recordProviderSettlement).not.toHaveBeenCalled();
  });
});
