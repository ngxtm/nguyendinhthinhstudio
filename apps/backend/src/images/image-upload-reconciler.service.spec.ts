import { ImageUploadReconcilerService } from './image-upload-reconciler.service';

describe('ImageUploadReconcilerService', () => {
  it('runs exactly five bounded loops and advances their heartbeats in order', async () => {
    const pendingExpiry = {
      expireDue: jest.fn().mockResolvedValue({ scanned: 1, expired: 1 }),
    };
    const promotionRecovery = {
      recoverDue: jest.fn().mockResolvedValue({ scanned: 1, committed: 1 }),
    };
    const cleanup = {
      cleanupExpired: jest.fn().mockResolvedValue({ scanned: 1, cleaned: 1 }),
    };
    const deletion = {
      processPending: jest.fn().mockResolvedValue({ processed: 1 }),
    };
    const rate = { runOnce: jest.fn().mockResolvedValue({ deleted: 1 }) };
    const heartbeat = jest.fn().mockResolvedValue(undefined);
    const now = new Date('2026-07-21T00:00:00.000Z');
    const signal = new AbortController().signal;

    const result = await new ImageUploadReconcilerService(
      pendingExpiry as never,
      promotionRecovery as never,
      cleanup as never,
      deletion as never,
      rate as never,
    ).runOnce({ heartbeat, signal }, now);

    expect(pendingExpiry.expireDue).toHaveBeenCalledWith(100, now);
    expect(promotionRecovery.recoverDue).toHaveBeenCalledWith(100, now, signal);
    expect(cleanup.cleanupExpired).toHaveBeenCalledWith(undefined, now, signal);
    expect(deletion.processPending).toHaveBeenCalledWith(100, signal);
    expect(rate.runOnce).toHaveBeenCalledTimes(1);
    expect(heartbeat.mock.calls.map(([field]) => field)).toEqual([
      'pendingSessionExpiryCompletedAt',
      'promotionRecoveryCompletedAt',
      'temporaryCleanupCompletedAt',
      'imageDeletionCompletedAt',
      'rateLimitCleanupCompletedAt',
    ]);
    expect(result).toEqual({
      expiry: { scanned: 1, expired: 1 },
      promotionRecovery: { scanned: 1, committed: 1 },
      cleanup: { scanned: 1, cleaned: 1 },
      deletions: { processed: 1 },
      rateLimit: { deleted: 1 },
    });
  });

  it('stops before the next loop when the singleton lock signal aborts', async () => {
    const controller = new AbortController();
    const pendingExpiry = {
      expireDue: jest.fn().mockImplementation(async () => {
        controller.abort();
        return {};
      }),
    };
    const promotionRecovery = { recoverDue: jest.fn() };
    const service = new ImageUploadReconcilerService(
      pendingExpiry as never,
      promotionRecovery as never,
      { cleanupExpired: jest.fn() } as never,
      { processPending: jest.fn() } as never,
      { runOnce: jest.fn() } as never,
    );

    await expect(
      service.runOnce(
        { heartbeat: jest.fn().mockResolvedValue(undefined), signal: controller.signal },
        new Date('2026-07-21T00:00:00.000Z'),
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(promotionRecovery.recoverDue).not.toHaveBeenCalled();
  });
});
