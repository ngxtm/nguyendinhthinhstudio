export type UploadQueueResult = {
  completed: number
  failed: number
}

export async function runUploadQueue<T>(
  items: readonly T[],
  concurrency: number,
  run: (item: T) => Promise<void>
): Promise<UploadQueueResult> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new RangeError('concurrency must be a positive safe integer')
  }

  let cursor = 0
  let completed = 0
  let failed = 0

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++
      if (index >= items.length) return

      try {
        await run(items[index])
        completed++
      } catch {
        failed++
      }
    }
  }

  const workerCount = Math.min(concurrency, items.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return { completed, failed }
}
