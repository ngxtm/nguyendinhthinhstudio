import { generateKeyPairSync } from 'node:crypto';
import { JwksResolver } from './jwks-resolver';

const publicJwk = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .publicKey.export({ format: 'jwk' });
Object.assign(publicJwk, { kid: 'key-1', alg: 'RS256', use: 'sig' });

function response(body: unknown, init: { status?: number; url?: string } = {}) {
  const text = JSON.stringify(body);
  return {
    ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
    status: init.status ?? 200,
    url: init.url ?? 'https://project-ref.supabase.co/auth/v1/.well-known/jwks.json',
    headers: new Headers({ 'content-length': String(Buffer.byteLength(text)) }),
    text: async () => text,
  } as Response;
}

describe('JwksResolver', () => {
  it('shares one refresh across concurrent key lookups', async () => {
    const fetcher = jest.fn(async () => response({ keys: [publicJwk] }));
    const resolver = new JwksResolver({
      jwksUrl: 'https://project-ref.supabase.co/auth/v1/.well-known/jwks.json',
      fetcher,
      refreshCooldownMs: 0,
    });

    const [first, second] = await Promise.all([
      resolver.resolve('key-1'),
      resolver.resolve('key-1'),
    ]);

    expect(first).toContain('PUBLIC KEY');
    expect(second).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      'https://project-ref.supabase.co/auth/v1/.well-known/jwks.json',
      expect.objectContaining({ redirect: 'error' }),
    );
  });

  it('negatively caches unknown key ids', async () => {
    const fetcher = jest.fn(async () => response({ keys: [] }));
    const resolver = new JwksResolver({
      jwksUrl: 'https://project-ref.supabase.co/auth/v1/.well-known/jwks.json',
      fetcher,
      refreshCooldownMs: 0,
    });

    await expect(resolver.resolve('missing')).rejects.toThrow('Unknown signing key');
    await expect(resolver.resolve('missing')).rejects.toThrow('Unknown signing key');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects a response whose final URL leaves the pinned endpoint', async () => {
    const fetcher = jest.fn(async () =>
      response({ keys: [publicJwk] }, { url: 'https://attacker.example/jwks.json' }),
    );
    const resolver = new JwksResolver({
      jwksUrl: 'https://project-ref.supabase.co/auth/v1/.well-known/jwks.json',
      fetcher,
      refreshCooldownMs: 0,
    });

    await expect(resolver.resolve('key-1')).rejects.toThrow('Pinned JWKS URL');
  });

  it('rejects oversized and malformed JWKS responses', async () => {
    const oversized = jest.fn(async () => ({
      ...response({ keys: [] }),
      headers: new Headers({ 'content-length': '9999999' }),
    }));
    const resolver = new JwksResolver({
      jwksUrl: 'https://project-ref.supabase.co/auth/v1/.well-known/jwks.json',
      fetcher: oversized,
      maxResponseBytes: 128,
      refreshCooldownMs: 0,
    });
    await expect(resolver.resolve('key-1')).rejects.toThrow('too large');

    const malformed = new JwksResolver({
      jwksUrl: 'https://project-ref.supabase.co/auth/v1/.well-known/jwks.json',
      fetcher: jest.fn(async () => ({
        ...response({}),
        text: async () => '{not-json',
      } as Response)),
      refreshCooldownMs: 0,
    });
    await expect(malformed.resolve('key-1')).rejects.toThrow('Malformed JWKS');
  });
});
