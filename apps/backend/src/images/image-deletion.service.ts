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
    const rows = await this.prisma.imageObjectDeletion.findMany({
      where: {
        provider: 'r2',
        status: 'pending',
        authority: { in: ['current_result', 'legacy_image'] },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    let deleted = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        await this.storage.deleteObject(row.objectKey);
        const deletedAt = new Date();
        await this.prisma.$transaction(async (transaction) => {
          await transaction.imageObjectDeletion.update({
            where: { id: row.id },
            data: { status: 'deleted', deletedAt },
          });
          if (!row.imageId) return;

          const image = await transaction.image.findUnique({
            where: { id: row.imageId },
          });
          if (image) return;

          await transaction.imageStorageMigration.updateMany({
            where: {
              imageId: row.imageId,
              targetR2ObjectKey: row.objectKey,
              status: 'failed',
            },
            data: {
              status: 'skipped_deleted',
              error: null,
            },
          });
        });
        deleted++;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message.slice(0, 500)
            : 'Object deletion failed';
        await this.prisma.imageObjectDeletion.update({
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
