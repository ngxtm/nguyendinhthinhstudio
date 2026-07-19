import { assertReconcilerEnvironment } from './reconcile-image-uploads';

describe('reconcile image uploads entrypoint', () => {
  it('requires reconciler role and exact runtime inputs', () => {
    expect(() => assertReconcilerEnvironment({ IMAGE_UPLOAD_PROCESS_ROLE: 'api' } as any)).toThrow('reconciler');
    expect(() => assertReconcilerEnvironment({ IMAGE_UPLOAD_PROCESS_ROLE: 'reconciler', DATABASE_URL: 'postgres://db', IMAGE_UPLOAD_CLOUDFLARE_ACCOUNT_ID: 'a', IMAGE_UPLOAD_R2_BUCKET: 'b', IMAGE_UPLOAD_QUEUE_ID: 'q', IMAGE_UPLOAD_QUEUE_TOKEN: 'secret' } as any)).not.toThrow();
  });
});
