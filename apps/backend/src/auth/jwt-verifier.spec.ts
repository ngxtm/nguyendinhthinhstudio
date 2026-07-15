import {
  createHmac,
  generateKeyPairSync,
  sign as signBytes,
} from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { JwtVerifier } from './jwt-verifier';

const issuer = 'https://project-ref.supabase.co/auth/v1';
const audience = 'authenticated';
const subject = '00000000-0000-4000-8000-000000000001';
const legacySecret = 'legacy-test-secret';
const ecKeys = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const publicPem = ecKeys.publicKey
  .export({ format: 'pem', type: 'spki' })
  .toString();

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function claims(overrides: Record<string, unknown> = {}) {
  return {
    sub: subject,
    iss: issuer,
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 300,
    email: 'admin@example.com',
    role: 'authenticated',
    user_role: 'admin',
    ...overrides,
  };
}

function signHs256(
  overrides: Record<string, unknown> = {},
  secret = legacySecret,
): string {
  const signingInput = [
    encodeJson({ alg: 'HS256', typ: 'JWT' }),
    encodeJson(claims(overrides)),
  ].join('.');
  const signature = createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64url');
  return `${signingInput}.${signature}`;
}

function signEs256(overrides: Record<string, unknown> = {}): string {
  const signingInput = [
    encodeJson({ alg: 'ES256', typ: 'JWT', kid: 'standby-key' }),
    encodeJson(claims(overrides)),
  ].join('.');
  const signature = signBytes('sha256', Buffer.from(signingInput), {
    key: ecKeys.privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  return `${signingInput}.${signature}`;
}

function migrationVerifier(resolve = jest.fn<Promise<string>, [string]>()) {
  return {
    verifier: new JwtVerifier(
      {
        mode: 'migration',
        issuer,
        audience,
        asymmetricAlgorithms: ['ES256', 'RS256'],
        legacySecret,
        legacyRemovalDeadline: new Date('2099-01-01T00:00:00.000Z'),
      },
      { resolve },
    ),
    resolve,
  };
}

describe('JwtVerifier', () => {
  it('verifies a valid HS256 token in migration mode', async () => {
    const { verifier, resolve } = migrationVerifier();

    await expect(verifier.verify(signHs256())).resolves.toEqual({
      userId: subject,
      email: 'admin@example.com',
      role: 'admin',
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('does not try JWKS when HS256 verification fails', async () => {
    const { verifier, resolve } = migrationVerifier();

    await expect(
      verifier.verify(signHs256({}, 'wrong-secret')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('verifies a valid asymmetric token without trying the legacy key', async () => {
    const resolve = jest.fn<Promise<string>, [string]>(async () => publicPem);
    const { verifier } = migrationVerifier(resolve);

    await expect(verifier.verify(signEs256())).resolves.toMatchObject({
      userId: subject,
      role: 'admin',
    });
    expect(resolve).toHaveBeenCalledWith('standby-key');
  });

  it('rejects HS256 in asymmetric mode without trying JWKS', async () => {
    const resolve = jest.fn<Promise<string>, [string]>();
    const verifier = new JwtVerifier(
      {
        mode: 'asymmetric',
        issuer,
        audience,
        asymmetricAlgorithms: ['ES256', 'RS256'],
      },
      { resolve },
    );

    await expect(verifier.verify(signHs256())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(resolve).not.toHaveBeenCalled();
  });

  it('rejects an expired migration deadline before verifying HS256', async () => {
    const resolve = jest.fn<Promise<string>, [string]>();
    const verifier = new JwtVerifier(
      {
        mode: 'migration',
        issuer,
        audience,
        asymmetricAlgorithms: ['ES256', 'RS256'],
        legacySecret,
        legacyRemovalDeadline: new Date('2020-01-01T00:00:00.000Z'),
      },
      { resolve },
    );

    await expect(verifier.verify(signHs256())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each([
    ['issuer', { iss: 'https://attacker.example/auth/v1' }],
    ['audience', { aud: 'different-audience' }],
    ['subject', { sub: 'not-a-uuid' }],
    ['expiration', { exp: Math.floor(Date.now() / 1000) - 1 }],
  ])('rejects a token with an invalid %s claim', async (_claim, overrides) => {
    const { verifier } = migrationVerifier();

    await expect(verifier.verify(signHs256(overrides))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('never maps the standard Supabase role claim to an application role', async () => {
    const { verifier } = migrationVerifier();

    await expect(
      verifier.verify(signHs256({ user_role: undefined })),
    ).resolves.toMatchObject({ role: undefined });
  });
});
