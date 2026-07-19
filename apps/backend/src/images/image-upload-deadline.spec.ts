import { withImageUploadDeadline } from './image-upload-deadline';

describe('withImageUploadDeadline', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('uses the earliest operation, request, session, and lease deadline', async () => {
    const startedAt = new Date('2026-07-20T00:00:00.000Z');
    jest.setSystemTime(startedAt);
    const pending = withImageUploadDeadline(
      () => new Promise<never>(() => undefined),
      {
        operationTimeoutMs: 30_000,
        deadlines: [
          new Date(startedAt.getTime() + 20_000),
          new Date(startedAt.getTime() + 5_000),
          new Date(startedAt.getTime() + 10_000),
        ],
      },
    );

    await jest.advanceTimersByTimeAsync(4_999);
    let settled = false;
    void pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await Promise.resolve();
    expect(settled).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('propagates parent abort and removes its listener in finally', async () => {
    const parent = new AbortController();
    const add = jest.spyOn(parent.signal, 'addEventListener');
    const remove = jest.spyOn(parent.signal, 'removeEventListener');
    const pending = withImageUploadDeadline(
      () => new Promise<never>(() => undefined),
      { operationTimeoutMs: 30_000, parentSignal: parent.signal },
    );

    parent.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(add).toHaveBeenCalledWith('abort', expect.any(Function), {
      once: true,
    });
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(jest.getTimerCount()).toBe(0);
  });

  it('passes one abort signal to the operation and clears timers on success', async () => {
    const operation = jest.fn(async (signal: AbortSignal) => {
      expect(signal.aborted).toBe(false);
      return 'ok';
    });

    await expect(
      withImageUploadDeadline(operation, { operationTimeoutMs: 30_000 }),
    ).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});
