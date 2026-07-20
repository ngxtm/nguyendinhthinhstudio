import test from 'node:test';
import assert from 'node:assert/strict';
import { createClientRequestId } from '../src/lib/api/images';

test('client request IDs are unique UUID-like values', () => {
  const a = createClientRequestId(); const b = createClientRequestId();
  assert.notEqual(a, b); assert.match(a, /^[0-9a-f-]+$/i);
});
