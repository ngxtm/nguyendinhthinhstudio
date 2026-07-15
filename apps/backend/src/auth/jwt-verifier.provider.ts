import { ConfigService } from '@nestjs/config';
import {
  JwtVerifier as TokenVerifier,
  type AsymmetricAlgorithm,
  type JwtMode,
} from './jwt-verifier';
import { JwksResolver } from './jwks-resolver';

export const JWT_VERIFIER = Symbol('JWT_VERIFIER');
export type JwtVerifier = TokenVerifier;

export function createJwtVerifier(configService: ConfigService): TokenVerifier {
  const mode = configService.getOrThrow<JwtMode>('SUPABASE_JWT_MODE');
  const asymmetricAlgorithms = configService
    .getOrThrow<string>('SUPABASE_JWT_ALGORITHMS')
    .split(',')
    .map((value) => value.trim())
    .filter(
      (value): value is AsymmetricAlgorithm =>
        value === 'ES256' || value === 'RS256',
    );
  const legacyRemovalDeadline = configService.get<string>(
    'SUPABASE_JWT_LEGACY_REMOVAL_DEADLINE',
  );

  return new TokenVerifier(
    {
      mode,
      issuer: configService.getOrThrow<string>('SUPABASE_JWT_ISSUER'),
      audience: configService.getOrThrow<string>('SUPABASE_JWT_AUDIENCE'),
      asymmetricAlgorithms,
      legacySecret: configService.get<string>('SUPABASE_JWT_SECRET'),
      legacyRemovalDeadline: legacyRemovalDeadline
        ? new Date(legacyRemovalDeadline)
        : undefined,
    },
    new JwksResolver({
      jwksUrl: configService.getOrThrow<string>('SUPABASE_JWKS_URL'),
    }),
  );
}
