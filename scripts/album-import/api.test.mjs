import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ProductionApiClient,
    applyApprovedTagBackfill,
    deterministicClientRequestId,
    executeApprovedAlbum,
    uploadPreparedImage,
} from './api.mjs';

function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

test('pins API calls to production and sends the admin bearer token', async () => {
    const calls = [];
    const client = new ProductionApiClient({
        token: 'secret-token',
        fetchImpl: async (url, init) => {
            calls.push({ url: String(url), init });
            return jsonResponse(200, { ok: true });
        },
    });

    await client.request('/categories');

    assert.equal(calls[0].url, 'https://api.ndtstudio.site/categories');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer secret-token');
    assert.throws(() => client.request('https://evil.example/categories'), /relative endpoint/);
});

test('waits for server retryAfter and retries a rate-limited request', async () => {
    const waits = [];
    let calls = 0;
    const now = Date.parse('2026-08-01T00:00:00.000Z');
    const client = new ProductionApiClient({
        token: 'secret-token',
        now: () => now,
        sleep: async (milliseconds) => waits.push(milliseconds),
        fetchImpl: async () => {
            calls += 1;
            if (calls === 1) {
                return jsonResponse(429, {
                    code: 'upload_rate_limited',
                    retryAfter: '2026-08-01T00:00:02.000Z',
                });
            }
            return jsonResponse(200, { outcome: 'ready' });
        },
    });

    await client.request('/images/upload-url', {
        method: 'POST',
        body: {},
        scope: 'upload_url',
    });

    assert.equal(calls, 2);
    assert.deepEqual(waits, [2000]);
});

test('uploads to a presigned URL without leaking the admin bearer token', async () => {
    const calls = [];
    const client = new ProductionApiClient({
        token: 'secret-token',
        fetchImpl: async (url, init) => {
            calls.push({ url: String(url), init });
            return new Response(null, { status: 200 });
        },
    });

    await client.putPresigned('https://r2.example.test/upload', Buffer.from('webp'));

    assert.equal(calls[0].init.headers.Authorization, undefined);
    assert.equal(calls[0].init.headers['Content-Type'], 'image/webp');
});

test('derives a stable UUID client request ID from album slug and source digest', () => {
    const first = deterministicClientRequestId('album-slug', 'a'.repeat(64));
    const second = deterministicClientRequestId('album-slug', 'a'.repeat(64));

    assert.equal(first, second);
    assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('runs ready -> PUT -> confirm and returns the consumed image', async () => {
    const events = [];
    const api = {
        presign: async () => {
            events.push('presign');
            return { outcome: 'ready', uploadId: 'upload-1', uploadUrl: 'https://r2/upload' };
        },
        putPresigned: async () => events.push('put'),
        confirm: async () => {
            events.push('confirm');
            return { outcome: 'consumed', image: { id: 'remote-image-1' } };
        },
        status: async () => assert.fail('status should not be needed'),
        waitUntil: async () => {},
    };

    const result = await uploadPreparedImage({
        api,
        albumId: 'album-1',
        albumSlug: 'album-slug',
        image: {
            filename: 'photo.webp',
            fileSize: 100,
            processedSha256: 'a'.repeat(64),
            data: Buffer.from('webp'),
        },
    });

    assert.deepEqual(events, ['presign', 'put', 'confirm']);
    assert.equal(result.image.id, 'remote-image-1');
});

test('sets cover before publish and never sends an album description', async () => {
    const events = [];
    const api = {
        findAdminAlbumBySlug: async () => null,
        createAlbum: async (body) => {
            events.push(['create', body]);
            return { id: 'album-1', slug: body.slug, status: 'draft', images: [] };
        },
        uploadPreparedImage: async ({ image }) => ({
            uploadId: `upload-${image.id}`,
            image: { id: `remote-${image.id}`, filename: image.filename },
        }),
        updateImage: async (id, body) => events.push(['alt', id, body]),
        getAdminAlbum: async () => ({
            id: 'album-1',
            status: 'draft',
            images: [
                { id: 'remote-image-1', filename: 'one.webp' },
                { id: 'remote-image-2', filename: 'two.webp' },
            ],
        }),
        setCover: async (_albumId, imageId) => events.push(['cover', imageId]),
        updateAlbum: async (_albumId, body) => events.push(['metadata', body]),
        publishAlbum: async () => events.push(['publish']),
    };
    const album = {
        title: 'Dạ Tiệc Đỏ',
        slug: 'da-tiec-do',
        shootDate: '2025-02-25',
        categoryIds: ['category-1'],
        tagSlugs: ['studio'],
        metaTitle: 'Dạ Tiệc Đỏ | NDT Studio',
        metaDescription: 'Bộ ảnh chân dung Dạ Tiệc Đỏ mang phong cách sang trọng tại NDT Studio.',
        coverFile: 'two.jpg',
        images: [
            {
                id: 'image-1',
                relativePath: 'one.jpg',
                filename: 'one.webp',
                altText: 'Ảnh một',
                fileSize: 100,
                processedSha256: '1'.repeat(64),
                data: Buffer.from('one'),
            },
            {
                id: 'image-2',
                relativePath: 'two.jpg',
                filename: 'two.webp',
                altText: 'Ảnh hai',
                fileSize: 100,
                processedSha256: '2'.repeat(64),
                data: Buffer.from('two'),
            },
        ],
    };

    await executeApprovedAlbum({ api, album, journalAlbum: { images: {} } });

    const createBody = events.find(([name]) => name === 'create')[1];
    const metadataBody = events.find(([name]) => name === 'metadata')[1];
    assert.equal('description' in createBody, false);
    assert.equal('description' in metadataBody, false);
    assert.ok(
        events.findIndex(([name]) => name === 'cover') <
            events.findIndex(([name]) => name === 'publish'),
    );
    assert.ok(
        events.findIndex(([name]) => name === 'metadata') <
            events.findIndex(([name]) => name === 'publish'),
    );
});

test('checkpoints the remote album ID before attempting the first image upload', async () => {
    const journalAlbum = { images: {} };
    const checkpoints = [];
    const api = {
        findAdminAlbumBySlug: async () => null,
        createAlbum: async () => ({ id: 'album-created' }),
        uploadPreparedImage: async () => {
            throw new Error('upload interrupted');
        },
    };
    const album = {
        title: 'Checkpoint Album',
        slug: 'checkpoint-album',
        shootDate: '2026-08-02',
        categoryIds: ['category-1'],
        tagSlugs: ['studio'],
        metaTitle: 'Checkpoint Album | NDT Studio',
        metaDescription: 'Checkpoint test.',
        coverFile: 'one.jpg',
        images: [
            {
                id: 'image-1',
                relativePath: 'one.jpg',
                filename: 'one.webp',
                altText: 'Ảnh kiểm thử.',
                fileSize: 100,
                processedSha256: '1'.repeat(64),
                data: Buffer.from('one'),
            },
        ],
    };

    await assert.rejects(
        executeApprovedAlbum({
            api,
            album,
            journalAlbum,
            onProgress: async (state) => checkpoints.push(structuredClone(state)),
        }),
        /upload interrupted/,
    );

    assert.equal(checkpoints[0].remoteAlbumId, 'album-created');
    assert.equal(journalAlbum.remoteAlbumId, 'album-created');
});

test('clears a stale journal error after publishing successfully', async () => {
    const journalAlbum = {
        remoteAlbumId: 'album-1',
        outcome: 'failed',
        lastError: 'Production API request failed with HTTP 401',
        images: {
            'image-1': { remoteImageId: 'remote-image-1', outcome: 'consumed' },
        },
    };
    const api = {
        getAdminAlbum: async () => ({
            id: 'album-1',
            status: 'draft',
            images: [{ id: 'remote-image-1', filename: 'one.webp' }],
        }),
        updateImage: async () => {},
        setCover: async () => {},
        updateAlbum: async () => {},
        publishAlbum: async () => {},
    };
    const album = {
        title: 'Recovered Album',
        slug: 'recovered-album',
        shootDate: '2026-08-02',
        categoryIds: ['category-1'],
        tagSlugs: ['studio'],
        metaTitle: 'Recovered Album | NDT Studio',
        metaDescription: 'Recovered album test.',
        coverFile: 'one.jpg',
        images: [
            {
                id: 'image-1',
                relativePath: 'one.jpg',
                filename: 'one.webp',
                altText: 'Ảnh kiểm thử.',
            },
        ],
    };

    await executeApprovedAlbum({ api, album, journalAlbum });

    assert.equal(journalAlbum.outcome, 'published');
    assert.equal('lastError' in journalAlbum, false);
});

test('creates an approved new tag and merges it into matching old albums', async () => {
    const events = [];
    const api = {
        getTags: async () => [{ name: 'Studio', slug: 'studio' }],
        createTag: async (tag) => {
            events.push(['create-tag', tag]);
            return { id: 'tag-new', ...tag };
        },
        findAdminAlbumBySlug: async (slug) => ({
            id: `id-${slug}`,
            slug,
            tags: [{ slug: 'studio' }],
        }),
        updateAlbum: async (id, body) => events.push(['update-album', id, body]),
    };

    const result = await applyApprovedTagBackfill({
        api,
        entries: [
            {
                tag: { name: 'Ánh Đèn Đỏ', slug: 'anh-den-do' },
                albumSlugs: ['da-tiec-do', 'scarlet-trace'],
            },
        ],
    });

    assert.deepEqual(events[0], ['create-tag', { name: 'Ánh Đèn Đỏ', slug: 'anh-den-do' }]);
    assert.deepEqual(events[1], [
        'update-album',
        'id-da-tiec-do',
        { tagSlugs: ['studio', 'anh-den-do'] },
    ]);
    assert.equal(result.updatedAlbums, 2);
});
