import { canonicalizeEtag, toHttpEtag } from './canonical-etag';

describe('canonical ETag', () => {
  it.each([
    ['Cloudflare event', 'AbC123', 'AbC123'],
    ['AWS quoted response', '"AbC123"', 'AbC123'],
    ['unquoted response', 'etag-with-dash', 'etag-with-dash'],
  ])('canonicalizes %s without case folding', (_label, input, expected) => {
    expect(canonicalizeEtag(input)).toBe(expected);
  });

  it('quotes only at the conditional HTTP boundary', () => {
    expect(toHttpEtag('AbC123')).toBe('"AbC123"');
    expect(toHttpEtag('"AbC123"')).toBe('"AbC123"');
  });

  it.each(['', ' ', 'W/"etag"', '"unterminated', 'unterminated"', '""', 'bad\nvalue', '"bad\rvalue"', 'bad"value'])(
    'rejects malformed ETag %j',
    (value) => {
      expect(() => canonicalizeEtag(value)).toThrow('ETag');
    },
  );
});
