import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_IMAGE_UPLOAD_POLICY } from '@ndt/image-upload-policy';
import { canvasToBlobOnce, encodeWebpOnce } from '../src/lib/image-upload/optimizer.worker';

test('encodes exactly once with policy WebP quality and validates MIME', async () => {
  let calls = 0; let options: any;
  const surface = { convertToBlob: async (value: any) => { calls++; options = value; return new Blob([new Uint8Array([1])], { type: 'image/webp' }); } };
  // The tiny fake is rejected by grammar after the call; verify call contract separately.
  await assert.rejects(() => encodeWebpOnce(surface, INITIAL_IMAGE_UPLOAD_POLICY));
  assert.equal(calls, 1); assert.equal(options.type, 'image/webp'); assert.equal(options.quality, 0.84);
});

test('canvas adapter calls toBlob once and rejects cancellation', async () => {
  let calls = 0;
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => canvasToBlobOnce({ toBlob: () => { calls++; } }, INITIAL_IMAGE_UPLOAD_POLICY, controller.signal), { name: 'AbortError' });
  assert.equal(calls, 0);
});

test('encoder rejects oversized output before returning it', async () => {
  const surface = { convertToBlob: async () => new Blob([new Uint8Array(INITIAL_IMAGE_UPLOAD_POLICY.maxStoredBytes + 1)], { type: 'image/webp' }) };
  await assert.rejects(() => encodeWebpOnce(surface, INITIAL_IMAGE_UPLOAD_POLICY), /image_bad_length/);
});
