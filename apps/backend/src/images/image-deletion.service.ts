import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';

@Injectable()
export class ImageDeletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async processPending(limit = 100, signal?: AbortSignal) {
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
        if (signal?.aborted) {
          const error = new Error('image deletion aborted');
          error.name = 'AbortError';
          throw error;
        }
        await this.storage.deleteObject(row.objectKey, {
          parentSignal: signal,
        });
        const identity = await this.storage.headObjectIdentity(row.objectKey, {
          parentSignal: signal,
        });
        if (identity !== null) {
          throw new Error('image object remains after deletion');
        }
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
        if (
          signal?.aborted ||
          (error as { name?: string })?.name === 'AbortError'
        ) {
          throw error;
        }
        const category =
          error instanceof Error &&
          error.message === 'image object remains after deletion'
            ? 'object_still_present'
            : 'storage_retryable';
        await this.prisma.imageObjectDeletion.update({
          where: { id: row.id },
          data: {
            status: 'pending',
            attempts: { increment: 1 },
            lastError: category,
          },
        });
        failed++;
      }
    }
    return { processed: rows.length, deleted, failed };
  }
}
