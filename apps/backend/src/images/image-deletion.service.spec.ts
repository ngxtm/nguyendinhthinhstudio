import { ImageDeletionService } from './image-deletion.service';

describe('ImageDeletionService', () => {
  it('keeps a failed R2 deletion pending for retry', async () => {
    const prisma: any = {
      imageObjectDeletion: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'queue-1', objectKey: 'albums/a/photo.jpg' },
          ]),
        update: jest.fn(),
      },
    };
    const storage: any = {
      deleteObject: jest.fn().mockRejectedValue(new Error('R2 unavailable')),
    };
    const service = new ImageDeletionService(prisma, storage);

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
    const prisma: any = {
      imageObjectDeletion: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([row])
          .mockResolvedValueOnce([]),
        update: jest.fn(),
      },
    };
    const storage: any = {
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ImageDeletionService(prisma, storage);

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

  it('only loads pending R2 queue rows and never targets deferred legacy objects', async () => {
    const prisma: any = {
      imageObjectDeletion: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
    };
    const storage: any = { deleteObject: jest.fn() };

    await new ImageDeletionService(prisma, storage).processPending();

    expect(prisma.imageObjectDeletion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { provider: 'r2', status: 'pending' },
      }),
    );
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
});
