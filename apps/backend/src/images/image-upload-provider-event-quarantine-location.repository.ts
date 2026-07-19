import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export type LocationObservationInput = {
  quarantineId: string; queueKind: 'source' | 'dlq'; queueId: string; messageId: string;
  replayRequestId?: string | null; leaseId: string; leaseDeadline: Date; attempts: number; observedAt: Date;
};

function hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value, Object.keys(value as object).sort())).digest('hex'); }

@Injectable()
export class ImageUploadProviderEventQuarantineLocationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async appendOrReuseLocationObservation(input: LocationObservationInput) {
    const observation = hash({ quarantineId: input.quarantineId, queueKind: input.queueKind, queueId: input.queueId, messageId: input.messageId, replayRequestId: input.replayRequestId ?? '', leaseId: input.leaseId, leaseDeadline: input.leaseDeadline.toISOString(), attempts: String(input.attempts) });
    return this.prisma.$transaction(async (tx: any) => {
      const existing = await tx.imageUploadProviderEventQuarantineLocation.findUnique({ where: { locationObservationSha256: observation } });
      const row = existing ?? await tx.imageUploadProviderEventQuarantineLocation.create({ data: { id: randomUUID(), ...input, locationObservationSha256: observation } });
      await tx.imageUploadProviderEventQuarantine.updateMany({ where: { id: input.quarantineId, latestLocationObservationSha256: { not: observation } }, data: { latestLocationObservationSha256: observation } });
      return row;
    });
  }
}
