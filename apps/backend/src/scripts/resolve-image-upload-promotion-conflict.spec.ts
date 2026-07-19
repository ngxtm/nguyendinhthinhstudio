import { assertConflictResolverEnvironment, parseConflictResolution } from './resolve-image-upload-promotion-conflict';

describe('promotion conflict resolver contract', () => {
  it('requires cutover-only credentials and a closed disposition', () => {
    expect(() => assertConflictResolverEnvironment({ IMAGE_UPLOAD_PROCESS_ROLE: 'api' } as any)).toThrow();
    expect(() => parseConflictResolution(['--resolution=unknown'])).toThrow();
    expect(() => parseConflictResolution(['--resolution=confirmed_absent_ack', '--conflict-id=c', '--provider-event-id=e', '--source-queue-id=q', '--dlq-id=d', '--evidence-receipt=x', '--operator-fingerprint=o', '--approval-digest=a'])).not.toThrow();
  });
});
