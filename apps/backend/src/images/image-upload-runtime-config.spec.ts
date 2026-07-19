import { INITIAL_IMAGE_UPLOAD_POLICY_VERSION } from '@ndt/image-upload-policy';
import {
  type ImageUploadProcessRole,
  parseImageUploadRuntimeConfig,
} from './image-upload-runtime-config';

const common = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://runtime-db.internal/app',
  IMAGE_UPLOAD_PROCESS_COUNT: '1',
  IMAGE_UPLOAD_DECODE_PERMITS_PER_PROCESS: '2',
  IMAGE_UPLOAD_R2_CONTROL_TIMEOUT_SECONDS: '30',
  IMAGE_UPLOAD_R2_READ_TIMEOUT_SECONDS: '60',
  IMAGE_UPLOAD_PRESIGN_ENABLED: 'false',
  IMAGE_UPLOAD_PRESIGN_CLOCK_SKEW_SECONDS: '60',
  IMAGE_UPLOAD_RATE_LIMIT_CLEANUP_BATCH: '1000',
  IMAGE_UPLOAD_POLICY_VERSION: INITIAL_IMAGE_UPLOAD_POLICY_VERSION,
  IMAGE_UPLOAD_R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
  IMAGE_UPLOAD_R2_BUCKET: 'ndt-production-images',
  IMAGE_UPLOAD_CANONICAL_PREFIX: 'albums/',
};

const api = {
  ...common,
  IMAGE_UPLOAD_PROCESS_ROLE: 'api',
  IMAGE_UPLOAD_API_R2_ACCESS_KEY_ID: 'api-access-key',
  IMAGE_UPLOAD_API_R2_SECRET_ACCESS_KEY: 'api-secret-key',
  IMGPROXY_BASE_URL: 'https://img.ndtstudio.site',
  IMGPROXY_KEY: 'imgproxy-key',
  IMGPROXY_SALT: 'imgproxy-salt',
  IMAGE_UPLOAD_TRUSTED_PROXY_ALLOWLIST: '10.0.0.0/8,192.0.2.10',
};

const reconciler = {
  ...common,
  IMAGE_UPLOAD_PROCESS_ROLE: 'reconciler',
  IMAGE_UPLOAD_RECONCILER_R2_ACCESS_KEY_ID: 'reconciler-access-key',
  IMAGE_UPLOAD_RECONCILER_R2_SECRET_ACCESS_KEY: 'reconciler-secret-key',
  IMAGE_UPLOAD_CLOUDFLARE_ACCOUNT_ID: 'production-account-id',
  IMAGE_UPLOAD_QUEUE_ID: 'production-source-queue-id',
  IMAGE_UPLOAD_DLQ_ID: 'production-dlq-id',
  IMAGE_UPLOAD_SOURCE_CONSUMER_ID: 'production-source-consumer-id',
  IMAGE_UPLOAD_DLQ_CONSUMER_ID: 'production-dlq-consumer-id',
  IMAGE_UPLOAD_QUEUE_TOKEN: 'queue-token',
};

const cutover = {
  ...common,
  IMAGE_UPLOAD_PROCESS_ROLE: 'cutover',
  IMAGE_UPLOAD_CUTOVER_R2_ACCESS_KEY_ID: 'cutover-access-key',
  IMAGE_UPLOAD_CUTOVER_R2_SECRET_ACCESS_KEY: 'cutover-secret-key',
  IMAGE_UPLOAD_CLOUDFLARE_ACCOUNT_ID: 'production-account-id',
  IMAGE_UPLOAD_QUEUE_ID: 'production-source-queue-id',
  IMAGE_UPLOAD_DLQ_ID: 'production-dlq-id',
  IMAGE_UPLOAD_SOURCE_CONSUMER_ID: 'production-source-consumer-id',
  IMAGE_UPLOAD_DLQ_CONSUMER_ID: 'production-dlq-consumer-id',
  IMAGE_UPLOAD_CUTOVER_QUEUE_TOKEN: 'cutover-queue-token',
  IMAGE_UPLOAD_OPERATOR_TOKEN: 'operator-token',
};

describe('parseImageUploadRuntimeConfig', () => {
  it.each([
    ['api', api],
    ['reconciler', reconciler],
    ['cutover', cutover],
  ] satisfies [ImageUploadProcessRole, Record<string, string>][])(
    'accepts the exact %s role contract and exposes a sanitized fingerprint',
    (role, env) => {
      const config = parseImageUploadRuntimeConfig(env, role);

      expect(config.processRole).toBe(role);
      expect(config.fingerprint).toMatchObject({
        role,
        policyVersion: INITIAL_IMAGE_UPLOAD_POLICY_VERSION,
        policyHash:
          '18da64f64a7d4a645b549c56ebc5dce84ed830f69defdf8b6d7f2b8d9659baef',
        processCount: 1,
        decodePermitsPerProcess: 2,
        r2ControlTimeoutSeconds: 30,
        r2ReadTimeoutSeconds: 60,
        ...(role === 'api' ? { trustedProxyCount: 2 } : {}),
      });
      expect(JSON.stringify(config.fingerprint)).not.toMatch(
        /secret|token|access-key/i,
      );
    },
  );

  it.each([
    ['IMAGE_UPLOAD_PROCESS_COUNT', '0'],
    ['IMAGE_UPLOAD_DECODE_PERMITS_PER_PROCESS', '0'],
    ['IMAGE_UPLOAD_PROCESS_COUNT', '2'],
    ['IMAGE_UPLOAD_R2_CONTROL_TIMEOUT_SECONDS', '0'],
    ['IMAGE_UPLOAD_R2_CONTROL_TIMEOUT_SECONDS', '121'],
    ['IMAGE_UPLOAD_R2_READ_TIMEOUT_SECONDS', '1.5'],
    ['IMAGE_UPLOAD_PRESIGN_ENABLED', 'TRUE'],
    ['IMAGE_UPLOAD_PRESIGN_CLOCK_SKEW_SECONDS', '301'],
    ['IMAGE_UPLOAD_RATE_LIMIT_CLEANUP_BATCH', '99'],
    ['IMAGE_UPLOAD_RATE_LIMIT_CLEANUP_BATCH', '10001'],
  ])('rejects invalid numeric or boolean config %s=%s', (key, value) => {
    expect(() =>
      parseImageUploadRuntimeConfig({ ...api, [key]: value }, 'api'),
    ).toThrow(key);
  });

  const forbidden = {
    api: [
      'IMAGE_UPLOAD_QUEUE_TOKEN',
      'IMAGE_UPLOAD_CUTOVER_QUEUE_TOKEN',
      'IMAGE_UPLOAD_OPERATOR_TOKEN',
      'IMAGE_UPLOAD_RECONCILER_R2_ACCESS_KEY_ID',
      'IMAGE_UPLOAD_RECONCILER_R2_SECRET_ACCESS_KEY',
      'IMAGE_UPLOAD_CUTOVER_R2_ACCESS_KEY_ID',
      'IMAGE_UPLOAD_CUTOVER_R2_SECRET_ACCESS_KEY',
      'NDT_STAGING_QUEUE_TOKEN',
      'NDT_STAGING_CUTOVER_QUEUE_TOKEN',
      'NDT_STAGING_CF_READ_TOKEN',
    ],
    reconciler: [
      'IMAGE_UPLOAD_CUTOVER_QUEUE_TOKEN',
      'IMAGE_UPLOAD_OPERATOR_TOKEN',
      'IMAGE_UPLOAD_API_R2_ACCESS_KEY_ID',
      'IMAGE_UPLOAD_API_R2_SECRET_ACCESS_KEY',
      'IMAGE_UPLOAD_CUTOVER_R2_ACCESS_KEY_ID',
      'IMAGE_UPLOAD_CUTOVER_R2_SECRET_ACCESS_KEY',
      'NDT_STAGING_QUEUE_TOKEN',
      'NDT_STAGING_CUTOVER_QUEUE_TOKEN',
      'NDT_STAGING_CF_READ_TOKEN',
    ],
    cutover: [
      'IMAGE_UPLOAD_QUEUE_TOKEN',
      'IMAGE_UPLOAD_API_R2_ACCESS_KEY_ID',
      'IMAGE_UPLOAD_API_R2_SECRET_ACCESS_KEY',
      'IMAGE_UPLOAD_RECONCILER_R2_ACCESS_KEY_ID',
      'IMAGE_UPLOAD_RECONCILER_R2_SECRET_ACCESS_KEY',
      'NDT_STAGING_QUEUE_TOKEN',
      'NDT_STAGING_CUTOVER_QUEUE_TOKEN',
      'NDT_STAGING_CF_READ_TOKEN',
    ],
  } as const;

  it.each(
    Object.entries(forbidden).flatMap(([role, keys]) =>
      keys.map((key) => [role, key] as const),
    ),
  )('rejects %s role forbidden variable %s', (role, key) => {
    const base =
      role === 'api' ? api : role === 'reconciler' ? reconciler : cutover;
    expect(() =>
      parseImageUploadRuntimeConfig(
        { ...base, [key]: 'must-not-cross-role-boundaries' },
        role as ImageUploadProcessRole,
      ),
    ).toThrow(key);
  });

  it.each([
    [{ ...api, IMAGE_UPLOAD_PROCESS_ROLE: 'worker' }, 'unknown role'],
    [
      { ...api, IMAGE_UPLOAD_PROCESS_ROLE: 'reconciler' },
      'forbidden for reconciler',
    ],
    [
      { ...api, IMAGE_UPLOAD_API_R2_SECRET_ACCESS_KEY: 'changeme' },
      'placeholder',
    ],
    [
      { ...api, IMAGE_UPLOAD_TRUSTED_PROXY_ALLOWLIST: '0.0.0.0/0' },
      'trusted proxy',
    ],
    [
      { ...api, IMAGE_UPLOAD_R2_BUCKET: 'ndt-staging-images' },
      'cross-environment',
    ],
    [
      { ...api, IMAGE_UPLOAD_CANONICAL_PREFIX: 'albums/run/' },
      'IMAGE_UPLOAD_CANONICAL_PREFIX',
    ],
    [
      { ...reconciler, IMAGE_UPLOAD_DLQ_ID: reconciler.IMAGE_UPLOAD_QUEUE_ID },
      'IMAGE_UPLOAD_DLQ_ID',
    ],
  ])('fails startup validation before external work: %s', (env, message) => {
    const provider = jest.fn();
    expect(() => {
      const config = parseImageUploadRuntimeConfig(
        env,
        env.IMAGE_UPLOAD_PROCESS_ROLE === 'worker'
          ? undefined
          : (env.IMAGE_UPLOAD_PROCESS_ROLE as ImageUploadProcessRole),
      );
      provider(config);
    }).toThrow(message);
    expect(provider).not.toHaveBeenCalled();
  });

  it('rejects a valid non-api role before the API listener can start', () => {
    expect(() => parseImageUploadRuntimeConfig(reconciler, 'api')).toThrow(
      'expected role api',
    );
  });

  it.each([
    ['api', api, 'IMAGE_UPLOAD_API_R2_SECRET_ACCESS_KEY'],
    ['api', api, 'IMAGE_UPLOAD_TRUSTED_PROXY_ALLOWLIST'],
    ['reconciler', reconciler, 'IMAGE_UPLOAD_QUEUE_TOKEN'],
    ['cutover', cutover, 'IMAGE_UPLOAD_OPERATOR_TOKEN'],
  ] as const)('requires %s variable %s', (role, env, key) => {
    const missing = { ...env };
    delete (missing as Record<string, string | undefined>)[key];
    expect(() => parseImageUploadRuntimeConfig(missing, role)).toThrow(key);
  });
});
