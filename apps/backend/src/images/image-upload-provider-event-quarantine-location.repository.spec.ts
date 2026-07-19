import { ImageUploadProviderEventQuarantineLocationRepository } from './image-upload-provider-event-quarantine-location.repository';

describe('quarantine location repository', () => {
  it('reuses one observation and advances latest pointer', async () => {
    const location = { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'l1' }) };
    const quarantine = { updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
    const prisma = { $transaction: jest.fn((fn: any) => fn({ imageUploadProviderEventQuarantineLocation: location, imageUploadProviderEventQuarantine: quarantine })) };
    const repo = new ImageUploadProviderEventQuarantineLocationRepository(prisma as never);
    const input: any = { quarantineId: 'q1', queueKind: 'source', queueId: 'queue', messageId: 'm', leaseId: 'l', leaseDeadline: new Date('2026-07-20T00:00:00Z'), attempts: 1, observedAt: new Date('2026-07-20T00:00:00Z') };
    await repo.appendOrReuseLocationObservation(input);
    await repo.appendOrReuseLocationObservation(input);
    expect(location.create).toHaveBeenCalledTimes(2);
    expect(quarantine.updateMany).toHaveBeenCalled();
  });
});
