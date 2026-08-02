import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import sharp from 'sharp';

import {
    assertPreparedOutput,
    computeTargetDimensions,
    normalizeOutputFilename,
    prepareThumbnail,
    prepareWebp,
} from './images.mjs';
import { MAX_OUTPUT_BYTES } from './constants.mjs';

test('normalizes decomposed Unicode before changing extension to WebP', () => {
    assert.equal(normalizeOutputFilename('Chụp Mẫu4328.JPG'), 'Chụp Mẫu4328.webp');
});

test('bounds the longest edge at 2560 without enlarging small images', () => {
    assert.deepEqual(computeTargetDimensions(6000, 4000), { width: 2560, height: 1707 });
    assert.deepEqual(computeTargetDimensions(1200, 800), { width: 1200, height: 800 });
});

test('rejects an optimized output larger than 5 MiB', () => {
    assert.throws(
        () =>
            assertPreparedOutput({
                bytes: MAX_OUTPUT_BYTES + 1,
                width: 2560,
                height: 1600,
                sha256: 'a'.repeat(64),
            }),
        /image_output_bytes_exceeded/,
    );
});

test('rotates and writes a deterministic bounded WebP plus a reduced AI thumbnail', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ndt-album-import-'));
    const sourcePath = join(directory, 'source.jpg');
    const webpPath = join(directory, 'prepared.webp');
    const thumbnailPath = join(directory, 'thumbnail.webp');
    try {
        await sharp({
            create: {
                width: 3000,
                height: 2000,
                channels: 3,
                background: { r: 160, g: 70, b: 80 },
            },
        })
            .jpeg()
            .withMetadata({ orientation: 6 })
            .toFile(sourcePath);

        const prepared = await prepareWebp({ sourcePath, outputPath: webpPath });
        const thumbnail = await prepareThumbnail({ sourcePath, outputPath: thumbnailPath });
        const preparedMetadata = await sharp(await readFile(webpPath)).metadata();
        const thumbnailMetadata = await sharp(await readFile(thumbnailPath)).metadata();

        assert.equal(prepared.filename, 'source.webp');
        assert.equal(prepared.contentType, 'image/webp');
        assert.equal(prepared.width, 1707);
        assert.equal(prepared.height, 2560);
        assert.match(prepared.processedSha256, /^[0-9a-f]{64}$/);
        assert.ok(prepared.bytes <= MAX_OUTPUT_BYTES);
        assert.ok(Math.max(preparedMetadata.width, preparedMetadata.height) <= 2560);
        assert.ok(Math.max(thumbnailMetadata.width, thumbnailMetadata.height) <= 768);
        assert.equal(thumbnail.contentType, 'image/webp');
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
