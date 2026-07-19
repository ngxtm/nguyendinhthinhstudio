import { ImageUploadProviderEventQuarantineLocationRebuilderService } from './image-upload-provider-event-quarantine-location-rebuilder.service';

describe('quarantine location rebuilder', () => {
  it('repairs stale denormalized pointers from append-only history', async () => {
    const prisma: any = { imageUploadProviderEventQuarantine: { findMany: jest.fn().mockResolvedValue([{ id: 'q', latestLocationObservationSha256: 'old' }]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, imageUploadProviderEventQuarantineLocation: { findFirst: jest.fn().mockResolvedValue({ locationObservationSha256: 'new' }) } };
    await expect(new ImageUploadProviderEventQuarantineLocationRebuilderService(prisma).rebuild()).resolves.toEqual({ scanned: 1, rebuilt: 1 });
    expect(prisma.imageUploadProviderEventQuarantine.updateMany).toHaveBeenCalled();
  });
});
