import {
  assertPresignedUrlMatchesExpiry,
  createPresignExpiry,
  remainingPresignSeconds,
  truncateToWholeSecond,
} from './image-upload-presign-expiry';

describe('fixed image upload presign expiry', () => {
  it('truncates issue time and fixes expiry exactly one hour later', () => {
    const issued = new Date('2026-07-19T10:00:00.999Z');
    expect(truncateToWholeSecond(issued).toISOString()).toBe(
      '2026-07-19T10:00:00.000Z',
    );
    expect(createPresignExpiry(issued).toISOString()).toBe(
      '2026-07-19T11:00:00.000Z',
    );
  });

  it.each([
    ['2026-07-19T10:00:00.001Z', 3600],
    ['2026-07-19T10:30:00.999Z', 1800],
    ['2026-07-19T10:59:59.999Z', 1],
  ])('returns whole remaining seconds at %s', (now, expected) => {
    expect(
      remainingPresignSeconds(
        new Date(now),
        new Date('2026-07-19T11:00:00.000Z'),
      ),
    ).toBe(expected);
  });

  it.each([
    '2026-07-19T11:00:00.000Z',
    '2026-07-19T11:00:01.000Z',
    '2026-07-19T09:59:59.000Z',
  ])('fails closed outside 1..3600 seconds at %s', (now) => {
    expect(() =>
      remainingPresignSeconds(
        new Date(now),
        new Date('2026-07-19T11:00:00.000Z'),
      ),
    ).toThrow('presign expiry');
  });

  it('accepts only a signed URL whose effective expiry equals the persisted instant', () => {
    const persisted = new Date('2026-07-19T11:00:00.000Z');
    expect(() =>
      assertPresignedUrlMatchesExpiry(
        'https://r2.example/key?X-Amz-Date=20260719T100000Z&X-Amz-Expires=3600',
        persisted,
      ),
    ).not.toThrow();
    expect(() =>
      assertPresignedUrlMatchesExpiry(
        'https://r2.example/key?X-Amz-Date=20260719T103000Z&X-Amz-Expires=3600',
        persisted,
      ),
    ).toThrow('effective expiry');
  });
});
