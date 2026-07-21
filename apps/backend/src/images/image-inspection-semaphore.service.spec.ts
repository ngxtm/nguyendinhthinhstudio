import { ImageInspectionSemaphoreService } from './image-inspection-semaphore.service';

describe('ImageInspectionSemaphoreService', () => {
  it('limits concurrent permits and grants waiters FIFO', async () => {
    const semaphore = new ImageInspectionSemaphoreService(2);
    const first = await semaphore.acquire();
    const second = await semaphore.acquire();
    let thirdGranted = false;
    const third = semaphore.acquire().then((release) => {
      thirdGranted = true;
      return release;
    });

    await Promise.resolve();
    expect(thirdGranted).toBe(false);
    first();
    const thirdRelease = await third;
    expect(thirdGranted).toBe(true);
    thirdRelease();
    second();
  });

  it('removes an aborted waiter without leaking a permit', async () => {
    const semaphore = new ImageInspectionSemaphoreService(1);
    const release = await semaphore.acquire();
    const controller = new AbortController();
    const waiting = semaphore.acquire(controller.signal);
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    release();
    await expect(semaphore.acquire()).resolves.toEqual(expect.any(Function));
  });

  it('release is idempotent and never exceeds the configured capacity', async () => {
    const semaphore = new ImageInspectionSemaphoreService(1);
    const release = await semaphore.acquire();
    release();
    release();
    const next = await semaphore.acquire();
    let extraGranted = false;
    const extra = semaphore.acquire().then((fn) => {
      extraGranted = true;
      return fn;
    });
    await Promise.resolve();
    expect(extraGranted).toBe(false);
    next();
    const extraRelease = await extra;
    extraRelease();
  });

  it('rejects invalid permit counts', () => {
    expect(() => new ImageInspectionSemaphoreService(0)).toThrow(
      'decode permits',
    );
  });
});
