import assert from 'node:assert/strict';
import test from 'node:test';

import {
    analyzeAlbumWithAi,
    buildGroupingMessages,
    buildVisionMessages,
    parseAiAlbumAnalysis,
    parseAiGrouping,
} from './ai.mjs';

const catalog = {
    categories: [
        { name: 'Nữ', slug: 'nu' },
        { name: 'Beauty', slug: 'beauty' },
    ],
    tags: [
        { name: 'Studio', slug: 'studio' },
        { name: 'Nữ', slug: 'nu' },
    ],
};

test('vision messages contain reduced data URLs and stable IDs but no source paths', () => {
    const messages = buildVisionMessages({
        album: {
            id: 'session-1',
            images: [
                {
                    id: 'image-1',
                    sourcePath: 'C:\\private\\original.jpg',
                    relativePath: 'original.jpg',
                    thumbnailDataUrl: 'data:image/webp;base64,AAAA',
                },
            ],
        },
        catalog,
    });
    const serialized = JSON.stringify(messages);

    assert.match(serialized, /image-1/);
    assert.match(serialized, /data:image\/webp;base64,AAAA/);
    assert.doesNotMatch(serialized, /C:\\\\private/);
});

test('vision messages include artistic naming context without serializing production objects', () => {
    const productionObject = { secret: 'must-not-leak' };
    const messages = buildVisionMessages({
        album: {
            id: 'session-1',
            productionObject,
            images: [
                {
                    id: 'image-1',
                    sourcePath: 'C:\\private\\original.jpg',
                    relativePath: 'original.jpg',
                    thumbnailDataUrl: 'data:image/webp;base64,AAAA',
                    productionObject,
                },
            ],
        },
        catalog: {
            ...catalog,
            productionObject,
            categories: catalog.categories.map((entry) => ({ ...entry, productionObject })),
            tags: catalog.tags.map((entry) => ({ ...entry, productionObject })),
        },
        namingContext: {
            reservedTitles: [
                ' Midnight Frequency ',
                'Xích Điệp',
                'Midnight Frequency',
                ...Array.from({ length: 260 }, (_, index) => `Reserved ${index}`),
            ],
            rejectedTitle: ' Beauty Portrait ',
            productionObject,
        },
    });
    const prompt = JSON.parse(messages[1].content[0].text);
    const serialized = JSON.stringify(messages);

    assert.equal(prompt.naming.promptVersion, 'artistic-collection-v2');
    assert.match(prompt.naming.policy, /English editorial/i);
    assert.match(prompt.naming.policy, /Hán[–-]Việt/i);
    assert.match(prompt.naming.policy, /Vietnamese Latin spelling/i);
    assert.match(prompt.naming.policy, /never Chinese characters/i);
    assert.match(prompt.naming.policy, /Nàng Thơ/);
    assert.match(prompt.naming.policy, /Bộ Ảnh/);
    assert.match(prompt.naming.policy, /Chàng Trai/);
    assert.match(prompt.naming.policy, /Portrait/);
    assert.match(prompt.naming.policy, /Beauty Portrait/);
    assert.deepEqual(prompt.naming.reservedTitles.slice(0, 2), ['Midnight Frequency', 'Xích Điệp']);
    assert.equal(prompt.naming.reservedTitles.length, 250);
    assert.equal(prompt.naming.rejectedTitle, 'Beauty Portrait');
    assert.doesNotMatch(serialized, /must-not-leak/);
    assert.doesNotMatch(serialized, /C:\\\\private/);
    assert.doesNotMatch(serialized, /original\.jpg/);
});

test('album analysis passes naming context into the serialized request', async () => {
    let requestBody;
    await analyzeAlbumWithAi({
        album: {
            id: 'album-1',
            images: [
                {
                    id: 'image-1',
                    relativePath: 'private-source.jpg',
                    thumbnailDataUrl: 'data:image/webp;base64,AAAA',
                },
            ],
        },
        catalog,
        namingContext: {
            reservedTitles: ['Midnight Frequency', 'Xích Điệp'],
            rejectedTitle: 'Beauty Portrait',
        },
        baseUrl: 'https://gateway.example/v1',
        apiKey: 'test-key',
        model: 'test-model',
        fetchImpl: async (_url, options) => {
            requestBody = JSON.parse(options.body);
            return Response.json({
                choices: [
                    {
                        message: {
                            content: JSON.stringify({
                                title: 'Xích Điệp',
                                categorySlugs: ['nu'],
                                tagSlugs: ['studio'],
                                proposedTags: [],
                                metaTitle: 'Xích Điệp - Bộ ảnh nghệ thuật NDT',
                                metaDescription:
                                    'Khám phá bộ ảnh Xích Điệp với ngôn ngữ thị giác tinh tế tại NDT Studio Nha Trang.',
                                coverCandidates: ['image-1'],
                                imageAltTexts: {
                                    'image-1': 'Chân dung nghệ thuật tại NDT Studio.',
                                },
                            }),
                        },
                    },
                ],
            });
        },
    });

    const prompt = JSON.parse(requestBody.messages[1].content[0].text);
    assert.deepEqual(prompt.naming.reservedTitles, ['Midnight Frequency', 'Xích Điệp']);
    assert.equal(prompt.naming.rejectedTitle, 'Beauty Portrait');
});

test('accepts known catalog values and complete per-image alt text', () => {
    const parsed = parseAiAlbumAnalysis(
        {
            title: 'Dạ Tiệc Đỏ',
            categorySlugs: ['nu', 'beauty'],
            tagSlugs: ['studio', 'nu'],
            proposedTags: [],
            metaTitle: 'Dạ Tiệc Đỏ | NDT Studio',
            metaDescription:
                'Bộ ảnh chân dung Dạ Tiệc Đỏ với phong cách sang trọng tại NDT Studio.',
            coverCandidates: ['image-2', 'image-1'],
            imageAltTexts: {
                'image-1': 'Chân dung người mẫu trong váy đỏ tại studio NDT.',
                'image-2': 'Người mẫu tạo dáng bên phông nền đỏ trong studio.',
            },
        },
        {
            catalog,
            imageIds: ['image-1', 'image-2'],
        },
    );

    assert.deepEqual(parsed.needsReview, []);
    assert.equal(parsed.coverFileId, 'image-2');
    assert.equal(
        parsed.imageAltTexts['image-1'],
        'Chân dung người mẫu trong váy đỏ tại studio NDT.',
    );
});

test('routes unknown categories, proposed tags, missing alt text, and invalid cover to review', () => {
    const parsed = parseAiAlbumAnalysis(
        {
            title: 'Red',
            categorySlugs: ['unknown-category'],
            tagSlugs: ['unknown-tag'],
            proposedTags: [{ name: 'Ánh Đèn Đỏ', slug: 'anh-den-do' }],
            metaTitle: 'x'.repeat(71),
            metaDescription: 'short',
            coverCandidates: ['missing-image'],
            imageAltTexts: {},
        },
        {
            catalog,
            imageIds: ['image-1'],
        },
    );

    assert.match(parsed.needsReview.join('\n'), /unknown_category:unknown-category/);
    assert.match(parsed.needsReview.join('\n'), /unknown_tag:unknown-tag/);
    assert.match(parsed.needsReview.join('\n'), /proposed_tag:anh-den-do/);
    assert.match(parsed.needsReview.join('\n'), /missing_alt_text:image-1/);
    assert.match(parsed.needsReview.join('\n'), /invalid_cover_candidate/);
    assert.match(parsed.needsReview.join('\n'), /meta_title_length/);
    assert.match(parsed.needsReview.join('\n'), /meta_description_length/);
});

test('grouping messages use only thumbnails and stable image IDs', () => {
    const messages = buildGroupingMessages({
        images: [
            {
                id: 'image-1',
                sourcePath: 'C:\\private\\original.jpg',
                thumbnailDataUrl: 'data:image/webp;base64,AAAA',
            },
        ],
    });
    const serialized = JSON.stringify(messages);

    assert.match(serialized, /image-1/);
    assert.match(serialized, /data:image\/webp;base64,AAAA/);
    assert.doesNotMatch(serialized, /C:\\\\private/);
});

test('grouping parser requires every image exactly once', () => {
    const parsed = parseAiGrouping(
        {
            groups: [
                { label: 'black-dress', imageIds: ['image-1', 'image-2'] },
                { label: 'flowers', imageIds: ['image-3'] },
            ],
            uncertainImageIds: [],
        },
        { imageIds: ['image-1', 'image-2', 'image-3'] },
    );
    assert.deepEqual(
        parsed.groups.map((group) => group.imageIds),
        [['image-1', 'image-2'], ['image-3']],
    );

    assert.throws(
        () =>
            parseAiGrouping(
                {
                    groups: [{ label: 'bad', imageIds: ['image-1', 'image-1'] }],
                    uncertainImageIds: [],
                },
                { imageIds: ['image-1', 'image-2'] },
            ),
        /exactly once/,
    );
});

test('AI HTTP errors retain safe provider details and retry metadata', async () => {
    await assert.rejects(
        analyzeAlbumWithAi({
            album: {
                id: 'album-1',
                images: [
                    {
                        id: 'image-1',
                        relativePath: 'one.jpg',
                        thumbnailDataUrl: 'data:image/webp;base64,AAAA',
                    },
                ],
            },
            catalog,
            baseUrl: 'https://gateway.example/v1',
            apiKey: 'secret-key-must-not-appear',
            model: 'gpt-test',
            fetchImpl: async () =>
                new Response(
                    JSON.stringify({
                        error: {
                            code: 'all_accounts_unavailable',
                            message: 'All accounts unavailable for requested model',
                        },
                    }),
                    { status: 503, headers: { 'retry-after': '7' } },
                ),
        }),
        (error) => {
            assert.equal(error.status, 503);
            assert.equal(error.retryAfterMs, 7000);
            assert.match(error.message, /all_accounts_unavailable/);
            assert.match(error.message, /All accounts unavailable/);
            assert.doesNotMatch(error.message, /secret-key-must-not-appear/);
            return true;
        },
    );
});
