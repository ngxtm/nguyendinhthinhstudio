export type ImageUploadDeadlineOptions = {
  operationTimeoutMs: number;
  deadlines?: ReadonlyArray<Date | null | undefined>;
  parentSignal?: AbortSignal;
  now?: Date;
};

function abortError(): Error {
  const error = new Error('Image upload operation deadline exceeded');
  error.name = 'AbortError';
  return error;
}

export async function withImageUploadDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: ImageUploadDeadlineOptions,
): Promise<T> {
  if (
    !Number.isFinite(options.operationTimeoutMs) ||
    options.operationTimeoutMs <= 0
  ) {
    throw new RangeError('operationTimeoutMs must be positive');
  }

  const controller = new AbortController();
  const nowMs = (options.now ?? new Date()).getTime();
  const candidates = [
    options.operationTimeoutMs,
    ...(options.deadlines ?? [])
      .filter((value): value is Date => value instanceof Date)
      .map((value) => value.getTime() - nowMs),
  ];
  const timeoutMs = Math.max(0, Math.min(...candidates));
  let rejectAbort: ((reason: Error) => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const abort = () => {
    if (controller.signal.aborted) return;
    controller.abort();
    rejectAbort?.(abortError());
  };
  const parent = options.parentSignal;
  if (parent?.aborted) {
    abort();
  } else {
    parent?.addEventListener('abort', abort, { once: true });
  }
  const timer = setTimeout(abort, timeoutMs);

  try {
    return await Promise.race([operation(controller.signal), aborted]);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', abort);
  }
}
