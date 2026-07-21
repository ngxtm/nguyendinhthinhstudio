import { assertConflictResolverEnvironment, parseConflictResolution } from './resolve-image-upload-promotion-conflict';

describe('promotion conflict resolver contract', () => {
  it('requires cutover-only credentials and a closed disposition', () => {
    expect(() => assertConflictResolverEnvironment({ IMAGE_UPLOAD_PROCESS_ROLE: 'api' } as any)).toThrow();
    expect(() => parseConflictResolution(['--resolution=unknown'])).toThrow();
    expect(() => parseConflictResolution(['--resolution=confirmed_absent', '--conflict-id=c', '--evidence-receipt=x', '--operator-fingerprint=o', '--approval-digest=a'])).not.toThrow();
    expect(() => assertConflictResolverEnvironment({ IMAGE_UPLOAD_PROCESS_ROLE: 'cutover', IMAGE_UPLOAD_OPERATOR_TOKEN: 'token', IMAGE_UPLOAD_CUTOVER_QUEUE_TOKEN: 'obsolete' } as any)).toThrow(/obsolete|Queue/i);
  });
});
