import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { repairManifest } from './repair.mjs';

function fixture(directory) {
    const images = Array.from({ length: 9 }, (_, index) => ({
        id: `image-${index + 1}`,
        relativePath: `image-${index + 1}.jpg`,
        sourceSha256: String(index + 1).padStart(64, '0'),
        thumbnailDataUrl: `data:image/webp;base64,${index + 1}`,
        capturedAt: '2026-08-01T00:00:00.000Z',
        altText: '',
        reviewReasons: [],
    }));
    return {
        schemaVersion: 1,
        productionOrigin: 'https://api.ndtstudio.site',
        sourceRoot: directory,
        approval: { digest: 'stale' },
        albums: [
            {
                title: 'Xích Hoa',
                slug: 'xich-hoa',
                shootDate: '2026-08-01',
                categorySlugs: ['beauty'],
                tagSlugs: ['studio'],
                metaTitle: 'Bad',
                metaDescription: 'Bad',
                coverFile: 'image-1.jpg',
                images,
                needsReview: [
                    ...images.map((image) => `missing_alt_text:${image.id}`),
                    'invalid_cover_candidate',
                    'meta_title_length',
                    'meta_description_length',
                    'proposed_tag:hoa-sen',
                ],
            },
        ],
        unassignedImages: [],
        skippedFiles: [],
        tagBackfill: [{ tag: { name: 'Hoa Sen', slug: 'hoa-sen' }, albumSlugs: [] }],
    };
}

test('repairs bounded alt batches and metadata while preserving approved source fields', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ndt-repair-'));
    const manifestPath = join(directory, 'manifest.json');
    const checkpointPath = `${manifestPath}.repair-journal.json`;
    const reportPath = join(directory, 'proposed-tags-review.md');
    const manifest = fixture(directory);
    const before = structuredClone(manifest.albums[0]);
    const batchSizes = [];
    try {
        const result = await repairManifest({
            manifest,
            manifestPath,
            checkpointPath,
            proposedTagsReportPath: reportPath,
            catalog: {
                albums: [
                    {
                        title: 'Bạch Liên',
                        slug: 'bach-lien',
                        categories: [{ name: 'Hoa Sen', slug: 'hoa-sen' }],
                    },
                ],
            },
            repairAltBatch: async ({ images }) => {
                batchSizes.push(images.length);
                return {
                    imageAltTexts: Object.fromEntries(
                        images.map((image) => [image.id, `Alt tiếng Việt cho ${image.id}`]),
                    ),
                };
            },
            repairMetadata: async () => ({
                metaTitle: 'Xích Hoa | NDT Studio',
                metaDescription:
                    'Khám phá bộ ảnh Xích Hoa với ánh sáng nghệ thuật và phong cách thanh lịch tại NDT Studio.',
                coverFileId: 'image-2',
            }),
            sleep: async () => {},
        });
        const repaired = result.manifest.albums[0];

        assert.deepEqual(batchSizes, [8, 1]);
        assert.equal(result.failed, 0);
        assert.equal(result.valid, true);
        assert.equal(result.discardedProposedTags, 1);
        assert.equal(repaired.title, before.title);
        assert.equal(repaired.slug, before.slug);
        assert.equal(repaired.shootDate, before.shootDate);
        assert.deepEqual(
            repaired.images.map((image) => image.capturedAt),
            before.images.map((image) => image.capturedAt),
        );
        assert.deepEqual(repaired.categorySlugs, before.categorySlugs);
        assert.deepEqual(repaired.tagSlugs, before.tagSlugs);
        assert.equal(repaired.coverFile, 'image-2.jpg');
        assert.equal(repaired.needsReview.length, 0);
        assert.equal(result.manifest.tagBackfill.length, 0);
        assert.equal(result.manifest.approval, undefined);
        assert.match(await readFile(reportPath, 'utf8'), /Hoa Sen/);
        assert.ok(repaired.images.every((image) => image.altText));

        const preservedReport = await readFile(reportPath, 'utf8');
        await repairManifest({
            manifest: structuredClone(result.manifest),
            manifestPath,
            checkpointPath,
            proposedTagsReportPath: reportPath,
            catalog: { albums: [] },
            repairAltBatch: async () => assert.fail('completed alt repair must resume'),
            repairMetadata: async () => assert.fail('completed metadata repair must resume'),
            sleep: async () => {},
        });
        assert.equal(await readFile(reportPath, 'utf8'), preservedReport);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
