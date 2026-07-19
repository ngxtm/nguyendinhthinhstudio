import { ImageUploadProviderEventQuarantineActionRepository } from './image-upload-provider-event-quarantine-action.repository';

describe('quarantine action repository', () => {
  it('is idempotent by action hash', async () => {
    const action = { findUnique: jest.fn().mockResolvedValue({ id: 'existing' }), create: jest.fn() };
    const prisma = { $transaction: jest.fn((fn: any) => fn({ imageUploadProviderEventQuarantineAction: action })) };
    const input: any = { quarantineId: 'q', resolutionAttemptId: 'r', locationObservationSha256: 'l', action: 'ack_requested', queueKind: 'source', queueId: 'q1', messageId: 'm', leaseId: 'lease', observedAt: new Date() };
    await expect(new ImageUploadProviderEventQuarantineActionRepository(prisma as never).appendOrReuseAction(input)).resolves.toEqual({ id: 'existing' });
    expect(action.create).not.toHaveBeenCalled();
  });
});
