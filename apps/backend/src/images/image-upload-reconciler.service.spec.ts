import { ImageUploadReconcilerService } from './image-upload-reconciler.service';

describe('ImageUploadReconcilerService', () => {
  it('settles valid messages before ack and runs bounded loops in order', async () => {
    const calls: string[] = [];
    const queue = { pull: jest.fn().mockResolvedValue([{ leaseId: 'l1', body: { account: 'a', bucket: 'b', action: 'CopyObject', object: 'd', copySource: 's', etag: '"e"', eventTime: '2026-07-20T00:00:00Z' } }]), acknowledge: jest.fn().mockImplementation(async () => calls.push('ack')) };
    const settlement = { settle: jest.fn().mockImplementation(async () => { calls.push('settle'); return { outcome: 'settled' }; }) };
    const pendingExpiry = { expireDue: jest.fn().mockResolvedValue({}) }; const cleanup = { cleanupExpired: jest.fn().mockResolvedValue({}) }; const deletion = { processPending: jest.fn().mockResolvedValue({}) }; const rate = { runOnce: jest.fn().mockResolvedValue({}) };
    const prisma = { imageUploadReconcilerHeartbeat: { update: jest.fn() } };
    await new ImageUploadReconcilerService(prisma, queue, settlement, pendingExpiry, cleanup, deletion, rate).runOnce({ account: 'a', bucket: 'b', queue: {} });
    expect(calls).toEqual(['settle', 'ack']);
    expect(pendingExpiry.expireDue).toHaveBeenCalledWith(100, expect.any(Date));
    expect(rate.runOnce).toHaveBeenCalled();
  });
});
