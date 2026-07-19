import { ImageUploadProviderEventQuarantineResolutionRepository } from './image-upload-provider-event-quarantine-resolution.repository';

describe('quarantine resolution repository', () => {
  it('delegates begin/finalize/reopen to durable promotion repository', async () => {
    const promotions: any = { beginProviderEventQuarantineResolution: jest.fn().mockResolvedValue('begin'), finalizeProviderEventQuarantineResolution: jest.fn().mockResolvedValue('final'), reopenProviderEventQuarantineAfterReplay: jest.fn().mockResolvedValue('reopen') };
    const repo = new ImageUploadProviderEventQuarantineResolutionRepository(promotions);
    await expect(repo.begin({})).resolves.toBe('begin');
    await expect(repo.finalize({})).resolves.toBe('final');
    await expect(repo.reopen({})).resolves.toBe('reopen');
  });
});
