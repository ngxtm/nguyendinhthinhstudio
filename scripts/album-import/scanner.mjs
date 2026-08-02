import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import sharp from 'sharp';

import {
    MANIFEST_SCHEMA_VERSION,
    PRODUCTION_ORIGIN,
    DEFAULT_SESSION_GAP_MINUTES,
} from './constants.mjs';
import { parseDateTimeOriginal, groupCaptureSessions } from './exif.mjs';
import { prepareThumbnail, thumbnailDataUrl } from './images.mjs';
import { splitAlbumParts } from './manifest.mjs';

async function hashFile(path) {
    return new Promise((resolveHash, reject) => {
        const hash = createHash('sha256');
        const stream = createReadStream(path);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolveHash(hash.digest('hex')));
    });
}

async function listFiles(root) {
    const entries = await readdir(root, { withFileTypes: true });
    const result = [];
    for (const entry of entries) {
        const path = join(root, entry.name);
        if (entry.isDirectory()) result.push(...(await listFiles(path)));
        else result.push(path);
    }
    return result.toSorted((left, right) =>
        relative(root, left).localeCompare(relative(root, right), 'vi'),
    );
}

async function defaultInspectImage(sourcePath) {
    const metadata = await sharp(sourcePath, { failOn: 'error' }).metadata();
    const captured = parseDateTimeOriginal(metadata.exif);
    return {
        capturedAt: captured?.toISOString() ?? null,
        width: metadata.width ?? null,
        height: metadata.height ?? null,
    };
}

export async function scanSourceToManifest({
    sourceRoot,
    manifestPath,
    inspectImage = defaultInspectImage,
    createThumbnail = ({ sourcePath, outputPath }) => prepareThumbnail({ sourcePath, outputPath }),
    gapMinutes = DEFAULT_SESSION_GAP_MINUTES,
}) {
    const root = resolve(sourceRoot);
    const files = await listFiles(root);
    await mkdir(dirname(resolve(manifestPath)), { recursive: true });
    const thumbnailRoot = `${manifestPath}.thumbnails`;
    await mkdir(thumbnailRoot, { recursive: true });
    const records = [];
    const skippedFiles = [];
    const seenHashes = new Map();
    let jpegFiles = 0;
    let duplicateJpegs = 0;

    for (const filePath of files) {
        const relativePath = relative(root, filePath).replaceAll('\\', '/').normalize('NFC');
        const extension = extname(filePath).toLowerCase();
        if (extension === '.psd') {
            skippedFiles.push({ relativePath, reason: 'unsupported_psd' });
            continue;
        }
        if (!['.jpg', '.jpeg'].includes(extension)) {
            skippedFiles.push({ relativePath, reason: 'unsupported_extension' });
            continue;
        }
        jpegFiles += 1;
        const details = await stat(filePath);
        const hash = await hashFile(filePath);
        const duplicateOf = seenHashes.get(hash);
        if (duplicateOf) {
            duplicateJpegs += 1;
            skippedFiles.push({
                relativePath,
                reason: 'duplicate_sha256',
                duplicateOf,
            });
            continue;
        }
        seenHashes.set(hash, relativePath);
        const inspected = await inspectImage(filePath);
        const id = `image-${hash.slice(0, 24)}`;
        const thumbnailPath = join(thumbnailRoot, `${id}.webp`);
        let cachedThumbnail = false;
        try {
            cachedThumbnail = (await stat(thumbnailPath)).size > 0;
        } catch (error) {
            if (error?.code !== 'ENOENT') throw error;
        }
        if (!cachedThumbnail) {
            await createThumbnail({ sourcePath: filePath, outputPath: thumbnailPath });
        }
        records.push({
            id,
            sourcePath: filePath,
            relativePath,
            normalizedFilename: basename(filePath).normalize('NFC'),
            sourceBytes: details.size,
            sourceSha256: hash,
            capturedAt: inspected.capturedAt,
            width: inspected.width,
            height: inspected.height,
            thumbnailPath,
            reviewReasons: inspected.capturedAt ? [] : ['missing_exif_date'],
        });
    }

    const knownRecords = records.filter((record) => record.capturedAt);
    const unassignedRecords = records.filter((record) => !record.capturedAt);
    const sessions = groupCaptureSessions(knownRecords, { maxGapMinutes: gapMinutes });
    sessions.sort((left, right) => {
        const leftTime = Date.parse(left[0]?.capturedAt ?? '9999-12-31');
        const rightTime = Date.parse(right[0]?.capturedAt ?? '9999-12-31');
        return leftTime - rightTime;
    });

    const albums = [];
    for (const session of sessions) {
        const first = session[0];
        const provisionalTitle = `Session ${first.capturedAt.slice(0, 10)} ${first.capturedAt.slice(11, 16).replace(':', '')}`;
        const parts = splitAlbumParts({ title: provisionalTitle, images: session });
        for (const part of parts) {
            const imageRecords = part.images.map((image) => ({
                ...image,
                altText: '',
                filename: `${image.normalizedFilename.replace(/\.[^.]+$/, '')}.webp`,
            }));
            albums.push({
                title: part.title,
                slug: part.slug,
                partNumber: part.partNumber,
                partCount: part.partCount,
                shootDate: first.capturedAt.slice(0, 10),
                categorySlugs: [],
                tagSlugs: [],
                metaTitle: '',
                metaDescription: '',
                coverFile: imageRecords[0].relativePath,
                images: imageRecords,
                needsReview: [
                    'ai_enrichment_required',
                    ...new Set(imageRecords.flatMap((image) => image.reviewReasons)),
                ],
            });
        }
    }

    const unassignedImages = unassignedRecords.map((image) => ({
        ...image,
        altText: '',
        filename: `${image.normalizedFilename.replace(/\.[^.]+$/, '')}.webp`,
    }));

    const manifest = {
        schemaVersion: MANIFEST_SCHEMA_VERSION,
        productionOrigin: PRODUCTION_ORIGIN,
        sourceRoot: root,
        generatedAt: new Date().toISOString(),
        albums,
        unassignedImages,
        skippedFiles,
        tagBackfill: [],
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return {
        jpegFiles,
        uniqueJpegs: records.length,
        duplicateJpegs,
        skippedFiles: skippedFiles.length,
        albums: albums.length,
        missingExif: unassignedImages.length,
        thumbnailRoot,
    };
}

export async function attachThumbnailDataUrls(manifest) {
    const result = structuredClone(manifest);
    for (const album of result.albums ?? []) {
        for (const image of album.images ?? []) {
            image.thumbnailDataUrl = await thumbnailDataUrl(image.thumbnailPath);
        }
    }
    for (const image of result.unassignedImages ?? []) {
        image.thumbnailDataUrl = await thumbnailDataUrl(image.thumbnailPath);
    }
    return result;
}
