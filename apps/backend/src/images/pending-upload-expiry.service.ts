import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class PendingUploadExpiryService {
  constructor(private readonly prisma: PrismaService) {}

  async expireDue(limit = 100, now = new Date()) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new RangeError('limit must be 1..1000');
    const rows = await (this.prisma as any).imageUpload.findMany({
      where: { status: 'pending', presignExpiresAt: { lte: now } },
      orderBy: { presignExpiresAt: 'asc' }, take: limit,
    });
    let expired = 0;
    for (const row of rows) {
      const resultRetentionExpiresAt = new Date(now.getTime() + RETENTION_MS);
      const changed = await (this.prisma as any).$transaction(async (tx: any) => {
        const update = await tx.imageUpload.updateMany({
          where: { id: row.id, createdByAdminId: row.createdByAdminId, status: 'pending', presignExpiresAt: { lte: now } },
          data: { status: 'failed', failureCode: 'upload_expired', terminalAt: now, resultRetentionExpiresAt, temporaryCleanupState: 'pending', temporaryCleanupNextAttemptAt: now },
        });
        if (update.count !== 1) return false;
        const idempotency = await tx.imageUploadIdempotency.updateMany({
          where: { uploadId: row.id, terminalOutcome: null },
          data: { terminalOutcome: 'failed', failureCode: 'upload_expired', terminalAt: now, resultRetentionExpiresAt },
        });
        if (idempotency.count !== 1) throw new Error('pending upload expiry idempotency CAS failed');
        return true;
      }, { isolationLevel: 'Serializable' as any });
      if (changed) expired += 1;
    }
    return { scanned: rows.length, expired };
  }
}
