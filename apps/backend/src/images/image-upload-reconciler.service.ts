import { Injectable } from '@nestjs/common';
import { PendingUploadExpiryService } from './pending-upload-expiry.service';
import { UploadCleanupService } from './upload-cleanup.service';
import { ImageDeletionService } from './image-deletion.service';
import { ImageUploadRateLimitCleanupService } from './image-upload-rate-limit-cleanup.service';
import { ImageUploadPromotionRecoveryService } from './image-upload-promotion-recovery.service';

export type ReconcilerHeartbeatField =
  | 'pendingSessionExpiryCompletedAt'
  | 'promotionRecoveryCompletedAt'
  | 'temporaryCleanupCompletedAt'
  | 'imageDeletionCompletedAt'
  | 'rateLimitCleanupCompletedAt';

export type ReconcilerConfig = {
  heartbeat: (field: ReconcilerHeartbeatField, at: Date) => Promise<void>;
  signal?: AbortSignal;
};

@Injectable()
export class ImageUploadReconcilerService {
  constructor(
    private readonly pendingExpiry: PendingUploadExpiryService,
    private readonly promotionRecovery: ImageUploadPromotionRecoveryService,
    private readonly cleanup: UploadCleanupService,
    private readonly imageDeletion: ImageDeletionService,
    private readonly rateCleanup: ImageUploadRateLimitCleanupService,
  ) {}

  async runOnce(config: ReconcilerConfig, now = new Date()) {
    this.throwIfAborted(config.signal);
    const expiry = await this.pendingExpiry.expireDue(100, now);
    await config.heartbeat('pendingSessionExpiryCompletedAt', now);
    this.throwIfAborted(config.signal);
    const promotionRecovery = await this.promotionRecovery.recoverDue(100, now, config.signal);
    await config.heartbeat('promotionRecoveryCompletedAt', now);
    this.throwIfAborted(config.signal);
    const cleanup = await this.cleanup.cleanupExpired(undefined, now, config.signal);
    await config.heartbeat('temporaryCleanupCompletedAt', now);
    this.throwIfAborted(config.signal);
    const deletions = await this.imageDeletion.processPending(100, config.signal);
    await config.heartbeat('imageDeletionCompletedAt', now);
    this.throwIfAborted(config.signal);
    const rateLimit = await this.rateCleanup.runOnce();
    await config.heartbeat('rateLimitCleanupCompletedAt', now);
    return { expiry, promotionRecovery, cleanup, deletions, rateLimit };
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) return;
    const error = new Error('image upload reconciler lock connection lost');
    error.name = 'AbortError';
    throw error;
  }
}
