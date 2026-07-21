Object.assign(process.env, {
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:1/ndt_studio_test',
  SUPABASE_URL: 'https://project-ref.supabase.co',
  SUPABASE_JWT_ISSUER: 'https://project-ref.supabase.co/auth/v1',
  SUPABASE_JWT_AUDIENCE: 'authenticated',
  SUPABASE_JWKS_URL:
    'https://project-ref.supabase.co/auth/v1/.well-known/jwks.json',
  SUPABASE_JWT_ALGORITHMS: 'HS256,ES256,RS256',
  SUPABASE_JWT_MODE: 'migration',
  SUPABASE_JWT_SECRET: 'test-jwt-secret',
  SUPABASE_JWT_LEGACY_REMOVAL_DEADLINE: '2099-01-01T00:00:00.000Z',
  CLOUDFLARE_R2_BUCKET_NAME: 'ndt-studio-test-images',
  R2_ACCESS_KEY_ID: 'test-r2-access-key',
  R2_SECRET_ACCESS_KEY: 'test-r2-secret-access-key',
  R2_S3_ENDPOINT: 'https://test-account.r2.cloudflarestorage.com',
  IMGPROXY_KEY: 'a'.repeat(64),
  IMGPROXY_SALT: 'b'.repeat(64),
  IMGPROXY_BASE_URL: 'https://img.test.ndtstudio.site',
});
