import { runSerializableWithRetry } from './serializable-retry';

const p2034 = Object.assign(new Error('write conflict'), { code: 'P2034' });

describe('runSerializableWithRetry', () => {
  it('retries P2034 twice then returns the third attempt result', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(p2034)
      .mockRejectedValueOnce(p2034)
      .mockResolvedValueOnce('ok');

    await expect(runSerializableWithRetry(operation)).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('supports one scoped additional retryable conflict within the same bound', async () => {
    const adoptionConflict = Object.assign(new Error('unique winner'), {
      code: 'P2002',
      meta: { target: ['clientRequestId'] },
    });
    const operation = jest
      .fn()
      .mockRejectedValueOnce(adoptionConflict)
      .mockResolvedValueOnce('adopted');

    await expect(
      runSerializableWithRetry(
        operation,
        (error) => error === adoptionConflict,
      ),
    ).resolves.toBe('adopted');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('rethrows the third P2034 and never retries another error', async () => {
    const conflicts = jest.fn().mockRejectedValue(p2034);
    await expect(runSerializableWithRetry(conflicts)).rejects.toBe(p2034);
    expect(conflicts).toHaveBeenCalledTimes(3);

    const other = new Error('validation failed');
    const nonConflict = jest.fn().mockRejectedValue(other);
    await expect(runSerializableWithRetry(nonConflict)).rejects.toBe(other);
    expect(nonConflict).toHaveBeenCalledTimes(1);
  });
});
