import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname } from 'node:path';
import sharp from 'sharp';

import { MAX_OUTPUT_BYTES, MAX_OUTPUT_EDGE, THUMBNAIL_EDGE, WEBP_QUALITY } from './constants.mjs';

export function normalizeOutputFilename(filename) {
    const normalized = filename.normalize('NFC');
    const extension = extname(normalized);
    const stem = extension ? normalized.slice(0, -extension.length) : normalized;
    return `${stem || normalized}.webp`;
}

export function computeTargetDimensions(width, height, maxEdge = MAX_OUTPUT_EDGE) {
    if (![width, height, maxEdge].every((value) => Number.isFinite(value) && value > 0)) {
        throw new TypeError('image dimensions must be positive numbers');
    }
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
}

export function assertPreparedOutput(result) {
    if (!Number.isInteger(result.bytes) || result.bytes < 1) {
        throw new Error('image_encode_failed');
    }
    if (result.bytes > MAX_OUTPUT_BYTES) throw new Error('image_output_bytes_exceeded');
    if (
        !Number.isInteger(result.width) ||
        !Number.isInteger(result.height) ||
        result.width < 1 ||
        result.height < 1 ||
        Math.max(result.width, result.height) > MAX_OUTPUT_EDGE
    ) {
        throw new Error('image_output_dimensions_invalid');
    }
    if (!/^[0-9a-f]{64}$/.test(result.sha256)) throw new Error('image_output_sha256_invalid');
    return result;
}

export async function prepareWebp({ sourcePath, outputPath }) {
    const { data, info } = await sharp(sourcePath, { failOn: 'error' })
        .rotate()
        .resize({
            width: MAX_OUTPUT_EDGE,
            height: MAX_OUTPUT_EDGE,
            fit: 'inside',
            withoutEnlargement: true,
        })
        .webp({ quality: WEBP_QUALITY, effort: 6, smartSubsample: true })
        .toBuffer({ resolveWithObject: true });
    const result = assertPreparedOutput({
        bytes: data.length,
        width: info.width,
        height: info.height,
        sha256: createHash('sha256').update(data).digest('hex'),
    });
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, data);
    return {
        ...result,
        filename: normalizeOutputFilename(basename(sourcePath)),
        contentType: 'image/webp',
        outputPath,
        fileSize: result.bytes,
        processedSha256: result.sha256,
    };
}

export async function prepareThumbnail({ sourcePath, outputPath }) {
    const { data, info } = await sharp(sourcePath, { failOn: 'error' })
        .rotate()
        .resize({
            width: THUMBNAIL_EDGE,
            height: THUMBNAIL_EDGE,
            fit: 'inside',
            withoutEnlargement: true,
        })
        .webp({ quality: 75, effort: 4, smartSubsample: true })
        .toBuffer({ resolveWithObject: true });
    if (!data.length || Math.max(info.width, info.height) > THUMBNAIL_EDGE) {
        throw new Error('thumbnail_output_invalid');
    }
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, data);
    return {
        outputPath,
        contentType: 'image/webp',
        bytes: data.length,
        width: info.width,
        height: info.height,
        sha256: createHash('sha256').update(data).digest('hex'),
    };
}

export async function thumbnailDataUrl(path) {
    return `data:image/webp;base64,${(await readFile(path)).toString('base64')}`;
}
