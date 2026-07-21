const MAX_PRESIGN_SECONDS = 3600;

export function truncateToWholeSecond(value: Date): Date {
  const time = value.getTime();
  if (!Number.isFinite(time)) throw new TypeError('clock is invalid');
  return new Date(Math.floor(time / 1000) * 1000);
}

export function createPresignExpiry(issuedAt: Date): Date {
  return new Date(
    truncateToWholeSecond(issuedAt).getTime() + MAX_PRESIGN_SECONDS * 1000,
  );
}

export function remainingPresignSeconds(
  now: Date,
  persistedExpiry: Date,
): number {
  const current = truncateToWholeSecond(now);
  const expiry = truncateToWholeSecond(persistedExpiry);
  if (expiry.getTime() !== persistedExpiry.getTime()) {
    throw new TypeError('persisted presign expiry must be a whole second');
  }
  const remaining = (expiry.getTime() - current.getTime()) / 1000;
  if (
    !Number.isInteger(remaining) ||
    remaining < 1 ||
    remaining > MAX_PRESIGN_SECONDS
  ) {
    throw new RangeError('presign expiry must have 1..3600 seconds remaining');
  }
  return remaining;
}

function parseSigningDate(value: string): Date {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (!match) throw new TypeError('signed URL has an invalid signing date');
  const [, year, month, day, hour, minute, second] = match;
  const parsed = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  );
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() !== Number(month) - 1 ||
    parsed.getUTCDate() !== Number(day) ||
    parsed.getUTCHours() !== Number(hour) ||
    parsed.getUTCMinutes() !== Number(minute) ||
    parsed.getUTCSeconds() !== Number(second)
  ) {
    throw new TypeError('signed URL has an invalid signing date');
  }
  return parsed;
}

export function assertPresignedUrlMatchesExpiry(
  signedUrl: string,
  persistedExpiry: Date,
): void {
  const url = new URL(signedUrl);
  const signingDate = url.searchParams.get('X-Amz-Date');
  const expires = url.searchParams.get('X-Amz-Expires');
  if (signingDate === null || expires === null || !/^[1-9]\d*$/.test(expires)) {
    throw new TypeError('signed URL expiry evidence is missing');
  }
  const expiresIn = Number(expires);
  if (!Number.isSafeInteger(expiresIn) || expiresIn > MAX_PRESIGN_SECONDS) {
    throw new TypeError('signed URL expiry evidence is invalid');
  }
  const effective = parseSigningDate(signingDate).getTime() + expiresIn * 1000;
  if (effective !== persistedExpiry.getTime()) {
    throw new Error(
      'signed URL effective expiry does not match persisted expiry',
    );
  }
}
