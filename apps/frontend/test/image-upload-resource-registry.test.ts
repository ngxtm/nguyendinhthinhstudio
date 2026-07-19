import test from 'node:test';
import assert from 'node:assert/strict';
import { BoundedImageResourceRegistry } from '../src/lib/image-upload/resource-registry';

test('bounds surfaces and output blobs', () => {
  const registry = new BoundedImageResourceRegistry();
  const a = registry.reserve('a', 'image-bitmap');
  registry.reserve('b', 'canvas');
  assert.throws(() => registry.reserve('c', 'worker-surface'), /surface_limit/);
  registry.release(a);
  registry.reserve('c', 'worker-surface');
  registry.reserve('a', 'output-blob');
  registry.reserve('b', 'output-blob');
  assert.throws(() => registry.reserve('c', 'output-blob'), /blob_limit/);
});

test('transfer invalidates old lease and release is idempotent', () => {
  const registry = new BoundedImageResourceRegistry();
  const lease = registry.reserve('item', 'canvas');
  const transferred = registry.transfer(lease, 'worker');
  assert.throws(() => registry.release(lease), /lease_invalid/);
  registry.release(transferred);
  registry.release(transferred);
  assert.equal(registry.snapshot().total, 0);
});
