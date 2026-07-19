import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from './storage.service';
import { ImageDeletionService } from './image-deletion.service';

function createService(
  prisma: unknown,
  storage: unknown,
): ImageDeletionService {
  return new ImageDeletionService(
    prisma as PrismaService,
    storage as StorageService,
  );
}

function withTransaction<T extends object>(transaction: T) {
  return {
    ...transaction,
    $transaction: jest.fn((work: (client: T) => Promise<unknown>) =>
      work(transaction),
    ),
  };
}

describe('ImageDeletionService', () => {
  it('keeps a failed R2 deletion pending for retry', async () => {
    const prisma = {
      imageObjectDeletion: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'queue-1', objectKey: 'albums/a/photo.jpg' },
          ]),
        update: jest.fn(),
      },
    };
    const storage = {
      deleteObject: jest.fn().mockRejectedValue(new Error('R2 unavailable')),
    };
    const service = createService(prisma, storage);

    await expect(service.processPending()).resolves.toEqual({
      processed: 1,
      deleted: 0,
      failed: 1,
    });
    expect(prisma.imageObjectDeletion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'pending',
          attempts: { increment: 1 },
        }),
      }),
    );
  });

  it('marks a successful deletion once and does not delete it on a later run', async () => {
    const row = { id: 'queue-1', objectKey: 'albums/a/photo.jpg' };
    const prisma = withTransaction({
      imageObjectDeletion: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([row])
          .mockResolvedValueOnce([]),
        update: jest.fn(),
      },
    });
    const storage = {
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const service = createService(prisma, storage);

    await expect(service.processPending()).resolves.toEqual({
      processed: 1,
      deleted: 1,
      failed: 0,
    });
    await expect(service.processPending()).resolves.toEqual({
      processed: 0,
      deleted: 0,
      failed: 0,
    });
    expect(storage.deleteObject).toHaveBeenCalledTimes(1);
    expect(prisma.imageObjectDeletion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'deleted',
          deletedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('finalizes skipped_deleted after cleaning a missing migrated Image target', async () => {
    const row = {
      id: 'queue-1',
      imageId: 'image-1',
      objectKey: 'albums/a/photo.jpg',
    };
    const prisma = withTransaction({
      imageObjectDeletion: {
        findMany: jest.fn().mockResolvedValue([row]),
        update: jest.fn(),
      },
      image: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      imageStorageMigration: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    });
    const storage = {
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };

    await expect(
      createService(prisma, storage).processPending(),
    ).resolves.toEqual({
      processed: 1,
      deleted: 1,
      failed: 0,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.imageStorageMigration.updateMany).toHaveBeenCalledWith({
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

  it('only loads pending R2 queue rows and never targets deferred legacy objects', async () => {
    const prisma = {
      imageObjectDeletion: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
    };
    const storage = { deleteObject: jest.fn() };

    await createService(prisma, storage).processPending();

    expect(prisma.imageObjectDeletion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider: 'r2',
          status: 'pending',
          authority: { in: ['current_result', 'legacy_image'] },
        },
      }),
    );
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
});
