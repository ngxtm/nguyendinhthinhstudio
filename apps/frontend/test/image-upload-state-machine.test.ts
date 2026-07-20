import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_IMAGE_UPLOAD_POLICY } from '@ndt/image-upload-policy';
import { BoundedImageResourceRegistry } from '../src/lib/image-upload/resource-registry';
import { UploadScheduler } from '../src/lib/image-upload/upload-scheduler';

test('scheduler limits active work to two and reaches success', async () => {
  let active = 0; let peak = 0;
  const deps: any = {
    optimize: async (file: File) => { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 5)); active--; return { blob: file, filename: file.name, contentType: 'image/png', fileSize: file.size, processedSha256: 'a'.repeat(64), width: 1, height: 1, policyVersion: 'p', disposition: 'passed-through' }; },
    presign: async () => ({ outcome: 'ready', statusCode: 200, uploadId: crypto.randomUUID(), uploadUrl: 'https://upload', expiresAt: new Date(Date.now() + 60_000).toISOString() }),
    put: async (_url: string, _blob: Blob, progress: any) => progress(100),
    confirm: async () => ({ outcome: 'consumed', statusCode: 200, uploadId: 'u', image: {}, resultImageId: 'i', resultDeletedAt: null, retentionExpiresAt: new Date().toISOString() }),
    status: async () => ({ outcome: 'consumed' }), abandon: async () => undefined,
  };
  const scheduler = new UploadScheduler(INITIAL_IMAGE_UPLOAD_POLICY, { outcome: 'supported', chromiumMajor: 136, orientationMode: 'display', targetSizeDecode: true, webpEncode: true, srgbOutput: true }, new BoundedImageResourceRegistry(), deps);
  scheduler.enqueue([new File(['a'], 'a.png', { type: 'image/png' }), new File(['b'], 'b.png', { type: 'image/png' }), new File(['c'], 'c.png', { type: 'image/png' })], 'album');
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(peak <= 2); assert.equal(scheduler.items.filter((item) => item.state === 'success').length, 3);
});
