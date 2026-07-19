import { assertQuarantineResolverEnvironment, parseQuarantineResolution } from './resolve-image-upload-provider-event-quarantine';

describe('provider event quarantine resolver contract', () => {
  it('requires cutover role and closed quarantine dispositions', () => {
    expect(() => assertQuarantineResolverEnvironment({ IMAGE_UPLOAD_PROCESS_ROLE: 'reconciler' } as any)).toThrow();
    expect(() => parseQuarantineResolution(['--resolution=delete'])).toThrow();
    expect(() => parseQuarantineResolution(['--resolution=quarantined_ack', '--quarantine-id=q', '--source-queue-id=s', '--dlq-id=d', '--evidence-receipt=x', '--operator-fingerprint=o', '--approval-digest=a'])).not.toThrow();
  });
});
