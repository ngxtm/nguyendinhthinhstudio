import assert from 'node:assert/strict';
import test from 'node:test';

import {
    approveManifest,
    computeApprovalDigest,
    slugify,
    splitAlbumParts,
    validateManifest,
} from './manifest.mjs';

function image(index, overrides = {}) {
    return {
        id: `image-${index}`,
        sourcePath: `C:\\photos\\Ảnh ${index}.JPG`,
        relativePath: `Ảnh ${index}.JPG`,
        normalizedFilename: `Ảnh ${index}.JPG`.normalize('NFC'),
        sourceBytes: 1000 + index,
        sourceSha256: String(index).padStart(64, '0'),
        capturedAt: '2025-02-25T10:00:00.000Z',
        altText: `Ảnh concept ${index}`,
        ...overrides,
    };
}

test('slugifies Vietnamese titles deterministically', () => {
    assert.equal(slugify('Dạ Tiệc Đỏ #2'), 'da-tiec-do-2');
});

test('splits a 101-image concept into numbered parts of at most 50 images', () => {
    const parts = splitAlbumParts({
        title: 'Dạ Tiệc Đỏ',
        images: Array.from({ length: 101 }, (_, index) => image(index + 1)),
    });

    assert.deepEqual(
        parts.map((part) => ({ title: part.title, slug: part.slug, count: part.images.length })),
        [
            { title: 'Dạ Tiệc Đỏ #1', slug: 'da-tiec-do-1', count: 50 },
            { title: 'Dạ Tiệc Đỏ #2', slug: 'da-tiec-do-2', count: 50 },
            { title: 'Dạ Tiệc Đỏ #3', slug: 'da-tiec-do-3', count: 1 },
        ],
    );
});

test('does not number a concept with 50 images or fewer', () => {
    const [part] = splitAlbumParts({
        title: 'Dạ Tiệc Đỏ',
        images: Array.from({ length: 50 }, (_, index) => image(index + 1)),
    });

    assert.equal(part.title, 'Dạ Tiệc Đỏ');
    assert.equal(part.slug, 'da-tiec-do');
});

test('rejects duplicate slugs instead of silently suffixing them', () => {
    const result = validateManifest({
        schemaVersion: 1,
        productionOrigin: 'https://api.ndtstudio.site',
        sourceRoot: 'C:\\photos',
        albums: [
            { title: 'A', slug: 'same', images: [image(1)], coverFile: 'Ảnh 1.JPG' },
            { title: 'B', slug: 'same', images: [image(2)], coverFile: 'Ảnh 2.JPG' },
        ],
        skippedFiles: [],
        tagBackfill: [],
    });

    assert.match(result.errors.join('\n'), /duplicate slug: same/);
});

test('requires review and prevents publish when an image lacks EXIF', () => {
    const result = validateManifest({
        schemaVersion: 1,
        productionOrigin: 'https://api.ndtstudio.site',
        sourceRoot: 'C:\\photos',
        albums: [
            {
                title: 'Needs Date',
                slug: 'needs-date',
                shootDate: null,
                images: [image(1, { capturedAt: null })],
                coverFile: 'Ảnh 1.JPG',
                needsReview: ['missing_exif_date'],
            },
        ],
        skippedFiles: [{ relativePath: 'NDT_1463.psd', reason: 'unsupported_psd' }],
        tagBackfill: [],
    });

    assert.match(result.errors.join('\n'), /needs review/);
});

test('approval digest changes when cover or tag backfill changes', () => {
    const manifest = {
        schemaVersion: 1,
        productionOrigin: 'https://api.ndtstudio.site',
        sourceRoot: 'C:\\photos',
        albums: [
            {
                title: 'Dạ Tiệc Đỏ',
                slug: 'da-tiec-do',
                shootDate: '2025-02-25',
                categorySlugs: ['nu'],
                tagSlugs: ['studio'],
                metaTitle: 'Dạ Tiệc Đỏ | NDT Studio',
                metaDescription: 'Bộ ảnh Dạ Tiệc Đỏ được thực hiện tại NDT Studio.',
                coverFile: 'Ảnh 1.JPG',
                images: [image(1), image(2)],
                needsReview: [],
            },
        ],
        skippedFiles: [{ relativePath: 'NDT_1463.psd', reason: 'unsupported_psd' }],
        tagBackfill: [],
    };

    const first = computeApprovalDigest(manifest);
    const changed = structuredClone(manifest);
    changed.albums[0].coverFile = 'Ảnh 2.JPG';
    assert.notEqual(computeApprovalDigest(changed), first);

    const approved = approveManifest(manifest);
    assert.equal(approved.approval.digest, first);
    assert.equal(approved.approval.productionOrigin, 'https://api.ndtstudio.site');
});

test('blocks approval while missing-EXIF images are still unassigned', () => {
    const result = validateManifest({
        schemaVersion: 1,
        productionOrigin: 'https://api.ndtstudio.site',
        sourceRoot: 'C:\\photos',
        albums: [],
        unassignedImages: [image(1, { capturedAt: null })],
        skippedFiles: [],
        tagBackfill: [],
    });

    assert.match(result.errors.join('\n'), /unassigned images require AI grouping/);
});
