import { validateR2CopyEvent } from './r2-copy-event';

describe('validateR2CopyEvent', () => {
  it('validates identity, canonicalizes ETag, and derives a stable ID', () => {
    const event = validateR2CopyEvent({ account: 'a', bucket: 'b', action: 'CopyObject', object: { key: 'albums/x' , etag: '"abc"' }, copySource: { key: 'uploads/y' }, eventTime: '2026-07-20T00:00:00Z' }, { account: 'a', bucket: 'b' });
    expect(event.destinationEtag).toBe('abc');
    expect(event.providerEventId).toMatch(/^[a-f0-9]{64}$/);
  });
  it('rejects weak or mismatched events', () => {
    expect(() => validateR2CopyEvent({ account: 'x', bucket: 'b', action: 'CopyObject', object: 'k', copySource: 's', etag: 'W/"x"', eventTime: '2026-07-20T00:00:00Z' }, { account: 'a', bucket: 'b' })).toThrow();
  });
});
