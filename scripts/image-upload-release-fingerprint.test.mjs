import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createReleaseFingerprint } from './image-upload-release-fingerprint.mjs';

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const cli = resolve(scriptsDirectory, 'image-upload-release-fingerprint.mjs');
const commit = 'b'.repeat(40);
const expected = `sha256:${createHash('sha256').update(commit, 'utf8').digest('hex')}`;

test('hashes the exact lowercase full commit with no newline', () => {
    assert.equal(createReleaseFingerprint(commit), expected);
});

for (const invalid of ['main', 'b'.repeat(12), 'B'.repeat(40), `${commit}\n`, `sha256:${commit}`]) {
    test(`rejects noncanonical commit input ${JSON.stringify(invalid)}`, () => {
        assert.throws(() => createReleaseFingerprint(invalid), /40-character lowercase Git commit/);
    });
}

test('CLI prints only the canonical fingerprint', () => {
    const result = spawnSync(process.execPath, [cli, commit], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `${expected}\n`);
});

test('CLI rejects missing or multiple arguments', () => {
    for (const args of [[], [commit, commit]]) {
        const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /exactly one full Git commit/);
    }
});
