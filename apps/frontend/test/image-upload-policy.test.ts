import test from 'node:test';
import assert from 'node:assert/strict';
import { IMAGE_GRAMMAR_FIXTURES, INITIAL_IMAGE_UPLOAD_POLICY } from '@ndt/image-upload-policy';
import { optimizeImage } from '../src/lib/image-upload/optimizer';
import { BoundedImageResourceRegistry } from '../src/lib/image-upload/resource-registry';

test('fails closed for source bytes above 100 MiB', async () => {
  const file = new File([new Uint8Array(INITIAL_IMAGE_UPLOAD_POLICY.maxSourceBytes + 1)], 'large.jpg', { type: 'image/jpeg' });
  await assert.rejects(() => optimizeImage(file, INITIAL_IMAGE_UPLOAD_POLICY, { outcome: 'supported', chromiumMajor: 136, orientationMode: 'display', targetSizeDecode: true, webpEncode: true, srgbOutput: true }, new BoundedImageResourceRegistry()), /image_source_bytes_exceeded/);
});

test('uses a validated pass-through for small already-compliant sources', async () => {
  const fixture = IMAGE_GRAMMAR_FIXTURES.find((item) => item.id === 'png-srgb')!;
  let png = new Uint8Array(); for await (const chunk of fixture.input()) png = chunk;
  const file = new File([png], 'tiny.png', { type: 'image/png' });
  const result = await optimizeImage(file, INITIAL_IMAGE_UPLOAD_POLICY, { outcome: 'supported', chromiumMajor: 136, orientationMode: 'display', targetSizeDecode: true, webpEncode: true, srgbOutput: true }, new BoundedImageResourceRegistry());
  assert.equal(result.disposition, 'passed-through');
  assert.equal(result.contentType, 'image/png');
  assert.match(result.processedSha256, /^[a-f0-9]{64}$/);
});
