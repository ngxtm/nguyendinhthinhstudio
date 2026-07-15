import {
  createHmac,
  createPublicKey,
  createVerify,
  timingSafeEqual,
} from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';

export type JwtMode = 'migration' | 'asymmetric';
export type AsymmetricAlgorithm = 'ES256' | 'RS256';

export interface JwtVerifierOptions {
  mode: JwtMode;
  issuer: string;
  audience: string;
  asymmetricAlgorithms: AsymmetricAlgorithm[];
  legacySecret?: string;
  legacyRemovalDeadline?: Date;
}

export interface SigningKeyResolver {
  resolve(kid: string): Promise<string>;
}

export interface VerifiedUser {
  userId: string;
  email?: string;
  role?: 'admin';
}

type JwtHeader = {
  alg?: string;
  kid?: string;
};

type JwtClaims = {
  sub?: unknown;
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  email?: unknown;
  user_role?: unknown;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function decodePart<T>(encoded: string): T {
  try {
    const value: unknown = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    );
    if (!value || typeof value !== 'object') {
      throw new Error('not an object');
    }
    return value as T;
  } catch {
    throw new UnauthorizedException('Malformed JWT');
  }
}

function splitToken(rawToken: string): {
  signingInput: string;
  signature: Buffer;
  header: JwtHeader;
  claims: JwtClaims;
} {
  const parts = rawToken.split('.');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw new UnauthorizedException('Malformed JWT');
  }

  return {
    signingInput: parts.slice(0, 2).join('.'),
    signature: Buffer.from(parts[2], 'base64url'),
    header: decodePart<JwtHeader>(parts[0]),
    claims: decodePart<JwtClaims>(parts[1]),
  };
}

function verifyHs256(
  signingInput: string,
  signature: Buffer,
  secret: string,
): boolean {
  const expected = createHmac('sha256', secret).update(signingInput).digest();
  return (
    expected.length === signature.length && timingSafeEqual(expected, signature)
  );
}

function verifyAsymmetric(
  algorithm: AsymmetricAlgorithm,
  signingInput: string,
  signature: Buffer,
  pem: string,
): boolean {
  const verifier = createVerify('sha256');
  verifier.update(signingInput);
  verifier.end();

  try {
    return verifier.verify(
      {
        key: createPublicKey(pem),
        ...(algorithm === 'ES256'
          ? { dsaEncoding: 'ieee-p1363' as const }
          : {}),
      },
      signature,
    );
  } catch {
    return false;
  }
}

function validateClaims(
  claims: JwtClaims,
  options: JwtVerifierOptions,
): VerifiedUser {
  if (claims.iss !== options.issuer) {
    throw new UnauthorizedException('Invalid token issuer');
  }

  const audience = claims.aud;
  const audienceMatches =
    audience === options.audience ||
    (Array.isArray(audience) &&
      audience.length === 1 &&
      audience[0] === options.audience);
  if (!audienceMatches) {
    throw new UnauthorizedException('Invalid token audience');
  }

  if (
    typeof claims.exp !== 'number' ||
    !Number.isFinite(claims.exp) ||
    claims.exp <= Math.floor(Date.now() / 1000)
  ) {
    throw new UnauthorizedException('Token expired');
  }

  if (typeof claims.sub !== 'string' || !uuidPattern.test(claims.sub)) {
    throw new UnauthorizedException('Invalid token subject');
  }

  return {
    userId: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : undefined,
    role: claims.user_role === 'admin' ? 'admin' : undefined,
  };
}

export class JwtVerifier {
  constructor(
    private readonly options: JwtVerifierOptions,
    private readonly keyResolver: SigningKeyResolver,
  ) {}

  async verify(rawToken: string): Promise<VerifiedUser> {
    const { signingInput, signature, header, claims } = splitToken(rawToken);
    const algorithm = header.alg;

    if (algorithm === 'HS256') {
      if (
        this.options.mode !== 'migration' ||
        !this.options.legacySecret ||
        !this.options.legacyRemovalDeadline ||
        this.options.legacyRemovalDeadline.getTime() <= Date.now()
      ) {
        throw new UnauthorizedException('Legacy JWT validation is unavailable');
      }
      if (!verifyHs256(signingInput, signature, this.options.legacySecret)) {
        throw new UnauthorizedException('Invalid token signature');
      }
    } else if (algorithm === 'ES256' || algorithm === 'RS256') {
      if (!this.options.asymmetricAlgorithms.includes(algorithm)) {
        throw new UnauthorizedException('Unsupported token algorithm');
      }
      if (typeof header.kid !== 'string' || header.kid.length === 0) {
        throw new UnauthorizedException('Missing signing key id');
      }
      const pem = await this.keyResolver.resolve(header.kid).catch(() => {
        throw new UnauthorizedException('Unable to resolve signing key');
      });
      if (!verifyAsymmetric(algorithm, signingInput, signature, pem)) {
        throw new UnauthorizedException('Invalid token signature');
      }
    } else {
      throw new UnauthorizedException('Unsupported token algorithm');
    }

    return validateClaims(claims, this.options);
  }
}
