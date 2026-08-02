import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { assertJournalSafe, loadJournal, saveJournal } from './journal.mjs';

test('atomically saves and reloads resumable state', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ndt-journal-'));
    const path = join(directory, 'journal.json');
    try {
        const journal = {
            schemaVersion: 1,
            manifestDigest: 'a'.repeat(64),
            albums: {
                'da-tiec-do': {
                    remoteAlbumId: 'album-1',
                    images: {
                        'image-1': {
                            uploadId: 'upload-1',
                            remoteImageId: 'remote-image-1',
                            outcome: 'consumed',
                        },
                    },
                },
            },
        };

        await saveJournal(path, journal);

        assert.deepEqual(await loadJournal(path), journal);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('refuses to persist tokens, API keys, upload URLs, or authorization headers', () => {
    for (const unsafe of [
        { accessToken: 'secret' },
        { apiKey: 'secret' },
        { uploadUrl: 'https://presigned.example' },
        { authorization: 'Bearer secret' },
    ]) {
        assert.throws(
            () => assertJournalSafe(unsafe),
            /journal contains forbidden secret material/,
        );
    }
});
