import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_IMAGE_UPLOAD_POLICY } from '@ndt/image-upload-policy';
import { probeUploadCapability } from '../src/lib/image-upload/capability-probe';

test('returns a supported capability only when all probes pass', async () => {
  const result = await probeUploadCapability(INITIAL_IMAGE_UPLOAD_POLICY, undefined, { chromiumMajor: 136, imageDecoder: true, orientationMode: 'display', targetSizeDecode: true, webpEncode: true, srgbOutput: true });
  assert.equal(result.outcome, 'supported');
});

for (const [name, environment, code] of [
  ['old browser', { chromiumMajor: 135 }, 'browser_version_unsupported'],
  ['missing decoder', { chromiumMajor: 136, imageDecoder: false }, 'image_decoder_unavailable'],
  ['ambiguous orientation', { chromiumMajor: 136, imageDecoder: true, orientationMode: 'ambiguous' }, 'orientation_probe_failed'],
  ['missing target decode', { chromiumMajor: 136, imageDecoder: true, targetSizeDecode: false }, 'target_size_decode_unavailable'],
  ['missing encoder', { chromiumMajor: 136, imageDecoder: true, webpEncode: false }, 'webp_encode_unavailable'],
  ['unproven srgb', { chromiumMajor: 136, imageDecoder: true, srgbOutput: false }, 'srgb_output_unproven'],
] as const) {
  test(`fails closed for ${name}`, async () => {
    const result = await probeUploadCapability(INITIAL_IMAGE_UPLOAD_POLICY, undefined, environment);
    assert.deepEqual(result, { outcome: 'unsupported', code });
  });
}
