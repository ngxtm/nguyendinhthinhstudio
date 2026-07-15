import { validateEnv } from './env.validation';

const validEnv = {
  NODE_ENV: 'production',
  CLOUDFLARE_R2_BUCKET_NAME: 'ndt-studio-images',
  R2_ACCESS_KEY_ID: 'r2-access-key',
  R2_SECRET_ACCESS_KEY: 'r2-secret-access-key',
  R2_S3_ENDPOINT: 'https://account-id.r2.cloudflarestorage.com',
  IMGPROXY_KEY: 'a'.repeat(64),
  IMGPROXY_SALT: 'b'.repeat(64),
  IMGPROXY_BASE_URL: 'https://img.ndtstudio.site',
  IMAGE_DELIVERY_MODE: 'legacy',
  SUPABASE_URL: 'https://project-ref.supabase.co',
  SUPABASE_JWT_ISSUER: 'https://project-ref.supabase.co/auth/v1',
  SUPABASE_JWT_AUDIENCE: 'authenticated',
  SUPABASE_JWKS_URL:
    'https://project-ref.supabase.co/auth/v1/.well-known/jwks.json',
  SUPABASE_JWT_ALGORITHMS: 'ES256,RS256',
  SUPABASE_JWT_MODE: 'asymmetric',
};

describe('validateEnv', () => {
  it.each([
    ['IMGPROXY_BASE_URL', { IMGPROXY_BASE_URL: '' }],
    ['IMGPROXY_KEY', { IMGPROXY_KEY: 'not-hex' }],
    ['IMGPROXY_SALT', { IMGPROXY_SALT: '' }],
    [
      'R2_S3_ENDPOINT',
      { R2_S3_ENDPOINT: 'http://account-id.r2.cloudflarestorage.com' },
    ],
    ['IMAGE_DELIVERY_MODE', { IMAGE_DELIVERY_MODE: 'unsupported' }],
  ])('rejects an invalid %s value', (variable, override) => {
    expect(() => validateEnv({ ...validEnv, ...override })).toThrow(variable);
  });

  it.each([
    ['SUPABASE_URL', { SUPABASE_URL: '' }],
    [
      'SUPABASE_JWT_ISSUER',
      { SUPABASE_JWT_ISSUER: 'https://attacker.example/auth/v1' },
    ],
    ['SUPABASE_JWT_AUDIENCE', { SUPABASE_JWT_AUDIENCE: '' }],
    [
      'SUPABASE_JWKS_URL',
      { SUPABASE_JWKS_URL: 'https://attacker.example/jwks.json' },
    ],
    [
      'SUPABASE_JWKS_URL',
      {
        SUPABASE_JWKS_URL:
          'http://project-ref.supabase.co/auth/v1/.well-known/jwks.json',
      },
    ],
    ['SUPABASE_JWT_ALGORITHMS', { SUPABASE_JWT_ALGORITHMS: 'HS256' }],
    ['SUPABASE_JWT_MODE', { SUPABASE_JWT_MODE: 'unsupported' }],
    ['SUPABASE_JWT_SECRET', { SUPABASE_JWT_SECRET: 'must-not-remain' }],
    [
      'SUPABASE_JWT_LEGACY_REMOVAL_DEADLINE',
      { SUPABASE_JWT_LEGACY_REMOVAL_DEADLINE: '2027-01-01T00:00:00.000Z' },
    ],
  ])(
    'rejects invalid asymmetric auth configuration for %s',
    (variable, override) => {
      expect(() => validateEnv({ ...validEnv, ...override })).toThrow(variable);
    },
  );

  it('accepts a time-limited migration configuration', () => {
    const migrationEnv = {
      ...validEnv,
      SUPABASE_JWT_MODE: 'migration',
      SUPABASE_JWT_SECRET: 'legacy-test-secret',
      SUPABASE_JWT_LEGACY_REMOVAL_DEADLINE: '2099-01-01T00:00:00.000Z',
      SUPABASE_JWT_ALGORITHMS: 'HS256,ES256,RS256',
    };

    expect(validateEnv(migrationEnv)).toMatchObject(migrationEnv);
  });

  it.each([
    ['SUPABASE_JWT_SECRET', { SUPABASE_JWT_SECRET: undefined }],
    [
      'SUPABASE_JWT_LEGACY_REMOVAL_DEADLINE',
      { SUPABASE_JWT_LEGACY_REMOVAL_DEADLINE: undefined },
    ],
    [
      'SUPABASE_JWT_LEGACY_REMOVAL_DEADLINE',
      { SUPABASE_JWT_LEGACY_REMOVAL_DEADLINE: 'not-a-date' },
    ],
    [
      'SUPABASE_JWT_LEGACY_REMOVAL_DEADLINE',
      { SUPABASE_JWT_LEGACY_REMOVAL_DEADLINE: '2020-01-01T00:00:00.000Z' },
    ],
  ])(
    'rejects invalid migration auth configuration for %s',
    (variable, override) => {
      expect(() =>
        validateEnv({
          ...validEnv,
          SUPABASE_JWT_MODE: 'migration',
          SUPABASE_JWT_SECRET: 'legacy-test-secret',
          SUPABASE_JWT_LEGACY_REMOVAL_DEADLINE: '2099-01-01T00:00:00.000Z',
          SUPABASE_JWT_ALGORITHMS: 'HS256,ES256,RS256',
          ...override,
        }),
      ).toThrow(variable);
    },
  );

  it('allows a missing delivery mode outside production', () => {
    expect(
      validateEnv({
        ...validEnv,
        NODE_ENV: 'development',
        IMAGE_DELIVERY_MODE: undefined,
      }),
    ).toMatchObject({ NODE_ENV: 'development' });
  });

  it('rejects a missing delivery mode in production', () => {
    expect(() =>
      validateEnv({ ...validEnv, IMAGE_DELIVERY_MODE: undefined }),
    ).toThrow('IMAGE_DELIVERY_MODE is required');
  });

  it('returns valid R2 and imgproxy configuration unchanged', () => {
    expect(validateEnv(validEnv)).toMatchObject(validEnv);
  });
});
