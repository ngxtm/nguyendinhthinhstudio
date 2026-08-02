import assert from 'node:assert/strict';
import test from 'node:test';

import { regroupUnassignedImages } from './regroup.mjs';

function image(id) {
    return {
        id,
        relativePath: `${id}.jpg`,
        normalizedFilename: `${id}.jpg`,
        capturedAt: null,
        altText: '',
        reviewReasons: ['missing_exif_date'],
    };
}

test('merges AI groups across overlapping windows without singleton placeholders', async () => {
    const manifest = {
        schemaVersion: 1,
        productionOrigin: 'https://api.ndtstudio.site',
        sourceRoot: 'C:\\photos',
        albums: [],
        unassignedImages: ['a', 'b', 'c', 'd', 'e'].map(image),
        skippedFiles: [],
        tagBackfill: [],
    };
    const calls = [];
    const result = await regroupUnassignedImages(manifest, {
        windowSize: 4,
        overlap: 2,
        clusterWindow: async (images) => {
            const ids = images.map((entry) => entry.id);
            calls.push(ids);
            if (ids.join(',') === 'a,b,c,d') {
                return {
                    groups: [
                        { label: 'first', imageIds: ['a', 'b'] },
                        { label: 'second', imageIds: ['c', 'd'] },
                    ],
                    uncertainImageIds: [],
                };
            }
            return {
                groups: [{ label: 'second', imageIds: ids }],
                uncertainImageIds: [],
            };
        },
    });

    assert.deepEqual(calls, [
        ['a', 'b', 'c', 'd'],
        ['c', 'd', 'e'],
    ]);
    assert.equal(result.unassignedImages.length, 0);
    assert.deepEqual(
        result.albums.map((album) => album.images.map((entry) => entry.id)),
        [
            ['a', 'b'],
            ['c', 'd', 'e'],
        ],
    );
    assert.deepEqual(
        result.albums.map((album) => album.needsReview),
        [
            ['ai_enrichment_required', 'missing_exif_date'],
            ['ai_enrichment_required', 'missing_exif_date'],
        ],
    );
});
