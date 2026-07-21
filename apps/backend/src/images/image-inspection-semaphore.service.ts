import { Inject, Injectable, Optional } from '@nestjs/common';

type Waiter = {
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
};

function abortError(): Error {
  const error = new Error('Decode permit acquisition aborted');
  error.name = 'AbortError';
  return error;
}

@Injectable()
export class ImageInspectionSemaphoreService {
  private readonly waiters: Waiter[] = [];
  private active = 0;

  constructor(
    @Optional()
    @Inject('IMAGE_UPLOAD_DECODE_PERMITS_PER_PROCESS')
    private readonly capacity = 2,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('decode permits must be a positive integer');
    }
  }

  acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) {
      return Promise.reject(abortError());
    }
    if (this.active < this.capacity && this.waiters.length === 0) {
      this.active += 1;
      return Promise.resolve(this.createRelease());
    }

    return new Promise<() => void>((resolve, reject) => {
      const waiter: Waiter = { resolve, reject, signal };
      waiter.onAbort = () => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) {
          this.waiters.splice(index, 1);
          reject(abortError());
        }
      };
      signal?.addEventListener('abort', waiter.onAbort, { once: true });
      this.waiters.push(waiter);
      this.pump();
    });
  }

  private createRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      this.pump();
    };
  }

  private pump(): void {
    while (this.active < this.capacity && this.waiters.length > 0) {
      const waiter = this.waiters.shift()!;
      if (waiter.signal?.aborted) {
        waiter.onAbort?.();
        continue;
      }
      if (waiter.onAbort) {
        waiter.signal?.removeEventListener('abort', waiter.onAbort);
      }
      this.active += 1;
      waiter.resolve(this.createRelease());
    }
  }
}
