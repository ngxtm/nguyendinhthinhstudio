import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';

@Injectable()
export class ImageDeletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async processPending(limit = 100) {
    const rows = await (this.prisma as any).imageObjectDeletion.findMany({
      where: { provider: 'r2', status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    let deleted = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        await this.storage.deleteObject(row.objectKey);
        await (this.prisma as any).imageObjectDeletion.update({
          where: { id: row.id },
          data: { status: 'deleted', deletedAt: new Date() },
        });
        deleted++;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message.slice(0, 500)
            : 'Object deletion failed';
        await (this.prisma as any).imageObjectDeletion.update({
          where: { id: row.id },
          data: {
            status: 'pending',
            attempts: { increment: 1 },
            lastError: message,
          },
        });
        failed++;
      }
    }
    return { processed: rows.length, deleted, failed };
  }
}
