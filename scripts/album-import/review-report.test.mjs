import assert from 'node:assert/strict';
import test from 'node:test';

import { findMissingExifAlbums, renderMissingExifReport } from './review-report.mjs';

const manifest = {
    albums: [
        {
            title: 'Normal Album',
            slug: 'normal-album',
            shootDate: '2025-02-25',
            needsReview: [],
            coverFile: 'normal.jpg',
            images: [{ relativePath: 'normal.jpg', capturedAt: '2025-02-25T10:00:00Z' }],
        },
        {
            title: 'Moon # [Night] `Study`',
            slug: 'moon-night-study',
            shootDate: null,
            needsReview: ['missing_exif_date'],
            coverFile: 'folder/cover`one`.jpg',
            images: [
                { relativePath: 'folder/cover`one`.jpg', capturedAt: null },
                { relativePath: 'folder/second.jpg', capturedAt: null },
            ],
        },
    ],
};

test('finds only albums requiring missing-date review', () => {
    const missing = findMissingExifAlbums(manifest);

    assert.equal(missing.length, 1);
    assert.equal(missing[0].slug, 'moon-night-study');
});

test('renders deterministic Markdown with cover, image paths, and an empty chosen date', () => {
    const markdown = renderMissingExifReport(manifest);

    assert.match(markdown, /# Missing-EXIF album review/);
    assert.match(markdown, /Albums: 1/);
    assert.match(markdown, /Images: 2/);
    assert.match(markdown, /Chosen shoot date: `YYYY-MM-DD`/);
    assert.match(markdown, /folder\/cover`one`\.jpg/);
    assert.match(markdown, /folder\/second\.jpg/);
    assert.ok(markdown.includes('Moon \\# \\[Night\\]'));
    assert.doesNotMatch(markdown, /normal-album/);
    assert.doesNotMatch(markdown, /[A-Z]:\\/);
});
