import { assertCutoverEnvironment, assertProtectedPath, parseCutoverCommand } from './image-upload-cutover';
import { INITIAL_IMAGE_UPLOAD_POLICY_VERSION } from '@ndt/image-upload-policy';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const env = {
  NODE_ENV: 'production', DATABASE_URL: 'postgresql://db/app', IMAGE_UPLOAD_PROCESS_ROLE: 'cutover',
  IMAGE_UPLOAD_PROCESS_COUNT: '1', IMAGE_UPLOAD_DECODE_PERMITS_PER_PROCESS: '2', IMAGE_UPLOAD_R2_CONTROL_TIMEOUT_SECONDS: '30', IMAGE_UPLOAD_R2_READ_TIMEOUT_SECONDS: '60', IMAGE_UPLOAD_PRESIGN_ENABLED: 'false', IMAGE_UPLOAD_PRESIGN_CLOCK_SKEW_SECONDS: '60', IMAGE_UPLOAD_RATE_LIMIT_CLEANUP_BATCH: '1000', IMAGE_UPLOAD_POLICY_VERSION: INITIAL_IMAGE_UPLOAD_POLICY_VERSION, IMAGE_UPLOAD_R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com', IMAGE_UPLOAD_R2_BUCKET: 'production-images', IMAGE_UPLOAD_CANONICAL_PREFIX: 'albums/', IMAGE_UPLOAD_CUTOVER_R2_ACCESS_KEY_ID: 'cutover-key', IMAGE_UPLOAD_CUTOVER_R2_SECRET_ACCESS_KEY: 'cutover-secret', IMAGE_UPLOAD_OPERATOR_TOKEN: 'operator-token',
};

describe('image upload cutover command contract', () => {
  it('accepts cutover-only polling configuration', () => { expect(assertCutoverEnvironment(env).processRole).toBe('cutover'); });
  it('requires protected absolute evidence paths and closed modes', () => {
    const outside = (name: string) => join(tmpdir(), name);
    expect(() => assertProtectedPath('relative.json')).toThrow(/absolute/);
    expect(() => parseCutoverCommand(['audit', `--receipt=${outside('r.json')}`])).toThrow(/backup-receipt/);
    expect(() => parseCutoverCommand(['disposition', `--audit-receipt=${outside('a.json')}`, '--upload-id=u', '--decision=cleanup_authorized', `--evidence-receipt=${outside('e.json')}`, `--output=${outside('o.json')}`, '--operator-fingerprint=f'])).not.toThrow();
  });
});
