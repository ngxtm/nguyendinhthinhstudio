import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export type QuarantineActionInput = {
  quarantineId: string; resolutionAttemptId: string; locationObservationSha256: string; action: string;
  queueKind: string; queueId: string; messageId: string; replayRequestId?: string | null; leaseId: string;
  providerOutcome?: string | null; observedAt: Date;
};

@Injectable()
export class ImageUploadProviderEventQuarantineActionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async appendOrReuseAction(input: QuarantineActionInput) {
    const actionEvidenceSha256 = createHash('sha256').update(JSON.stringify({ ...input, observedAt: input.observedAt.toISOString() })).digest('hex');
    const actionSha256 = createHash('sha256').update(JSON.stringify({ quarantineId: input.quarantineId, resolutionAttemptId: input.resolutionAttemptId, locationObservationSha256: input.locationObservationSha256, action: input.action, leaseId: input.leaseId })).digest('hex');
    return this.prisma.$transaction(async (tx: any) => {
      const existing = await tx.imageUploadProviderEventQuarantineAction.findUnique({ where: { actionSha256 } });
      if (existing) return existing;
      return tx.imageUploadProviderEventQuarantineAction.create({ data: { id: randomUUID(), ...input, actionEvidenceSha256, actionSha256 } });
    });
  }
}
