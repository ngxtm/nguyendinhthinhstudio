import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
    formatPartMetaDescription,
    formatPartMetaTitle,
    formatPartTitle,
    parseCliArgs,
    runCli,
    validateAndApproveManifest,
} from '../import-ndt-albums.mjs';
import { scanSourceToManifest } from './scanner.mjs';

test('parses command and named flags without accepting positional production shortcuts', () => {
    assert.deepEqual(
        parseCliArgs([
            'scan',
            '--source',
            'C:\\photos',
            '--manifest',
            'manifest.json',
            '--gap-minutes',
            '120',
        ]),
        {
            command: 'scan',
            flags: {
                source: 'C:\\photos',
                manifest: 'manifest.json',
                'gap-minutes': '120',
            },
        },
    );
});

test('keeps #1 and #2 in split album titles and SEO without duplicating the studio suffix', () => {
    assert.equal(formatPartTitle('Flower Light', 1, 2), 'Flower Light #1');
    assert.equal(formatPartTitle('Flower Light', 2, 2), 'Flower Light #2');
    assert.equal(
        formatPartMetaTitle('Flower Light | NDT Studio', 1, 2),
        'Flower Light #1 | NDT Studio',
    );
    assert.equal(
        formatPartMetaDescription('Bộ ảnh Flower Light tại NDT Studio.', 2, 2),
        'Bộ ảnh Flower Light tại NDT Studio. Phần 2.',
    );
});

test('scan writes a draft manifest, skips PSD, and never calls production', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ndt-scan-'));
    const sourceRoot = join(directory, 'source');
    const manifestPath = join(directory, 'manifest.json');
    try {
        await mkdir(sourceRoot);
        await writeFile(join(sourceRoot, 'Ảnh 1.jpg'), Buffer.from('jpeg-fixture'));
        await writeFile(join(sourceRoot, 'NDT_1463.psd'), Buffer.from('psd-fixture'));
        const inspectImage = async () => ({
            capturedAt: '2025-02-25T10:00:00.000Z',
            width: 3000,
            height: 2000,
        });

        const summary = await scanSourceToManifest({
            sourceRoot,
            manifestPath,
            inspectImage,
            createThumbnail: async () => ({
                outputPath: join(directory, 'thumbnail.webp'),
                contentType: 'image/webp',
            }),
        });
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

        assert.equal(summary.jpegFiles, 1);
        assert.equal(summary.skippedFiles, 1);
        assert.equal(manifest.albums.length, 1);
        assert.deepEqual(manifest.albums[0].needsReview, ['ai_enrichment_required']);
        assert.deepEqual(manifest.skippedFiles, [
            { relativePath: 'NDT_1463.psd', reason: 'unsupported_psd' },
        ]);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('scan keeps one canonical JPEG and reports byte-identical copies', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ndt-scan-duplicates-'));
    const sourceRoot = join(directory, 'source');
    const manifestPath = join(directory, 'manifest.json');
    try {
        await mkdir(sourceRoot);
        const bytes = Buffer.from('same-jpeg-bytes');
        await writeFile(join(sourceRoot, 'first.jpg'), bytes);
        await writeFile(join(sourceRoot, 'copy.jpg'), bytes);

        const summary = await scanSourceToManifest({
            sourceRoot,
            manifestPath,
            inspectImage: async () => ({
                capturedAt: '2025-02-25T10:00:00.000Z',
                width: 3000,
                height: 2000,
            }),
            createThumbnail: async ({ outputPath }) => {
                await writeFile(outputPath, Buffer.from('thumbnail'));
                return { outputPath, contentType: 'image/webp' };
            },
        });
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
        const images = manifest.albums.flatMap((album) => album.images);

        assert.equal(summary.jpegFiles, 2);
        assert.equal(summary.uniqueJpegs, 1);
        assert.equal(images.length, 1);
        assert.deepEqual(
            manifest.skippedFiles.filter((entry) => entry.reason === 'duplicate_sha256'),
            [
                {
                    relativePath: 'first.jpg',
                    reason: 'duplicate_sha256',
                    duplicateOf: 'copy.jpg',
                },
            ],
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('scan keeps missing-EXIF images unassigned instead of creating singleton albums', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ndt-scan-unassigned-'));
    const sourceRoot = join(directory, 'source');
    const manifestPath = join(directory, 'manifest.json');
    try {
        await mkdir(sourceRoot);
        await writeFile(join(sourceRoot, 'social-1.jpg'), Buffer.from('social-image-1'));
        await writeFile(join(sourceRoot, 'social-2.jpg'), Buffer.from('social-image-2'));

        await scanSourceToManifest({
            sourceRoot,
            manifestPath,
            inspectImage: async () => ({ capturedAt: null, width: 1080, height: 1350 }),
            createThumbnail: async ({ outputPath }) => {
                await writeFile(outputPath, Buffer.from('thumbnail'));
                return { outputPath, contentType: 'image/webp' };
            },
        });
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

        assert.equal(manifest.albums.length, 0);
        assert.equal(manifest.unassignedImages.length, 2);
        assert.deepEqual(
            manifest.unassignedImages.map((image) => image.reviewReasons),
            [['missing_exif_date'], ['missing_exif_date']],
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('validation refuses review issues and does not create an approval', async () => {
    const manifest = {
        schemaVersion: 1,
        productionOrigin: 'https://api.ndtstudio.site',
        sourceRoot: 'C:\\photos',
        albums: [
            {
                title: 'Session 1',
                slug: 'session-1',
                shootDate: '2025-02-25',
                coverFile: 'one.jpg',
                images: [
                    {
                        id: 'one',
                        relativePath: 'one.jpg',
                        normalizedFilename: 'one.jpg',
                        capturedAt: '2025-02-25T10:00:00.000Z',
                        altText: '',
                    },
                ],
                needsReview: ['ai_enrichment_required'],
            },
        ],
        skippedFiles: [],
        tagBackfill: [],
    };

    const result = validateAndApproveManifest(manifest);

    assert.equal(result.validation.valid, false);
    assert.equal(result.manifest.approval, undefined);
});

test('execute refuses before network access without explicit flag, approval, and token', async () => {
    const messages = [];
    const result = await runCli(['execute', '--manifest', 'missing.json'], {
        env: {},
        stdout: (message) => messages.push(message),
        stderr: (message) => messages.push(message),
        fetchImpl: async () => assert.fail('network must not be called'),
    });

    assert.equal(result.exitCode, 2);
    assert.match(messages.join('\n'), /--execute-production is required/);
});

function approvedExecutionManifest(sourceRoot, albums) {
    return validateAndApproveManifest(
        {
            schemaVersion: 1,
            productionOrigin: 'https://api.ndtstudio.site',
            sourceRoot,
            albums,
            unassignedImages: [],
            skippedFiles: [],
            tagBackfill: [],
        },
        { approve: true },
    ).manifest;
}

function executionAlbum({ slug, sourcePath }) {
    return {
        title: slug,
        slug,
        shootDate: '2026-08-02',
        categorySlugs: ['beauty'],
        tagSlugs: ['studio'],
        metaTitle: `${slug} | NDT Studio`,
        metaDescription: `Bộ ảnh ${slug} tại NDT Studio.`,
        coverFile: 'one.jpg',
        images: [
            {
                id: `image-${slug}`,
                sourcePath,
                sourceSha256: 'a'.repeat(64),
                relativePath: 'one.jpg',
                normalizedFilename: 'one.jpg',
                capturedAt: '2026-08-02T00:00:00.000Z',
                altText: 'Ảnh chân dung nghệ thuật tại NDT Studio.',
            },
        ],
        needsReview: [],
    };
}

test('execute skips published albums before preparing their source images', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ndt-execute-skip-'));
    const sourceRoot = join(directory, 'source');
    const manifestPath = join(directory, 'manifest.json');
    const journalPath = `${sourceRoot}.album-import-journal.json`;
    const messages = [];
    try {
        const manifest = approvedExecutionManifest(sourceRoot, [
            executionAlbum({
                slug: 'already-published',
                sourcePath: join(directory, 'missing-source.jpg'),
            }),
        ]);
        await writeFile(manifestPath, JSON.stringify(manifest));
        await writeFile(
            journalPath,
            JSON.stringify({
                schemaVersion: 1,
                manifestDigest: manifest.approval.digest,
                albums: {
                    'already-published': {
                        outcome: 'published',
                        remoteAlbumId: 'album-1',
                        lastError: 'stale error',
                        images: {},
                    },
                },
                tagBackfill: null,
            }),
        );
        const result = await runCli(
            ['execute', '--manifest', manifestPath, '--execute-production'],
            {
                env: { NDT_ADMIN_ACCESS_TOKEN: 'test-token' },
                stdout: (message) => messages.push(message),
                stderr: (message) => messages.push(message),
                fetchImpl: async (url) => {
                    assert.match(String(url), /\/categories$/);
                    return new Response(JSON.stringify([{ id: 'category-1', slug: 'beauty' }]), {
                        status: 200,
                        headers: { 'content-type': 'application/json' },
                    });
                },
            },
        );

        assert.equal(result.exitCode, 0);
        assert.match(messages.join('\n'), /skipped already-published \(already published\)/);
        assert.doesNotMatch(messages.join('\n'), /published already-published/);
        const journal = JSON.parse(await readFile(journalPath, 'utf8'));
        assert.equal('lastError' in journal.albums['already-published'], false);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('execute stops before the next album after an authentication failure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ndt-execute-auth-'));
    const sourceRoot = join(directory, 'source');
    const manifestPath = join(directory, 'manifest.json');
    const sourcePath = join(directory, 'one.png');
    let createCalls = 0;
    try {
        await writeFile(
            sourcePath,
            Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
                'base64',
            ),
        );
        const manifest = approvedExecutionManifest(sourceRoot, [
            executionAlbum({ slug: 'first-album', sourcePath }),
            executionAlbum({ slug: 'second-album', sourcePath }),
        ]);
        await writeFile(manifestPath, JSON.stringify(manifest));
        const result = await runCli(
            ['execute', '--manifest', manifestPath, '--execute-production'],
            {
                env: { NDT_ADMIN_ACCESS_TOKEN: 'expired-token' },
                stdout: () => {},
                stderr: () => {},
                fetchImpl: async (url, init = {}) => {
                    const value = String(url);
                    if (value.endsWith('/categories')) {
                        return new Response(
                            JSON.stringify([{ id: 'category-1', slug: 'beauty' }]),
                            {
                                status: 200,
                                headers: { 'content-type': 'application/json' },
                            },
                        );
                    }
                    if (value.includes('/albums/admin/slug/')) {
                        return new Response(JSON.stringify({ error: 'not found' }), {
                            status: 404,
                            headers: { 'content-type': 'application/json' },
                        });
                    }
                    if (value.endsWith('/albums') && init.method === 'POST') {
                        createCalls += 1;
                        return new Response(JSON.stringify({ error: 'unauthorized' }), {
                            status: 401,
                            headers: { 'content-type': 'application/json' },
                        });
                    }
                    assert.fail(`unexpected production request: ${value}`);
                },
            },
        );

        assert.equal(result.exitCode, 1);
        assert.equal(createCalls, 1);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('enrich visually regroups unassigned images before replacing provisional titles', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ndt-enrich-regroup-'));
    const manifestPath = join(directory, 'manifest.json');
    const thumbnailOne = join(directory, 'one.webp');
    const thumbnailTwo = join(directory, 'two.webp');
    try {
        await writeFile(thumbnailOne, Buffer.from('thumbnail-one'));
        await writeFile(thumbnailTwo, Buffer.from('thumbnail-two'));
        await writeFile(
            manifestPath,
            JSON.stringify({
                schemaVersion: 1,
                productionOrigin: 'https://api.ndtstudio.site',
                sourceRoot: directory,
                albums: [],
                unassignedImages: [
                    {
                        id: 'image-1',
                        relativePath: 'one.jpg',
                        normalizedFilename: 'one.jpg',
                        thumbnailPath: thumbnailOne,
                        capturedAt: null,
                        altText: '',
                        reviewReasons: ['missing_exif_date'],
                    },
                    {
                        id: 'image-2',
                        relativePath: 'two.jpg',
                        normalizedFilename: 'two.jpg',
                        thumbnailPath: thumbnailTwo,
                        capturedAt: null,
                        altText: '',
                        reviewReasons: ['missing_exif_date'],
                    },
                ],
                skippedFiles: [],
                tagBackfill: [],
            }),
        );
        const fetchImpl = async (url) => {
            const value = String(url);
            const payload = value.endsWith('/categories')
                ? [{ slug: 'nu' }]
                : value.includes('/albums?')
                  ? { data: [] }
                  : [{ slug: 'studio' }];
            return new Response(JSON.stringify(payload), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        };
        const result = await runCli(['enrich', '--manifest', manifestPath], {
            fetchImpl,
            aiCluster: async ({ images }) => ({
                groups: [{ label: 'flowers', imageIds: images.map((image) => image.id) }],
                uncertainImageIds: [],
            }),
            aiAnalyze: async ({ album }) => ({
                title: 'Flower Light',
                categorySlugs: ['nu'],
                tagSlugs: ['studio'],
                proposedTags: [],
                metaTitle: 'Flower Light | NDT Studio',
                metaDescription:
                    'Bộ ảnh chân dung Flower Light với sắc hoa nhẹ nhàng tại NDT Studio.',
                coverFileId: 'image-1',
                imageAltTexts: Object.fromEntries(
                    album.images.map((image) => [image.id, `Alt ${image.id}`]),
                ),
                needsReview: [],
            }),
        });
        const enriched = JSON.parse(await readFile(manifestPath, 'utf8'));

        assert.equal(result.exitCode, 0);
        assert.equal(enriched.unassignedImages.length, 0);
        assert.equal(enriched.albums.length, 1);
        assert.equal(enriched.albums[0].title, 'Flower Light');
        assert.deepEqual(
            enriched.albums[0].images.map((image) => image.id),
            ['image-1', 'image-2'],
        );
        assert.deepEqual(enriched.albums[0].needsReview, ['missing_exif_date']);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('writes a missing-EXIF report without network access or manifest mutation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ndt-missing-exif-report-'));
    const manifestPath = join(directory, 'manifest.json');
    const outputPath = join(directory, 'review', 'missing-exif.md');
    const messages = [];
    try {
        await writeFile(
            manifestPath,
            JSON.stringify({
                schemaVersion: 1,
                productionOrigin: 'https://api.ndtstudio.site',
                sourceRoot: directory,
                albums: [
                    {
                        title: 'Xích Hoa',
                        slug: 'xich-hoa',
                        shootDate: null,
                        needsReview: ['missing_exif_date'],
                        coverFile: 'one.jpg',
                        images: [
                            { relativePath: 'one.jpg', capturedAt: null },
                            { relativePath: 'two.jpg', capturedAt: null },
                        ],
                    },
                ],
            }),
        );
        const before = await readFile(manifestPath, 'utf8');
        const result = await runCli(
            ['report-missing-exif', '--manifest', manifestPath, '--output', outputPath],
            {
                stdout: (message) => messages.push(message),
                fetchImpl: async () => assert.fail('report must not call network'),
            },
        );

        assert.equal(result.exitCode, 0);
        assert.equal(await readFile(manifestPath, 'utf8'), before);
        assert.match(await readFile(outputPath, 'utf8'), /Xích Hoa/);
        assert.match(messages.join('\n'), /"albums":1/);
        assert.match(messages.join('\n'), /"images":2/);
        assert.match(messages.join('\n'), /missing-exif\.md/);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('repair clears reported tag proposals without any production write request', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ndt-repair-cli-'));
    const manifestPath = join(directory, 'manifest.json');
    const messages = [];
    try {
        await writeFile(
            manifestPath,
            JSON.stringify({
                schemaVersion: 1,
                productionOrigin: 'https://api.ndtstudio.site',
                sourceRoot: directory,
                albums: [
                    {
                        title: 'Xích Hoa',
                        slug: 'xich-hoa',
                        shootDate: '2026-08-01',
                        categorySlugs: ['beauty'],
                        tagSlugs: ['studio'],
                        metaTitle: 'Xích Hoa | NDT Studio',
                        metaDescription:
                            'Khám phá bộ ảnh Xích Hoa với ánh sáng nghệ thuật và phong cách thanh lịch tại NDT Studio.',
                        coverFile: 'one.jpg',
                        images: [
                            {
                                id: 'image-1',
                                relativePath: 'one.jpg',
                                thumbnailPath: join(directory, 'one.webp'),
                                capturedAt: '2026-08-01T00:00:00.000Z',
                                altText: 'Chân dung nghệ thuật tại NDT Studio.',
                            },
                        ],
                        needsReview: ['proposed_tag:hoa-sen'],
                    },
                ],
                unassignedImages: [],
                skippedFiles: [],
                tagBackfill: [{ tag: { name: 'Hoa Sen', slug: 'hoa-sen' }, albumSlugs: [] }],
            }),
        );
        await writeFile(join(directory, 'one.webp'), Buffer.from('thumbnail'));
        const fetchImpl = async (url, init = {}) => {
            assert.equal(init.method ?? 'GET', 'GET');
            const value = String(url);
            assert.match(value, /^https:\/\/api\.ndtstudio\.site\/(?:categories|tags|albums\?)/);
            const payload = value.endsWith('/categories')
                ? [{ name: 'Beauty', slug: 'beauty' }]
                : value.endsWith('/tags')
                  ? [{ name: 'Studio', slug: 'studio' }]
                  : { data: [] };
            return new Response(JSON.stringify(payload), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        };
        const result = await runCli(['repair', '--manifest', manifestPath], {
            fetchImpl,
            stdout: (message) => messages.push(message),
            repairAltBatch: async () => assert.fail('no alt repair expected'),
            repairMetadata: async () => assert.fail('no metadata repair expected'),
        });

        assert.equal(result.exitCode, 0);
        assert.equal(result.valid, true);
        assert.match(messages.join('\n'), /"discardedProposedTags":1/);
        const repaired = JSON.parse(await readFile(manifestPath, 'utf8'));
        assert.deepEqual(repaired.albums[0].tagSlugs, ['studio']);
        assert.deepEqual(repaired.tagBackfill, []);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
