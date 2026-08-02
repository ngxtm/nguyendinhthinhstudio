import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { runCli } from '../import-ndt-albums.mjs';

function album(id, thumbnailPath) {
    return {
        title: `Session ${id}`,
        slug: `session-${id}`,
        partNumber: 1,
        partCount: 1,
        shootDate: '2025-02-25',
        categorySlugs: [],
        tagSlugs: [],
        metaTitle: '',
        metaDescription: '',
        coverFile: `${id}.jpg`,
        images: [
            {
                id: `image-${id}`,
                relativePath: `${id}.jpg`,
                normalizedFilename: `${id}.jpg`,
                thumbnailPath,
                capturedAt: '2025-02-25T10:00:00.000Z',
                altText: '',
            },
        ],
        needsReview: ['ai_enrichment_required'],
    };
}

function analysisFor(target) {
    const imageId = target.images[0].id;
    return {
        title: `Concept ${imageId}`,
        categorySlugs: ['nu'],
        tagSlugs: ['studio'],
        proposedTags: [],
        metaTitle: `Concept ${imageId} | NDT Studio`,
        metaDescription:
            'Bộ ảnh chân dung nghệ thuật với ánh sáng tinh tế được thực hiện tại NDT Studio.',
        coverFileId: imageId,
        imageAltTexts: { [imageId]: `Ảnh chân dung ${imageId} tại NDT Studio.` },
        needsReview: [],
    };
}

function analysisWithTitle(target, title) {
    return {
        ...analysisFor(target),
        title,
        metaTitle: `${title} | NDT Studio`,
    };
}

async function createFixture(count) {
    const directory = await mkdtemp(join(tmpdir(), 'ndt-enrichment-'));
    const manifestPath = join(directory, 'manifest.json');
    const albums = [];
    for (let index = 1; index <= count; index += 1) {
        const thumbnailPath = join(directory, `${index}.webp`);
        await writeFile(thumbnailPath, Buffer.from(`thumbnail-${index}`));
        albums.push(album(String(index), thumbnailPath));
    }
    await writeFile(
        manifestPath,
        JSON.stringify({
            schemaVersion: 1,
            productionOrigin: 'https://api.ndtstudio.site',
            sourceRoot: directory,
            albums,
            unassignedImages: [],
            skippedFiles: [],
            tagBackfill: [],
            approval: { approvedAt: '2026-08-01T00:00:00.000Z', digest: 'stale' },
        }),
    );
    return { directory, manifestPath };
}

function catalogFetch(url) {
    if (String(url).includes('/albums?')) {
        return Promise.resolve(
            new Response(JSON.stringify({ data: [] }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }),
        );
    }
    return Promise.resolve(
        new Response(
            JSON.stringify(
                String(url).endsWith('/categories')
                    ? [{ name: 'Nữ', slug: 'nu' }]
                    : [{ name: 'Studio', slug: 'studio' }],
            ),
            { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
}

function catalogFetchWithAlbums(albums) {
    return (url) => {
        if (String(url).includes('/albums?')) {
            return Promise.resolve(
                new Response(JSON.stringify({ data: albums }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                }),
            );
        }
        return catalogFetch(url);
    };
}

test('checkpoints successful albums, records failures, and resumes without repeating AI calls', async () => {
    const { directory, manifestPath } = await createFixture(2);
    const journalPath = `${manifestPath}.enrich-journal.json`;
    const calls = new Map();
    try {
        const first = await runCli(['enrich', '--manifest', manifestPath], {
            fetchImpl: catalogFetch,
            aiSleep: async () => {},
            aiAnalyze: async ({ album: target }) => {
                const id = target.images[0].id;
                calls.set(id, (calls.get(id) ?? 0) + 1);
                if (id === 'image-2')
                    throw Object.assign(new Error('provider unavailable'), { status: 503 });
                return analysisFor(target);
            },
        });
        const afterFailure = JSON.parse(await readFile(manifestPath, 'utf8'));
        const checkpoint = JSON.parse(await readFile(journalPath, 'utf8'));

        assert.equal(first.exitCode, 1);
        assert.equal(calls.get('image-1'), 1);
        assert.equal(calls.get('image-2'), 3);
        assert.equal(afterFailure.albums[0].title, 'Concept image-1');
        assert.equal(afterFailure.albums[1].title, 'Session 2');
        assert.equal(afterFailure.approval, undefined);
        assert.equal(
            Object.values(checkpoint.albums).filter((entry) => entry.outcome === 'complete').length,
            1,
        );
        assert.equal(
            Object.values(checkpoint.albums).filter((entry) => entry.outcome === 'failed').length,
            1,
        );

        calls.clear();
        const second = await runCli(['enrich', '--manifest', manifestPath], {
            fetchImpl: catalogFetch,
            aiSleep: async () => {},
            aiAnalyze: async ({ album: target }) => {
                const id = target.images[0].id;
                calls.set(id, (calls.get(id) ?? 0) + 1);
                return analysisFor(target);
            },
        });
        const completed = JSON.parse(await readFile(manifestPath, 'utf8'));

        assert.equal(second.exitCode, 0);
        assert.equal(calls.has('image-1'), false);
        assert.equal(calls.get('image-2'), 1);
        assert.deepEqual(
            completed.albums.map((entry) => entry.title),
            ['Concept image-1', 'Concept image-2'],
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('runs album AI with bounded concurrency of two and reports progress', async () => {
    const { directory, manifestPath } = await createFixture(4);
    let active = 0;
    let maximumActive = 0;
    const progress = [];
    try {
        const result = await runCli(['enrich', '--manifest', manifestPath], {
            fetchImpl: catalogFetch,
            stdout: (message) => progress.push(message),
            aiAnalyze: async ({ album: target }) => {
                active += 1;
                maximumActive = Math.max(maximumActive, active);
                await new Promise((resolve) => setTimeout(resolve, 5));
                active -= 1;
                return analysisFor(target);
            },
        });

        assert.equal(result.exitCode, 0);
        assert.equal(maximumActive, 2);
        assert.match(progress.join('\n'), /album \d+\/4/);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('refreshes a legacy album checkpoint once while reusing current prompt results', async () => {
    const { directory, manifestPath } = await createFixture(1);
    const checkpointPath = `${manifestPath}.enrich-journal.json`;
    let calls = 0;
    try {
        await runCli(['enrich', '--manifest', manifestPath], {
            fetchImpl: catalogFetch,
            aiAnalyze: async ({ album: target }) => {
                calls += 1;
                return analysisWithTitle(target, 'Legacy Name');
            },
        });
        const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
        const [key] = Object.keys(checkpoint.albums);
        checkpoint.albums[key].promptVersion = 'legacy-v1';
        await writeFile(checkpointPath, JSON.stringify(checkpoint));

        calls = 0;
        await runCli(['enrich', '--manifest', manifestPath], {
            fetchImpl: catalogFetch,
            aiAnalyze: async ({ album: target }) => {
                calls += 1;
                return analysisWithTitle(target, 'Scarlet Reverie');
            },
        });
        assert.equal(calls, 1);
        const refreshed = JSON.parse(await readFile(checkpointPath, 'utf8'));
        assert.equal(refreshed.albums[key].promptVersion, 'artistic-collection-v2');

        calls = 0;
        await runCli(['enrich', '--manifest', manifestPath], {
            fetchImpl: catalogFetch,
            aiAnalyze: async () => {
                calls += 1;
                assert.fail('current prompt result must resume');
            },
        });
        assert.equal(calls, 0);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('retries an artistic title that collides with a production album', async () => {
    const { directory, manifestPath } = await createFixture(1);
    const contexts = [];
    let calls = 0;
    try {
        const result = await runCli(['enrich', '--manifest', manifestPath], {
            fetchImpl: catalogFetchWithAlbums([
                { title: 'Midnight Frequency', slug: 'midnight-frequency' },
            ]),
            aiAnalyze: async ({ album: target, namingContext }) => {
                contexts.push(namingContext);
                calls += 1;
                return analysisWithTitle(
                    target,
                    calls === 1 ? 'Midnight Frequency' : 'Scarlet Reverie',
                );
            },
        });
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

        assert.equal(result.exitCode, 0);
        assert.equal(calls, 2);
        assert.equal(manifest.albums[0].title, 'Scarlet Reverie');
        assert.equal(manifest.albums[0].slug, 'scarlet-reverie');
        assert.equal(contexts[1].rejectedTitle, 'Midnight Frequency');
        assert.ok(contexts[1].reservedTitles.includes('Midnight Frequency'));
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('retries one of two imported albums that generate the same slug', async () => {
    const { directory, manifestPath } = await createFixture(2);
    const attempts = new Map();
    const contexts = [];
    try {
        const result = await runCli(['enrich', '--manifest', manifestPath], {
            fetchImpl: catalogFetch,
            aiAnalyze: async ({ album: target, namingContext }) => {
                const id = target.images[0].id;
                const attempt = (attempts.get(id) ?? 0) + 1;
                attempts.set(id, attempt);
                contexts.push(namingContext);
                return analysisWithTitle(target, attempt === 1 ? 'Xích Điệp' : 'Nguyệt Lam');
            },
        });
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
        const slugs = manifest.albums.map((entry) => entry.slug).sort();

        assert.equal(result.exitCode, 0);
        assert.equal(
            [...attempts.values()].reduce((sum, value) => sum + value, 0),
            3,
        );
        assert.deepEqual(slugs, ['nguyet-lam', 'xich-diep']);
        assert.ok(contexts.some((context) => context.rejectedTitle === 'Xích Điệp'));
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('records a failure when three artistic naming attempts still collide', async () => {
    const { directory, manifestPath } = await createFixture(1);
    const checkpointPath = `${manifestPath}.enrich-journal.json`;
    let calls = 0;
    try {
        const result = await runCli(['enrich', '--manifest', manifestPath], {
            fetchImpl: catalogFetchWithAlbums([
                { title: 'Midnight Frequency', slug: 'midnight-frequency' },
            ]),
            aiAnalyze: async ({ album: target }) => {
                calls += 1;
                return analysisWithTitle(target, 'Midnight Frequency');
            },
        });
        const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
        const entry = Object.values(checkpoint.albums)[0];

        assert.equal(result.exitCode, 1);
        assert.equal(calls, 3);
        assert.equal(entry.outcome, 'failed');
        assert.equal(entry.promptVersion, 'artistic-collection-v2');
        assert.match(entry.lastError, /^duplicate_album_slug:midnight-frequency$/);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
