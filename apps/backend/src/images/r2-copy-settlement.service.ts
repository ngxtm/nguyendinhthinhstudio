import { Injectable } from '@nestjs/common';
import { ImageUploadPromotionRepository } from './image-upload-promotion.repository';
import type { R2CopyEvent } from './r2-copy-event';
import { PrismaService } from '../prisma/prisma.service';

export type SettlementResult =
  | { outcome: 'settled'; promotion: Record<string, unknown> }
  | { outcome: 'duplicate'; promotion: Record<string, unknown> }
  | { outcome: 'unmatched' };

@Injectable()
export class R2CopySettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promotions: ImageUploadPromotionRepository,
  ) {}

  async settle(event: R2CopyEvent, observedAt = new Date()): Promise<SettlementResult> {
    const promotion = await this.prisma.imageUploadPromotion.findFirst({
      where: {
        accountId: event.account,
        bucket: event.bucket,
        sourceObjectKey: event.copySource,
        destinationObjectKey: event.object,
      },
    });
    if (!promotion) return { outcome: 'unmatched' };
    const settled = await this.promotions.recordProviderSettlement({
      uploadId: promotion.uploadId,
      finalizationLeaseToken: promotion.finalizationLeaseToken,
      providerEventId: event.providerEventId,
      providerEventObservedAt: observedAt,
      providerSettlementObservedAt: observedAt,
      settlementSource: 'cloudflare_queue',
      providerObjectEtag: event.destinationEtag,
      eventTime: event.eventTime,
    });
    if (settled.copyState === 'provider_settled' && settled.providerEventId === event.providerEventId) {
      return { outcome: promotion.providerEventId === event.providerEventId ? 'duplicate' : 'settled', promotion: settled };
    }
    return { outcome: 'settled', promotion: settled };
  }
}
