import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ALT_REPAIR_BATCH_SIZE,
    buildAltRepairMessages,
    buildMetadataRepairMessages,
    parseAltRepairResult,
    parseMetadataRepairResult,
} from './repair-ai.mjs';

function image(id) {
    return {
        id,
        sourcePath: `C:\\private\\${id}.jpg`,
        thumbnailDataUrl: `data:image/webp;base64,${id}`,
    };
}

const album = {
    title: 'Scarlet Reverie',
    categorySlugs: ['beauty'],
    tagSlugs: ['studio'],
    metaTitle: 'Bad',
    metaDescription: 'Too short',
    images: ['image-1', 'image-2'].map(image),
};

test('alt repair payload is bounded to eight reduced thumbnails', () => {
    assert.equal(ALT_REPAIR_BATCH_SIZE, 8);
    const messages = buildAltRepairMessages({ album, images: album.images });
    const serialized = JSON.stringify(messages);

    assert.match(serialized, /Scarlet Reverie/);
    assert.match(serialized, /image-1/);
    assert.match(serialized, /data:image\/webp;base64,image-1/);
    assert.doesNotMatch(serialized, /C:\\\\private/);
    assert.throws(
        () =>
            buildAltRepairMessages({
                album,
                images: Array.from({ length: 9 }, (_, i) => image(`i-${i}`)),
            }),
        /at most 8/,
    );
});

test('alt repair parser requires one valid value for every requested image', () => {
    assert.deepEqual(
        parseAltRepairResult(
            {
                imageAltTexts: {
                    'image-1': 'Chân dung người mẫu dưới ánh sáng studio dịu nhẹ.',
                    'image-2': 'Người mẫu tạo dáng trong không gian tối giản.',
                },
            },
            { imageIds: ['image-1', 'image-2'] },
        ),
        {
            imageAltTexts: {
                'image-1': 'Chân dung người mẫu dưới ánh sáng studio dịu nhẹ.',
                'image-2': 'Người mẫu tạo dáng trong không gian tối giản.',
            },
        },
    );
    assert.throws(
        () =>
            parseAltRepairResult(
                { imageAltTexts: { 'image-1': 'Only one' } },
                { imageIds: ['image-1', 'image-2'] },
            ),
        /every image ID/,
    );
    assert.throws(
        () =>
            parseAltRepairResult(
                { imageAltTexts: { 'image-1': 'x'.repeat(181) } },
                { imageIds: ['image-1'] },
            ),
        /180/,
    );
});

test('metadata repair payload and parser only accept valid SEO and cover candidates', () => {
    const serialized = JSON.stringify(buildMetadataRepairMessages({ album }));
    assert.match(serialized, /metaTitle/);
    assert.match(serialized, /coverCandidates/);
    assert.doesNotMatch(serialized, /C:\\\\private/);

    const result = parseMetadataRepairResult(
        {
            metaTitle: 'Scarlet Reverie | NDT Studio',
            metaDescription:
                'Khám phá bộ ảnh Scarlet Reverie với sắc đỏ sang trọng và ánh sáng nghệ thuật tại NDT Studio.',
            coverCandidates: ['image-2', 'missing'],
        },
        { imageIds: ['image-1', 'image-2'] },
    );
    assert.equal(result.coverFileId, 'image-2');
    assert.throws(
        () =>
            parseMetadataRepairResult(
                { metaTitle: 'short', metaDescription: 'short', coverCandidates: ['missing'] },
                { imageIds: ['image-1'] },
            ),
        /metaTitle/,
    );
});
