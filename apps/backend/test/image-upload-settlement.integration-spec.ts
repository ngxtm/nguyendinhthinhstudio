import { ImageUploadReconcilerService } from '../src/images/image-upload-reconciler.service';

describe('image upload settlement restart integration', () => {
  it('replays a bounded cycle without acknowledging unmatched evidence', async () => {
    const queue = { pull: jest.fn().mockResolvedValue([{ leaseId: 'lease', body: { account: 'a', bucket: 'b', action: 'CopyObject', object: 'dest', copySource: 'source', etag: '"etag"', eventTime: '2026-07-20T00:00:00Z' } }]), acknowledge: jest.fn() };
    const settlement = { settle: jest.fn().mockResolvedValue({ outcome: 'unmatched' }) };
    const pending = { expireDue: jest.fn().mockResolvedValue({ scanned: 0, expired: 0 }) };
    const cleanup = { cleanupExpired: jest.fn().mockResolvedValue({ scanned: 0 }) };
    const deletion = { processPending: jest.fn().mockResolvedValue({ processed: 0 }) };
    const rate = { runOnce: jest.fn().mockResolvedValue({ deleted: 0 }) };
    const service = new ImageUploadReconcilerService({}, queue, settlement, pending, cleanup, deletion, rate);
    const config = { account: 'a', bucket: 'b', queue: {} };
    await service.runOnce(config); await service.runOnce(config);
    expect(queue.acknowledge).toHaveBeenNthCalledWith(1, [], [{ leaseId: 'lease', delaySeconds: 30 }], {});
    expect(queue.acknowledge).toHaveBeenCalledTimes(2);
    expect(pending.expireDue).toHaveBeenCalledTimes(2);
    expect(deletion.processPending).toHaveBeenCalledTimes(2);
  });
});
