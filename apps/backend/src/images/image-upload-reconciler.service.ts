import { Injectable } from '@nestjs/common';
import { validateR2CopyEvent } from './r2-copy-event';
import { PrismaService } from '../prisma/prisma.service';
import { CloudflareQueueClient } from './cloudflare-queue.client';
import { R2CopySettlementService } from './r2-copy-settlement.service';
import { PendingUploadExpiryService } from './pending-upload-expiry.service';
import { UploadCleanupService } from './upload-cleanup.service';
import { ImageDeletionService } from './image-deletion.service';
import { ImageUploadRateLimitCleanupService } from './image-upload-rate-limit-cleanup.service';

export type ReconcilerConfig = { account: string; bucket: string; queue: Record<string, unknown> };

@Injectable()
export class ImageUploadReconcilerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: CloudflareQueueClient,
    private readonly settlement: R2CopySettlementService,
    private readonly pendingExpiry: PendingUploadExpiryService,
    private readonly cleanup: UploadCleanupService,
    private readonly imageDeletion: ImageDeletionService,
    private readonly rateCleanup: ImageUploadRateLimitCleanupService,
  ) {}

  async runOnce(config: ReconcilerConfig, now = new Date()) {
    const pulled = await this.queue.pull(100, 60_000, config.queue);
    const acked: string[] = []; const retry: { leaseId: string; delaySeconds: number }[] = [];
    for (const message of pulled) {
      try {
        const event = validateR2CopyEvent(message.body, { account: config.account, bucket: config.bucket });
        const result = await this.settlement.settle(event, now);
        if (result.outcome === 'settled' || result.outcome === 'duplicate') acked.push(message.leaseId);
        else retry.push({ leaseId: message.leaseId, delaySeconds: 30 });
      } catch {
        retry.push({ leaseId: message.leaseId, delaySeconds: 30 });
      }
    }
    await this.queue.acknowledge(acked, retry, config.queue);
    await this.markHeartbeat('queueSettlementCompletedAt', now);

    const expiry = await this.pendingExpiry.expireDue(100, now);
    await this.markHeartbeat('pendingSessionExpiryCompletedAt', now);
    const cleanup = await this.cleanup.cleanupExpired();
    await this.markHeartbeat('temporaryCleanupCompletedAt', now);
    const deletions = await this.imageDeletion.processPending(100);
    await this.markHeartbeat('imageDeletionCompletedAt', now);
    const rateLimit = await this.rateCleanup.runOnce();
    await this.markHeartbeat('rateLimitCleanupCompletedAt', now);
    return { queue: { pulled: pulled.length, acked: acked.length, retried: retry.length }, expiry, cleanup, deletions, rateLimit };
  }

  private async markHeartbeat(field: string, at: Date) {
    if (!this.prisma.imageUploadReconcilerHeartbeat?.update) return;
    try {
      await this.prisma.imageUploadReconcilerHeartbeat.update({ where: { id: 'singleton' }, data: { [field]: at, heartbeatAt: at } });
    } catch {
      // Heartbeat persistence failure must not mutate later loop state.
    }
  }
}
