export const SERIALIZABLE_MAX_ATTEMPTS = 3;

function isP2034(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2034'
  );
}

export async function runSerializableWithRetry<T>(
  operation: () => Promise<T>,
  isAdditionalRetryable: (error: unknown) => boolean = () => false,
): Promise<T> {
  for (let attempt = 1; attempt <= SERIALIZABLE_MAX_ATTEMPTS; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (
        (!isP2034(error) && !isAdditionalRetryable(error)) ||
        attempt === SERIALIZABLE_MAX_ATTEMPTS
      ) {
        throw error;
      }
    }
  }

  throw new Error('Serializable retry exhausted');
}
