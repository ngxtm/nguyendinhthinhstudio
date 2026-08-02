import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { analyzeAlbumWithAi, analyzeGroupingWindowWithAi } from './album-import/ai.mjs';
import {
    ApiRequestError,
    ProductionAlbumApi,
    ProductionApiClient,
    applyApprovedTagBackfill,
    executeApprovedAlbum,
} from './album-import/api.mjs';
import { prepareWebp } from './album-import/images.mjs';
import {
    approveManifest,
    computeApprovalDigest,
    slugify,
    validateManifest,
} from './album-import/manifest.mjs';
import { loadJournal, saveJournal } from './album-import/journal.mjs';
import { attachThumbnailDataUrls, scanSourceToManifest } from './album-import/scanner.mjs';
import { regroupUnassignedImages } from './album-import/regroup.mjs';
import { findMissingExifAlbums, renderMissingExifReport } from './album-import/review-report.mjs';
import { repairManifest } from './album-import/repair.mjs';
import { repairAltBatchWithAi, repairMetadataWithAi } from './album-import/repair-ai.mjs';
import { PRODUCTION_ORIGIN } from './album-import/constants.mjs';
import { ALBUM_NAMING_PROMPT_VERSION, AlbumTitleRegistry } from './album-import/naming.mjs';

export function parseCliArgs(argv) {
    const [command, ...rest] = argv;
    const flags = {};
    for (let index = 0; index < rest.length; index += 1) {
        const token = rest[index];
        if (!token.startsWith('--')) throw new Error(`unexpected positional argument: ${token}`);
        const key = token.slice(2);
        if (!key) throw new Error('empty flag');
        const next = rest[index + 1];
        if (next && !next.startsWith('--')) {
            flags[key] = next;
            index += 1;
        } else {
            flags[key] = true;
        }
    }
    if (
        !['scan', 'enrich', 'repair', 'validate', 'execute', 'report-missing-exif'].includes(
            command,
        )
    ) {
        throw new Error(
            'command must be scan, enrich, repair, validate, execute, or report-missing-exif',
        );
    }
    return { command, flags };
}

function output(writer, message) {
    writer?.(`${message}\n`);
}

async function readManifest(path) {
    return JSON.parse(await readFile(path, 'utf8'));
}

export function validateAndApproveManifest(manifest, { approve = false } = {}) {
    const validation = validateManifest(manifest);
    if (!validation.valid || !approve) return { manifest, validation };
    return {
        manifest: approveManifest(manifest),
        validation,
    };
}

async function fetchCatalog(fetchImpl) {
    const [categoriesResponse, tagsResponse, albumsResponse] = await Promise.all([
        fetchImpl(`${PRODUCTION_ORIGIN}/categories`, { redirect: 'error' }),
        fetchImpl(`${PRODUCTION_ORIGIN}/tags`, { redirect: 'error' }),
        fetchImpl(`${PRODUCTION_ORIGIN}/albums?limit=50&sortBy=newest`, {
            redirect: 'error',
        }),
    ]);
    if (!categoriesResponse.ok || !tagsResponse.ok || !albumsResponse.ok) {
        throw new Error('production catalog read failed');
    }
    const albumPayload = await albumsResponse.json();
    if (!Array.isArray(albumPayload?.data)) throw new Error('production album catalog is invalid');
    return {
        categories: await categoriesResponse.json(),
        tags: await tagsResponse.json(),
        albums: albumPayload.data
            .filter(
                (album) =>
                    album && typeof album.title === 'string' && typeof album.slug === 'string',
            )
            .slice(0, 50)
            .map(({ title, slug, categories, tags }) => ({
                title: title.trim(),
                slug: slug.trim(),
                categories: Array.isArray(categories)
                    ? categories.map(({ name, slug: categorySlug }) => ({
                          name,
                          slug: categorySlug,
                      }))
                    : [],
                tags: Array.isArray(tags)
                    ? tags.map((entry) => {
                          const tag = entry?.tag ?? entry;
                          return { name: tag?.name, slug: tag?.slug };
                      })
                    : [],
            })),
    };
}

export function formatPartTitle(value, partNumber, partCount) {
    const base = value.replace(/\s+#\d+\s*$/, '').trim();
    return partCount > 1 ? `${base} #${partNumber}` : base;
}

export function formatPartMetaTitle(value, partNumber, partCount) {
    const base = value.replace(/\s*\|\s*NDT Studio\s*$/i, '').trim();
    return `${formatPartTitle(base, partNumber, partCount)} | NDT Studio`;
}

export function formatPartMetaDescription(value, partNumber, partCount) {
    const base = value.replace(/\s+Phần\s+\d+\.?\s*$/i, '').trim();
    return partCount > 1 ? `${base} Phần ${partNumber}.` : base;
}

function trimMetaTitle(value) {
    return value.length <= 70 ? value : value.slice(0, 67).trimEnd() + '...';
}

function trimMetaDescription(value) {
    return value.length <= 170 ? value : value.slice(0, 167).trimEnd() + '...';
}

function enrichmentItemKey(prefix, images) {
    const ids = images.map((image) => image.id).sort();
    return `${prefix}:${createHash('sha256').update(ids.join('\0')).digest('hex')}`;
}

function enrichmentSourceDigest(manifest) {
    const images = [
        ...(manifest.albums ?? []).flatMap((album) => album.images ?? []),
        ...(manifest.unassignedImages ?? []),
    ]
        .map((image) => ({
            id: image.id,
            relativePath: image.relativePath,
            sourceSha256: image.sourceSha256 ?? null,
        }))
        .sort((left, right) => left.id.localeCompare(right.id));
    return createHash('sha256')
        .update(JSON.stringify({ sourceRoot: manifest.sourceRoot, images }))
        .digest('hex');
}

function withoutThumbnailDataUrls(manifest) {
    const persistent = structuredClone(manifest);
    for (const album of persistent.albums ?? []) {
        for (const image of album.images ?? []) delete image.thumbnailDataUrl;
    }
    for (const image of persistent.unassignedImages ?? []) delete image.thumbnailDataUrl;
    return persistent;
}

function sanitizeEnrichmentError(error) {
    return String(error?.message || error)
        .replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi, '[image omitted]')
        .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
        .replace(/\b(?:sk|key)-[a-z0-9_-]{8,}\b/gi, '[credential redacted]')
        .replace(/https?:\/\/[^\s]+/gi, '[url redacted]')
        .slice(0, 1000);
}

function isTransientAiError(error) {
    return (
        error?.status === 429 ||
        (error?.status >= 500 && error?.status <= 599) ||
        error?.name === 'TypeError'
    );
}

async function retryAi(
    operation,
    { attempts = 3, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {},
) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (attempt === attempts || !isTransientAiError(error)) break;
            const delay = error?.retryAfterMs ?? Math.min(30_000, 1000 * 2 ** (attempt - 1));
            await sleep(delay);
        }
    }
    lastError.attempts = attempts;
    throw lastError;
}

async function mapWithConcurrency(items, concurrency, worker) {
    let nextIndex = 0;
    async function runWorker() {
        while (true) {
            const index = nextIndex;
            nextIndex += 1;
            if (index >= items.length) return;
            await worker(items[index], index);
        }
    }
    await Promise.all(
        Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()),
    );
}

function createCommitQueue() {
    let tail = Promise.resolve();
    return (operation) => {
        const queued = tail.then(operation, operation);
        tail = queued.catch(() => {});
        return queued;
    };
}

function applyAlbumAnalysis(enriched, album, analysis) {
    const title = formatPartTitle(analysis.title, album.partNumber, album.partCount);
    album.title = title;
    album.slug = slugify(title);
    album.categorySlugs = analysis.categorySlugs;
    album.tagSlugs = analysis.tagSlugs;
    album.metaTitle = trimMetaTitle(
        formatPartMetaTitle(analysis.metaTitle, album.partNumber, album.partCount),
    );
    album.metaDescription = trimMetaDescription(
        formatPartMetaDescription(analysis.metaDescription, album.partNumber, album.partCount),
    );
    album.coverFile =
        album.images.find((image) => image.id === analysis.coverFileId)?.relativePath ??
        album.coverFile;
    for (const image of album.images) {
        image.altText = analysis.imageAltTexts[image.id] ?? '';
        delete image.thumbnailDataUrl;
    }
    album.needsReview = [
        ...new Set(
            album.needsReview
                .filter((reason) => reason !== 'ai_enrichment_required')
                .concat(analysis.needsReview),
        ),
    ];
    for (const proposedTag of analysis.proposedTags) {
        if (!enriched.tagBackfill.some((entry) => entry.tag.slug === proposedTag.slug)) {
            enriched.tagBackfill.push({ tag: proposedTag, albumSlugs: [] });
        }
    }
}

async function enrichManifest(
    manifest,
    {
        manifestPath,
        checkpointPath = `${manifestPath}.enrich-journal.json`,
        fetchImpl = fetch,
        aiAnalyze = analyzeAlbumWithAi,
        aiCluster = analyzeGroupingWindowWithAi,
        aiSleep,
        stdout,
        stderr,
    } = {},
) {
    if (!manifestPath) throw new Error('manifestPath is required for resumable enrichment');
    delete manifest.approval;
    await saveJournal(manifestPath, withoutThumbnailDataUrls(manifest));
    const sourceDigest = enrichmentSourceDigest(manifest);
    const checkpoint = (await loadJournal(checkpointPath, null)) ?? {
        schemaVersion: 1,
        sourceDigest,
        grouping: {},
        albums: {},
    };
    if (checkpoint.schemaVersion !== 1 || checkpoint.sourceDigest !== sourceDigest) {
        throw new Error(`enrichment checkpoint is stale: ${checkpointPath}`);
    }
    const catalog = await fetchCatalog(fetchImpl);
    let enriched = await attachThumbnailDataUrls(manifest);
    if (enriched.unassignedImages?.length) {
        const windowSize = 32;
        const overlap = 6;
        const step = windowSize - overlap;
        const totalWindows =
            1 + Math.ceil(Math.max(0, enriched.unassignedImages.length - windowSize) / step);
        let groupingIndex = 0;
        enriched = await regroupUnassignedImages(enriched, {
            windowSize,
            overlap,
            clusterWindow: async (images) => {
                groupingIndex += 1;
                const key = enrichmentItemKey('grouping', images);
                const saved = checkpoint.grouping[key];
                if (saved?.outcome === 'complete') {
                    output(stdout, `grouping ${groupingIndex}/${totalWindows} resumed`);
                    return saved.result;
                }
                try {
                    const result = await retryAi(() => aiCluster({ images, fetchImpl }), {
                        sleep: aiSleep,
                    });
                    checkpoint.grouping[key] = {
                        outcome: 'complete',
                        imageIds: images.map((image) => image.id),
                        result,
                        completedAt: new Date().toISOString(),
                    };
                    await saveJournal(checkpointPath, checkpoint);
                    output(stdout, `grouping ${groupingIndex}/${totalWindows}`);
                    return result;
                } catch (error) {
                    checkpoint.grouping[key] = {
                        outcome: 'failed',
                        imageIds: images.map((image) => image.id),
                        attempts: error.attempts ?? 1,
                        lastError: sanitizeEnrichmentError(error),
                        failedAt: new Date().toISOString(),
                    };
                    await saveJournal(checkpointPath, checkpoint);
                    output(
                        stderr,
                        `grouping ${groupingIndex}/${totalWindows} failed: ${checkpoint.grouping[key].lastError}`,
                    );
                    throw error;
                }
            },
        });
        await saveJournal(manifestPath, withoutThumbnailDataUrls(enriched));
    }
    let failed = 0;
    const commit = createCommitQueue();
    const titleRegistry = new AlbumTitleRegistry(catalog.albums);
    await mapWithConcurrency(enriched.albums, 2, async (album, index) => {
        const key = enrichmentItemKey('album', album.images);
        const savedAlbum = checkpoint.albums[key];
        let analysis =
            savedAlbum?.outcome === 'complete' &&
            savedAlbum.promptVersion === ALBUM_NAMING_PROMPT_VERSION
                ? savedAlbum.analysis
                : null;
        let resumed = Boolean(analysis);
        let namingContext = { reservedTitles: titleRegistry.titles(), rejectedTitle: null };
        for (let namingAttempt = 1; namingAttempt <= 3; namingAttempt += 1) {
            if (!analysis) {
                try {
                    analysis = await retryAi(
                        () => aiAnalyze({ album, catalog, namingContext, fetchImpl }),
                        { sleep: aiSleep },
                    );
                } catch (error) {
                    await commit(async () => {
                        checkpoint.albums[key] = {
                            outcome: 'failed',
                            promptVersion: ALBUM_NAMING_PROMPT_VERSION,
                            imageIds: album.images.map((image) => image.id),
                            attempts: error.attempts ?? 1,
                            lastError: sanitizeEnrichmentError(error),
                            failedAt: new Date().toISOString(),
                        };
                        await saveJournal(checkpointPath, checkpoint);
                        failed += 1;
                        output(
                            stderr,
                            `album ${index + 1}/${enriched.albums.length} failed: ${checkpoint.albums[key].lastError}`,
                        );
                    });
                    return;
                }
            }
            const candidateTitle = formatPartTitle(
                analysis.title,
                album.partNumber,
                album.partCount,
            );
            const candidateSlug = slugify(candidateTitle);
            const reservation = await commit(async () => {
                const result = titleRegistry.tryReserve(candidateTitle, candidateSlug);
                if (!result.accepted) return result;
                checkpoint.albums[key] = {
                    outcome: 'complete',
                    promptVersion: ALBUM_NAMING_PROMPT_VERSION,
                    imageIds: album.images.map((image) => image.id),
                    analysis,
                    completedAt: new Date().toISOString(),
                };
                await saveJournal(checkpointPath, checkpoint);
                applyAlbumAnalysis(enriched, album, analysis);
                await saveJournal(manifestPath, withoutThumbnailDataUrls(enriched));
                output(
                    stdout,
                    `album ${index + 1}/${enriched.albums.length}${resumed ? ' resumed' : ''}`,
                );
                return result;
            });
            if (reservation.accepted) return;
            namingContext = {
                reservedTitles: titleRegistry.titles(),
                rejectedTitle: candidateTitle,
            };
            analysis = null;
            resumed = false;
        }
        await commit(async () => {
            const duplicateSlug = slugify(namingContext.rejectedTitle);
            checkpoint.albums[key] = {
                outcome: 'failed',
                promptVersion: ALBUM_NAMING_PROMPT_VERSION,
                imageIds: album.images.map((image) => image.id),
                attempts: 3,
                lastError: `duplicate_album_slug:${duplicateSlug}`,
                failedAt: new Date().toISOString(),
            };
            await saveJournal(checkpointPath, checkpoint);
            failed += 1;
            output(
                stderr,
                `album ${index + 1}/${enriched.albums.length} failed: ${checkpoint.albums[key].lastError}`,
            );
        });
    });
    return { manifest: withoutThumbnailDataUrls(enriched), failed, checkpointPath };
}

async function executeManifest(manifest, { env = process.env, fetchImpl = fetch, stdout, stderr }) {
    if (manifest.approval?.digest !== computeApprovalDigest(manifest)) {
        throw new Error('approval digest is missing or stale');
    }
    const token = env.NDT_ADMIN_ACCESS_TOKEN;
    const client = new ProductionApiClient({ token, fetchImpl });
    const api = new ProductionAlbumApi(client);
    const categories = await client.request('/categories');
    const categoryIds = new Map(categories.map((category) => [category.slug, category.id]));
    for (const album of manifest.albums) {
        const missing = (album.categorySlugs ?? []).filter((slug) => !categoryIds.has(slug));
        if (missing.length) throw new Error(`unknown production categories: ${missing.join(', ')}`);
    }

    const journalPath = manifest.journalPath ?? `${manifest.sourceRoot}.album-import-journal.json`;
    const journal = (await loadJournal(journalPath, null)) ?? {
        schemaVersion: 1,
        manifestDigest: manifest.approval.digest,
        albums: {},
        tagBackfill: null,
    };
    if (journal.manifestDigest !== manifest.approval.digest) {
        throw new Error('journal manifest digest does not match approved manifest');
    }
    if (!journal.tagBackfill && manifest.tagBackfill?.length) {
        journal.tagBackfill = await applyApprovedTagBackfill({
            api,
            entries: manifest.tagBackfill,
        });
        await saveJournal(journalPath, journal);
    }

    const sortedAlbums = [...manifest.albums].sort(
        (left, right) =>
            (Date.parse(left.shootDate) || 0) - (Date.parse(right.shootDate) || 0) ||
            (left.partNumber ?? 1) - (right.partNumber ?? 1),
    );
    let failed = 0;
    for (const album of sortedAlbums) {
        const journalAlbum = (journal.albums[album.slug] ??= { images: {} });
        if (journalAlbum.outcome === 'published' && journalAlbum.remoteAlbumId) {
            if ('lastError' in journalAlbum) {
                delete journalAlbum.lastError;
                await saveJournal(journalPath, journal);
            }
            output(stdout, `skipped ${album.slug} (already published)`);
            continue;
        }
        try {
            const preparedAlbum = structuredClone(album);
            preparedAlbum.categoryIds = album.categorySlugs.map((slug) => categoryIds.get(slug));
            const cacheDir = join(dirname(manifest.sourceRoot), '.ndt-album-import-cache');
            await mkdir(cacheDir, { recursive: true });
            for (const image of preparedAlbum.images) {
                const cachePath = join(cacheDir, `${image.sourceSha256}.webp`);
                const prepared = await prepareWebp({
                    sourcePath: image.sourcePath,
                    outputPath: cachePath,
                });
                image.filename = prepared.filename;
                image.fileSize = prepared.fileSize;
                image.processedSha256 = prepared.processedSha256;
                image.data = await readFile(cachePath);
            }
            await executeApprovedAlbum({
                api,
                album: preparedAlbum,
                journalAlbum,
                onProgress: async () => saveJournal(journalPath, journal),
            });
            await saveJournal(journalPath, journal);
            output(stdout, `published ${album.slug}`);
        } catch (error) {
            failed += 1;
            journalAlbum.outcome = 'failed';
            journalAlbum.lastError = String(error.message || error).replace(
                /(Bearer|token|key|https?:\/\/[^\s]+)/gi,
                '[redacted]',
            );
            await saveJournal(journalPath, journal);
            output(stderr, `failed ${album.slug}: ${journalAlbum.lastError}`);
            if (error instanceof ApiRequestError && error.status === 401) {
                output(stderr, 'authentication failed; execution stopped before the next album');
                break;
            }
        }
    }
    return { exitCode: failed ? 1 : 0, failed, journalPath };
}

export async function runCli(argv, deps = {}) {
    const stdout = deps.stdout ?? console.log;
    const stderr = deps.stderr ?? console.error;
    const runtimeEnv = deps.env ?? process.env;
    try {
        const { command, flags } = parseCliArgs(argv);
        const manifestPath = flags.manifest && resolve(flags.manifest);
        if (command === 'scan') {
            const source = flags.source ?? runtimeEnv.NDT_SOURCE_ROOT;
            if (!source || !manifestPath)
                throw new Error('--source (or NDT_SOURCE_ROOT) and --manifest are required');
            const summary = await scanSourceToManifest({
                sourceRoot: source,
                manifestPath,
                gapMinutes: flags['gap-minutes'] ? Number(flags['gap-minutes']) : undefined,
            });
            output(stdout, JSON.stringify(summary));
            return { exitCode: 0 };
        }
        if (!manifestPath) throw new Error('--manifest is required');
        if (command === 'report-missing-exif') {
            const manifest = await readManifest(manifestPath);
            const albums = findMissingExifAlbums(manifest);
            const outputPath = flags.output
                ? resolve(flags.output)
                : join(dirname(manifestPath), 'missing-exif-albums.md');
            await mkdir(dirname(outputPath), { recursive: true });
            await writeFile(outputPath, renderMissingExifReport(manifest), 'utf8');
            output(
                stdout,
                JSON.stringify({
                    albums: albums.length,
                    images: albums.reduce((sum, album) => sum + (album.images?.length ?? 0), 0),
                    outputPath,
                }),
            );
            return { exitCode: 0, outputPath };
        }
        if (command === 'repair') {
            const manifest = await readManifest(manifestPath);
            const catalog = await fetchCatalog(deps.fetchImpl ?? fetch);
            const hydrated = await attachThumbnailDataUrls(manifest);
            const checkpointPath = flags.checkpoint
                ? resolve(flags.checkpoint)
                : `${manifestPath}.repair-journal.json`;
            const proposedTagsReportPath = flags['proposed-tags-report']
                ? resolve(flags['proposed-tags-report'])
                : join(dirname(manifestPath), 'proposed-tags-review.md');
            const result = await repairManifest({
                manifest: hydrated,
                manifestPath,
                checkpointPath,
                proposedTagsReportPath,
                catalog,
                repairAltBatch: (options) =>
                    (deps.repairAltBatch ?? repairAltBatchWithAi)({
                        ...options,
                        fetchImpl: deps.fetchImpl ?? fetch,
                    }),
                repairMetadata: (options) =>
                    (deps.repairMetadata ?? repairMetadataWithAi)({
                        ...options,
                        fetchImpl: deps.fetchImpl ?? fetch,
                    }),
                sleep: deps.aiSleep,
                stdout: (message) => output(stdout, message),
                stderr: (message) => output(stderr, message),
            });
            const summary = {
                altBatches: result.altBatches,
                metadataAlbums: result.metadataAlbums,
                discardedProposedTags: result.discardedProposedTags,
                failed: result.failed,
                remainingReviewAlbums: result.remainingReviewAlbums,
                valid: result.valid,
                checkpointPath: result.checkpointPath,
                proposedTagsReportPath: result.proposedTagsReportPath,
            };
            output(stdout, JSON.stringify(summary));
            return { exitCode: result.failed ? 1 : 0, ...summary };
        }
        if (command === 'enrich') {
            const manifest = await readManifest(manifestPath);
            const result = await enrichManifest(manifest, {
                manifestPath,
                checkpointPath: flags.checkpoint ? resolve(flags.checkpoint) : undefined,
                fetchImpl: deps.fetchImpl ?? fetch,
                aiAnalyze: deps.aiAnalyze ?? analyzeAlbumWithAi,
                aiCluster: deps.aiCluster ?? analyzeGroupingWindowWithAi,
                aiSleep: deps.aiSleep,
                stdout,
                stderr,
            });
            output(
                stdout,
                JSON.stringify({
                    albums: result.manifest.albums.length,
                    enriched: result.failed === 0,
                    failed: result.failed,
                    checkpointPath: result.checkpointPath,
                }),
            );
            return { exitCode: result.failed ? 1 : 0, ...result };
        }
        if (command === 'validate') {
            const manifest = await readManifest(manifestPath);
            const result = validateAndApproveManifest(manifest, {
                approve: Boolean(flags.approve),
            });
            output(stdout, JSON.stringify(result.validation));
            if (result.validation.valid && flags.approve) {
                await writeFile(
                    manifestPath,
                    `${JSON.stringify(result.manifest, null, 2)}\n`,
                    'utf8',
                );
            }
            return { exitCode: result.validation.valid ? 0 : 2 };
        }
        if (flags['execute-production'] !== true) {
            throw new Error('--execute-production is required');
        }
        if (!runtimeEnv.NDT_ADMIN_ACCESS_TOKEN) {
            throw new Error('NDT_ADMIN_ACCESS_TOKEN is required');
        }
        const manifest = await readManifest(manifestPath);
        const validation = validateManifest(manifest, { requireApproval: true });
        if (!validation.valid) throw new Error(validation.errors.join('; '));
        return executeManifest(manifest, {
            env: runtimeEnv,
            fetchImpl: deps.fetchImpl ?? fetch,
            stdout,
            stderr,
        });
    } catch (error) {
        output(stderr, error.message || String(error));
        return { exitCode: 2, error };
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const result = await runCli(process.argv.slice(2));
    process.exitCode = result.exitCode;
}
