import assert from 'node:assert/strict';
import test from 'node:test';

import { collectProposedTagReview, renderProposedTagsReport } from './proposed-tags-report.mjs';

const manifest = {
    albums: [
        { title: 'Xích Hoa', slug: 'xich-hoa', needsReview: ['proposed_tag:hoa-sen'] },
        { title: 'Bạch Liên', slug: 'bach-lien', needsReview: ['proposed_tag:hoa-sen'] },
        { title: 'Noir', slug: 'noir', needsReview: ['proposed_tag:khong-khop'] },
    ],
    tagBackfill: [
        { tag: { name: 'Hoa Sen', slug: 'hoa-sen' }, albumSlugs: [] },
        { tag: { name: 'Không Khớp', slug: 'khong-khop' }, albumSlugs: [] },
    ],
};

const published = [
    {
        title: 'Bạch Liên Tịnh Mộng',
        slug: 'bach-lien-tinh-mong',
        categories: [{ name: 'Hoa Sen', slug: 'hoa-sen' }],
        tags: [],
    },
];

test('aggregates proposed tags, requesting albums, and production matches', () => {
    const entries = collectProposedTagReview(manifest, published);

    assert.equal(entries.length, 2);
    assert.deepEqual(entries[0], {
        name: 'Hoa Sen',
        slug: 'hoa-sen',
        requestingAlbumSlugs: ['xich-hoa', 'bach-lien'],
        matchingPublishedAlbums: ['Bạch Liên Tịnh Mộng'],
    });
});

test('renders rejected tag proposals without sensitive manifest data', () => {
    const report = renderProposedTagsReport(manifest, published);

    assert.match(report, /Hoa Sen/);
    assert.match(report, /xich-hoa/);
    assert.match(report, /Bạch Liên Tịnh Mộng/);
    assert.match(report, /Không Khớp/);
    assert.match(report, /None found/);
    assert.doesNotMatch(report, /sourceRoot|thumbnailDataUrl|apiKey/i);
});
