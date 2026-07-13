import { UploadCleanupService } from './upload-cleanup.service';

describe('UploadCleanupService', () => {
  it('deletes expired pending temporary and unreferenced final objects before deleting its session', async () => {
    const session = {
      id: 'u1',
      status: 'pending',
      uploadObjectKey: 'uploads/u1/a.jpg',
      finalObjectKey: 'albums/a/a.jpg',
    };
    const prisma: any = {
      imageUpload: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([session])
          .mockResolvedValueOnce([]),
        deleteMany: jest.fn(),
      },
      image: { count: jest.fn().mockResolvedValue(0) },
    };
    const storage: any = {
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const result = await new UploadCleanupService(
      prisma,
      storage,
    ).cleanupExpired();
    expect(result).toEqual({
      scanned: 1,
      objectsDeleted: 2,
      sessionsDeleted: 1,
      failed: 0,
    });
    expect(storage.deleteObject).toHaveBeenCalledWith('uploads/u1/a.jpg');
    expect(storage.deleteObject).toHaveBeenCalledWith('albums/a/a.jpg');
    expect(prisma.imageUpload.deleteMany).toHaveBeenCalledWith({
      where: { id: 'u1', status: 'pending' },
    });
  });

  it('cleans only the temporary key for old consumed sessions', async () => {
    const session = {
      id: 'u2',
      status: 'consumed',
      uploadObjectKey: 'uploads/u2/a.jpg',
      finalObjectKey: 'albums/a/a.jpg',
    };
    const prisma: any = {
      imageUpload: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([session]),
        deleteMany: jest.fn(),
      },
      image: { count: jest.fn() },
    };
    const storage: any = {
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    await new UploadCleanupService(prisma, storage).cleanupExpired();
    expect(storage.deleteObject).toHaveBeenCalledWith('uploads/u2/a.jpg');
    expect(storage.deleteObject).not.toHaveBeenCalledWith('albums/a/a.jpg');
  });
});
