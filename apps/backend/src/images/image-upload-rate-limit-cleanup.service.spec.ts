import { ImageUploadRateLimitCleanupService } from './image-upload-rate-limit-cleanup.service';

describe('ImageUploadRateLimitCleanupService', () => {
  it('delegates one bounded cleanup batch', async () => {
    const rateLimit = { cleanupExpired: jest.fn().mockResolvedValue(12) };
    await expect(new ImageUploadRateLimitCleanupService(rateLimit as never).runOnce()).resolves.toEqual({ deleted: 12 });
    expect(rateLimit.cleanupExpired).toHaveBeenCalledTimes(1);
  });
});
