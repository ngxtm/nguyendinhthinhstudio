import test from 'node:test';
import assert from 'node:assert/strict';
import { isReplayableBody, parseAllowedOrigins, validateApiOrigin } from '../src/lib/api/client';
import { getAccessTokenRole, safeAdminPath } from '../src/lib/auth/session';
import * as albumsApi from '../src/lib/api/albums';

test('admin API origin requires an absolute origin and rejects frontend origin', () => {
  assert.equal(validateApiOrigin('https://api.example.test', { production: true, frontendOrigin: 'https://admin.example.test' }), 'https://api.example.test');
  assert.throws(() => validateApiOrigin('/api', { production: true }), /absolute URL/);
  assert.throws(() => validateApiOrigin('https://admin.example.test', { production: true, frontendOrigin: 'https://admin.example.test' }), /frontend origin/);
  assert.throws(() => validateApiOrigin('http://api.example.test', { production: true }), /HTTPS/);
  assert.throws(() => validateApiOrigin('https://api.example.test/path', { production: true }), /origin/);
});

test('allowlist accepts exact origins only and rejects unsafe production HTTP', () => {
  assert.deepEqual([...parseAllowedOrigins('https://api.example.test', { production: true })], ['https://api.example.test']);
  assert.throws(() => parseAllowedOrigins('https://*.example.test', { production: true }), /origin/);
  assert.throws(() => parseAllowedOrigins('http://api.example.test', { production: true }), /HTTPS/);
  assert.deepEqual([...parseAllowedOrigins('http://127.0.0.1:3000', { production: false })], ['http://127.0.0.1:3000']);
});

test('stream bodies are never replayed while common bodies are', () => {
  assert.equal(isReplayableBody(undefined), true);
  assert.equal(isReplayableBody(JSON.stringify({ ok: true })), true);
  assert.equal(isReplayableBody(new FormData()), true);
  assert.equal(isReplayableBody(new ReadableStream()), false);
});

test('JWT role parsing handles base64url payloads and ignores standard Supabase role', () => {
  const payload = Buffer.from(JSON.stringify({ user_role: 'admin', role: 'authenticated' })).toString('base64url');
  assert.equal(getAccessTokenRole('header.' + payload + '.signature'), 'admin');
  const nonAdmin = Buffer.from(JSON.stringify({ role: 'authenticated' })).toString('base64url');
  assert.equal(getAccessTokenRole('header.' + nonAdmin + '.signature'), undefined);
});

test('intended admin paths cannot escape the admin area', () => {
  assert.equal(safeAdminPath('/admin/albums?tab=draft'), '/admin/albums?tab=draft');
  assert.equal(safeAdminPath('https://evil.test/admin'), '/admin');
  assert.equal(safeAdminPath('/admin/login'), '/admin');
  assert.equal(safeAdminPath('/public'), '/admin');
});

test('admin album detail uses the authenticated slug endpoint', () => {
  const endpoint = (
    albumsApi as typeof albumsApi & {
      adminAlbumBySlugEndpoint?: (slug: string) => string;
    }
  ).adminAlbumBySlugEndpoint;

  assert.equal(typeof endpoint, 'function');
  assert.equal(endpoint?.('testing-223'), '/albums/admin/slug/testing-223');
});
