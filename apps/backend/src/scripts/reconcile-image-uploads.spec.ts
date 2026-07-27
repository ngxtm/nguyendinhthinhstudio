import {
  assertReconcilerEnvironment,
  createDedicatedHeartbeatWriter,
  initializeDedicatedHeartbeat,
  registerLockConnectionAbort,
} from './reconcile-image-uploads';

const reconcilerEnvironment = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://runtime-db.internal/app',
  IMAGE_UPLOAD_PROCESS_ROLE: 'reconciler',
  IMAGE_UPLOAD_PROCESS_COUNT: '1',
  IMAGE_UPLOAD_DECODE_PERMITS_PER_PROCESS: '2',
  IMAGE_UPLOAD_R2_CONTROL_TIMEOUT_SECONDS: '30',
  IMAGE_UPLOAD_R2_READ_TIMEOUT_SECONDS: '60',
  IMAGE_UPLOAD_PRESIGN_ENABLED: 'false',
  IMAGE_UPLOAD_PRESIGN_CLOCK_SKEW_SECONDS: '60',
  IMAGE_UPLOAD_RATE_LIMIT_CLEANUP_BATCH: '1000',
  IMAGE_UPLOAD_R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
  IMAGE_UPLOAD_R2_BUCKET: 'ndt-production-images',
  IMAGE_UPLOAD_CANONICAL_PREFIX: 'albums/',
  IMAGE_UPLOAD_RECONCILER_R2_ACCESS_KEY_ID: 'reconciler-access-key',
  IMAGE_UPLOAD_RECONCILER_R2_SECRET_ACCESS_KEY: 'reconciler-secret-key',
  IMAGE_UPLOAD_RECONCILE_GRACE_MS: '30000',
  IMAGE_UPLOAD_RECONCILE_CADENCE_MS: '5000',
  IMAGE_UPLOAD_BUILD_FINGERPRINT: `sha256:${'a'.repeat(64)}`,
};

describe('reconcile image uploads entrypoint', () => {
  it('requires reconciler role and exact runtime inputs', () => {
    expect(() => assertReconcilerEnvironment({ IMAGE_UPLOAD_PROCESS_ROLE: 'api' } as any)).toThrow('reconciler');
    expect(() =>
      assertReconcilerEnvironment(reconcilerEnvironment),
    ).not.toThrow();
  });

  it.each([
    ['IMAGE_UPLOAD_API_R2_ACCESS_KEY_ID', 'api-access-key'],
    ['IMAGE_UPLOAD_QUEUE_TOKEN', 'queue-token'],
    ['NDT_STAGING_EVENT_RULE_ID', 'event-rule'],
    ['IMGPROXY_KEY', 'api-imgproxy-key'],
  ])('rejects the API-only or obsolete variable %s', (key, value) => {
    expect(() =>
      assertReconcilerEnvironment({
        ...reconcilerEnvironment,
        [key]: value,
      }),
    ).toThrow(key);
  });

  it.each(['backend:latest', `backend@sha256:${'a'.repeat(64)}`])(
    'rejects a non-canonical reconciler build fingerprint %s',
    (fingerprint) => {
      expect(() =>
        assertReconcilerEnvironment({
          ...reconcilerEnvironment,
          IMAGE_UPLOAD_BUILD_FINGERPRINT: fingerprint,
        }),
      ).toThrow('IMAGE_UPLOAD_BUILD_FINGERPRINT');
    },
  );

  it('writes initialization and loop heartbeats through the lock client', async () => {
    const client = { query: jest.fn().mockResolvedValue({}) };
    await initializeDedicatedHeartbeat(
      client as never,
      'owner-1',
      'sha256:build-1',
      new Date('2026-07-20T00:00:00.000Z'),
    );
    const heartbeat = createDedicatedHeartbeatWriter(client as never);
    await heartbeat(
      'promotionRecoveryCompletedAt',
      new Date('2026-07-20T00:01:00.000Z'),
    );

    expect(client.query).toHaveBeenCalledTimes(2);
    expect(client.query.mock.calls[0][0]).toContain(
      'INSERT INTO "ImageUploadReconcilerHeartbeat"',
    );
    expect(client.query.mock.calls[1][0]).toContain(
      '"promotionRecoveryCompletedAt"',
    );
  });

  it('aborts in-flight work when the dedicated lock connection fails', () => {
    let onError: ((error: Error) => void) | undefined;
    const client = {
      on: jest.fn((event: string, listener: (error: Error) => void) => {
        if (event === 'error') onError = listener;
      }),
      off: jest.fn(),
    };
    const abort = new AbortController();
    const unregister = registerLockConnectionAbort(client as never, abort);

    onError?.(new Error('connection lost'));

    expect(abort.signal.aborted).toBe(true);
    unregister();
    expect(client.off).toHaveBeenCalledWith('error', expect.any(Function));
  });
});
