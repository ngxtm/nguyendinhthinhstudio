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
};

describe('validateEnv', () => {
  it.each([
    ['IMGPROXY_BASE_URL', { IMGPROXY_BASE_URL: '' }],
    ['IMGPROXY_KEY', { IMGPROXY_KEY: 'not-hex' }],
    ['IMGPROXY_SALT', { IMGPROXY_SALT: '' }],
    ['R2_S3_ENDPOINT', { R2_S3_ENDPOINT: 'http://account-id.r2.cloudflarestorage.com' }],
  ])('rejects an invalid %s value', (variable, override) => {
    expect(() => validateEnv({ ...validEnv, ...override })).toThrow(variable);
  });

  it('returns valid R2 and imgproxy configuration unchanged', () => {
    expect(validateEnv(validEnv)).toMatchObject(validEnv);
  });
});
