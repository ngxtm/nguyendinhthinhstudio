import { PendingUploadExpiryService } from './pending-upload-expiry.service';

describe('PendingUploadExpiryService', () => {
  it('CAS-terminalizes due pending rows and their idempotency evidence', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const idempotency = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      imageUpload: { findMany: jest.fn().mockResolvedValue([{ id: 'u1', createdByAdminId: 'a1' }]) },
      $transaction: jest.fn(async (fn: any) => fn({ imageUpload: { updateMany }, imageUploadIdempotency: { updateMany: idempotency } })),
    };
    const result = await new PendingUploadExpiryService(prisma as never).expireDue(10, new Date('2026-07-20T00:00:00Z'));
    expect(result).toEqual({ scanned: 1, expired: 1 });
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'pending' }), data: expect.objectContaining({ failureCode: 'upload_expired' }) }));
    expect(idempotency).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ terminalOutcome: 'failed', failureCode: 'upload_expired' }) }));
  });

  it('does not overwrite a CAS loser', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = { imageUpload: { findMany: jest.fn().mockResolvedValue([{ id: 'u1', createdByAdminId: 'a1' }]) }, $transaction: jest.fn(async (fn: any) => fn({ imageUpload: { updateMany }, imageUploadIdempotency: { updateMany: jest.fn() } })) };
    await expect(new PendingUploadExpiryService(prisma as never).expireDue()).resolves.toEqual({ scanned: 1, expired: 0 });
  });
});
