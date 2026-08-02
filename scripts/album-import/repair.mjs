import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { saveJournal, loadJournal } from './journal.mjs';
import { validateManifest } from './manifest.mjs';
import { ALT_REPAIR_BATCH_SIZE } from './repair-ai.mjs';
import { renderProposedTagsReport } from './proposed-tags-report.mjs';

const METADATA_REASONS = new Set([
    'invalid_cover_candidate',
    'meta_title_length',
    'meta_description_length',
]);

function digest(value) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function sourceDigest(manifest) {
    return digest({
        sourceRoot: manifest.sourceRoot,
        albums: (manifest.albums ?? []).map((album) => ({
            images: (album.images ?? []).map((image) => ({
                id: image.id,
                sourceSha256: image.sourceSha256 ?? null,
            })),
        })),
    });
}

function persistentManifest(manifest) {
    const value = structuredClone(manifest);
    for (const album of value.albums ?? []) {
        for (const image of album.images ?? []) delete image.thumbnailDataUrl;
    }
    return value;
}

function sanitize(error) {
    return String(error?.message || error)
        .replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi, '[image omitted]')
        .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
        .replace(/\b(?:sk|key)-[a-z0-9_-]{8,}\b/gi, '[credential redacted]')
        .slice(0, 1000);
}

function transient(error) {
    return (
        error?.status === 429 ||
        (error?.status >= 500 && error?.status <= 599) ||
        error?.name === 'TypeError'
    );
}

async function retry(operation, sleep) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (attempt === 3 || !transient(error)) break;
            await sleep(error?.retryAfterMs ?? 1000 * 2 ** (attempt - 1));
        }
    }
    throw lastError;
}

function commitQueue() {
    let tail = Promise.resolve();
    return (operation) => {
        const current = tail.then(operation, operation);
        tail = current.catch(() => {});
        return current;
    };
}

async function mapTwo(items, worker) {
    let next = 0;
    async function run() {
        while (true) {
            const index = next++;
            if (index >= items.length) return;
            await worker(items[index], index);
        }
    }
    await Promise.all(Array.from({ length: Math.min(2, items.length) }, run));
}

async function writeTextAtomic(path, text) {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, text, 'utf8');
    await rename(temporary, path);
}

function discoverWork(manifest) {
    const work = [];
    for (const album of manifest.albums ?? []) {
        const missing = (album.images ?? []).filter((image) => !image.altText?.trim());
        for (let index = 0; index < missing.length; index += ALT_REPAIR_BATCH_SIZE) {
            const images = missing.slice(index, index + ALT_REPAIR_BATCH_SIZE);
            work.push({
                type: 'alt',
                album,
                images,
                key: `alt:${digest({ album: album.images.map((image) => image.id), images: images.map((image) => image.id) })}`,
            });
        }
        if ((album.needsReview ?? []).some((reason) => METADATA_REASONS.has(reason))) {
            work.push({
                type: 'metadata',
                album,
                key: `metadata:${digest(album.images.map((image) => image.id))}`,
            });
        }
    }
    return work;
}

export async function repairManifest({
    manifest,
    manifestPath,
    checkpointPath = `${manifestPath}.repair-journal.json`,
    proposedTagsReportPath,
    catalog = { albums: [] },
    repairAltBatch,
    repairMetadata,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    stdout,
    stderr,
}) {
    if (!manifestPath || !proposedTagsReportPath) throw new Error('repair paths are required');
    if (typeof repairAltBatch !== 'function' || typeof repairMetadata !== 'function') {
        throw new TypeError('repair AI functions are required');
    }
    delete manifest.approval;
    const checkpoint = (await loadJournal(checkpointPath, null)) ?? {
        schemaVersion: 1,
        sourceDigest: sourceDigest(manifest),
        items: {},
    };
    if (checkpoint.schemaVersion !== 1 || checkpoint.sourceDigest !== sourceDigest(manifest)) {
        throw new Error(`repair checkpoint is stale: ${checkpointPath}`);
    }

    const discardedProposedTags = (manifest.tagBackfill ?? []).length;
    const hasProposedTagReasons = (manifest.albums ?? []).some((album) =>
        (album.needsReview ?? []).some((reason) => reason.startsWith('proposed_tag:')),
    );
    if (discardedProposedTags > 0 || hasProposedTagReasons) {
        await writeTextAtomic(
            proposedTagsReportPath,
            renderProposedTagsReport(manifest, catalog.albums ?? []),
        );
        for (const album of manifest.albums ?? []) {
            album.needsReview = (album.needsReview ?? []).filter(
                (reason) => !reason.startsWith('proposed_tag:'),
            );
        }
        manifest.tagBackfill = [];
    }
    await saveJournal(manifestPath, persistentManifest(manifest));

    const work = discoverWork(manifest);
    const altBatches = work.filter((item) => item.type === 'alt').length;
    const metadataAlbums = work.filter((item) => item.type === 'metadata').length;
    const commit = commitQueue();
    let failed = 0;
    let altProgress = 0;
    let metadataProgress = 0;

    await mapTwo(work, async (item) => {
        let result =
            checkpoint.items[item.key]?.outcome === 'complete'
                ? checkpoint.items[item.key].result
                : null;
        const resumed = Boolean(result);
        if (!result) {
            try {
                result = await retry(
                    () =>
                        item.type === 'alt'
                            ? repairAltBatch({ album: item.album, images: item.images })
                            : repairMetadata({ album: item.album }),
                    sleep,
                );
            } catch (error) {
                await commit(async () => {
                    checkpoint.items[item.key] = {
                        outcome: 'failed',
                        type: item.type,
                        lastError: sanitize(error),
                        failedAt: new Date().toISOString(),
                    };
                    await saveJournal(checkpointPath, checkpoint);
                    failed += 1;
                    stderr?.(`${item.type} repair failed: ${checkpoint.items[item.key].lastError}`);
                });
                return;
            }
        }
        await commit(async () => {
            checkpoint.items[item.key] = {
                outcome: 'complete',
                type: item.type,
                result,
                completedAt: new Date().toISOString(),
            };
            await saveJournal(checkpointPath, checkpoint);
            if (item.type === 'alt') {
                for (const image of item.images) {
                    image.altText = result.imageAltTexts[image.id];
                    item.album.needsReview = (item.album.needsReview ?? []).filter(
                        (reason) => reason !== `missing_alt_text:${image.id}`,
                    );
                }
                altProgress += 1;
                stdout?.(`alt batch ${altProgress}/${altBatches}${resumed ? ' resumed' : ''}`);
            } else {
                item.album.metaTitle = result.metaTitle;
                item.album.metaDescription = result.metaDescription;
                item.album.coverFile =
                    item.album.images.find((image) => image.id === result.coverFileId)
                        ?.relativePath ?? item.album.coverFile;
                item.album.needsReview = (item.album.needsReview ?? []).filter(
                    (reason) => !METADATA_REASONS.has(reason),
                );
                metadataProgress += 1;
                stdout?.(
                    `metadata album ${metadataProgress}/${metadataAlbums}${resumed ? ' resumed' : ''}`,
                );
            }
            await saveJournal(manifestPath, persistentManifest(manifest));
        });
    });

    for (const album of manifest.albums ?? []) {
        album.needsReview = (album.needsReview ?? []).filter((reason) => {
            if (!reason.startsWith('missing_alt_text:')) return true;
            const id = reason.slice('missing_alt_text:'.length);
            return !album.images.find((image) => image.id === id)?.altText?.trim();
        });
    }
    const persistent = persistentManifest(manifest);
    await saveJournal(manifestPath, persistent);
    const validation = validateManifest(persistent);
    return {
        manifest: persistent,
        altBatches,
        metadataAlbums,
        discardedProposedTags,
        failed,
        remainingReviewAlbums: persistent.albums.filter(
            (album) => (album.needsReview ?? []).length > 0,
        ).length,
        valid: validation.valid,
        checkpointPath,
        proposedTagsReportPath,
    };
}
