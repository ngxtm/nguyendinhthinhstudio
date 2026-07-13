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
};

describe('validateEnv', () => {
  it.each([
    ['IMGPROXY_BASE_URL', { IMGPROXY_BASE_URL: '' }],
    ['IMGPROXY_KEY', { IMGPROXY_KEY: 'not-hex' }],
    ['IMGPROXY_SALT', { IMGPROXY_SALT: '' }],
    ['R2_S3_ENDPOINT', { R2_S3_ENDPOINT: 'http://account-id.r2.cloudflarestorage.com' }],
    ['IMAGE_DELIVERY_MODE', { IMAGE_DELIVERY_MODE: 'unsupported' }],
  ])('rejects an invalid %s value', (variable, override) => {
    expect(() => validateEnv({ ...validEnv, ...override })).toThrow(variable);
  });

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
