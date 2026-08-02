import { createHash } from 'node:crypto';

import { PRODUCTION_ORIGIN } from './constants.mjs';

const RATE_LIMITS = Object.freeze({
    upload_url: { limit: 60, windowMs: 10 * 60 * 1000 },
    confirm_upload: { limit: 60, windowMs: 10 * 60 * 1000 },
    upload_status: { limit: 120, windowMs: 60 * 1000 },
});

const defaultSleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, Math.max(0, milliseconds)));

export class ApiRequestError extends Error {
    constructor(status, data) {
        super(`Production API request failed with HTTP ${status}`);
        this.name = 'ApiRequestError';
        this.status = status;
        this.data = data;
    }
}

class SlidingWindowLimiter {
    constructor({ now, sleep }) {
        this.now = now;
        this.sleep = sleep;
        this.events = new Map();
    }

    async wait(scope) {
        const policy = RATE_LIMITS[scope];
        if (!policy) return;
        for (;;) {
            const now = this.now();
            const events = (this.events.get(scope) ?? []).filter(
                (timestamp) => now - timestamp < policy.windowMs,
            );
            if (events.length < policy.limit) {
                events.push(now);
                this.events.set(scope, events);
                return;
            }
            await this.sleep(Math.max(1, events[0] + policy.windowMs - now));
        }
    }
}

export class ProductionApiClient {
    constructor({
        token,
        fetchImpl = fetch,
        now = Date.now,
        sleep = defaultSleep,
        origin = PRODUCTION_ORIGIN,
    } = {}) {
        if (!token?.trim()) throw new Error('NDT_ADMIN_ACCESS_TOKEN is required');
        if (origin !== PRODUCTION_ORIGIN) throw new Error('production origin is pinned');
        this.token = token;
        this.fetchImpl = fetchImpl;
        this.now = now;
        this.sleep = sleep;
        this.limiter = new SlidingWindowLimiter({ now, sleep });
    }

    request(endpoint, options = {}) {
        if (
            typeof endpoint !== 'string' ||
            !endpoint.startsWith('/') ||
            endpoint.startsWith('//')
        ) {
            throw new Error('Production API endpoint must be a relative endpoint');
        }
        return this.#request(endpoint, options);
    }

    async #request(endpoint, options) {
        const url = new URL(endpoint, PRODUCTION_ORIGIN);
        if (url.origin !== PRODUCTION_ORIGIN) throw new Error('Production API origin mismatch');
        const { scope, body, headers: inputHeaders, ...requestOptions } = options;
        const headers = { ...inputHeaders, Authorization: `Bearer ${this.token}` };
        let requestBody = body;
        if (
            body !== undefined &&
            body !== null &&
            !Buffer.isBuffer(body) &&
            typeof body !== 'string'
        ) {
            requestBody = JSON.stringify(body);
            headers['Content-Type'] ??= 'application/json';
        }

        let serverFailures = 0;
        for (;;) {
            await this.limiter.wait(scope);
            let response;
            try {
                response = await this.fetchImpl(url, {
                    ...requestOptions,
                    headers,
                    body: requestBody,
                    redirect: 'error',
                });
            } catch (error) {
                if (serverFailures >= 2) throw error;
                serverFailures += 1;
                await this.sleep(250 * 2 ** (serverFailures - 1));
                continue;
            }
            const contentType = response.headers.get('content-type') ?? '';
            const data = contentType.includes('application/json')
                ? await response.json()
                : await response.text();
            if (
                (response.status === 429 && data?.code === 'upload_rate_limited') ||
                (response.status === 503 && data?.code === 'upload_rate_limit_unavailable')
            ) {
                const retryAt = Date.parse(data.retryAfter);
                if (!Number.isFinite(retryAt)) throw new ApiRequestError(response.status, data);
                await this.sleep(Math.max(0, retryAt - this.now()));
                continue;
            }
            if (response.status >= 500 && response.status <= 599 && serverFailures < 2) {
                serverFailures += 1;
                await this.sleep(250 * 2 ** (serverFailures - 1));
                continue;
            }
            if (!response.ok) throw new ApiRequestError(response.status, data);
            return data;
        }
    }

    async putPresigned(uploadUrl, data) {
        const url = new URL(uploadUrl);
        if (url.protocol !== 'https:') throw new Error('presigned upload URL must use HTTPS');
        const response = await this.fetchImpl(url, {
            method: 'PUT',
            redirect: 'error',
            headers: { 'Content-Type': 'image/webp' },
            body: data,
        });
        if (!response.ok) throw new ApiRequestError(response.status, null);
    }

    async waitUntil(timestamp) {
        const target = Date.parse(timestamp);
        if (Number.isFinite(target)) await this.sleep(Math.max(0, target - this.now()));
    }
}

export function deterministicClientRequestId(albumSlug, processedSha256) {
    if (!/^[0-9a-f]{64}$/.test(processedSha256)) {
        throw new TypeError('processedSha256 must be lowercase SHA-256');
    }
    const bytes = createHash('sha256')
        .update(`${albumSlug}\0${processedSha256}`)
        .digest()
        .subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function terminalUploadError(response) {
    if (response.outcome === 'failed') return response.failureCode || response.code;
    if (['gone', 'deleted', 'unavailable'].includes(response.outcome)) return response.code;
    return null;
}

async function waitForConsumed(api, response, uploadId) {
    let current = response;
    for (;;) {
        if (current.outcome === 'consumed') return current;
        const failure = terminalUploadError(current);
        if (failure) throw new Error(failure);
        if (current.outcome === 'pending') {
            current = await api.confirm(uploadId);
            continue;
        }
        if (!['finalizing', 'retryable'].includes(current.outcome)) {
            throw new Error('unexpected_upload_response');
        }
        await api.waitUntil(current.retryAfter);
        current = await api.status(uploadId);
    }
}

export async function uploadPreparedImage({ api, albumId, albumSlug, image }) {
    const presign = await api.presign({
        clientRequestId: deterministicClientRequestId(albumSlug, image.processedSha256),
        albumId,
        filename: image.filename.normalize('NFC'),
        contentType: 'image/webp',
        fileSize: image.fileSize,
        processedSha256: image.processedSha256,
    });
    if (presign.outcome === 'consumed') return presign;
    const failure = terminalUploadError(presign);
    if (failure) throw new Error(failure);
    if (presign.outcome === 'ready') {
        await api.putPresigned(presign.uploadUrl, image.data);
        return waitForConsumed(api, await api.confirm(presign.uploadId), presign.uploadId);
    }
    return waitForConsumed(api, presign, presign.uploadId);
}

function normalized(value) {
    return value?.normalize('NFC').toLowerCase();
}

function remoteCoverId(album, journalAlbum) {
    const cover = normalized(album.coverFile);
    const source = album.images.find(
        (image) =>
            normalized(image.relativePath) === cover ||
            normalized(image.normalizedFilename) === cover ||
            normalized(image.filename) === cover,
    );
    return source ? journalAlbum.images[source.id]?.remoteImageId : null;
}

export async function executeApprovedAlbum({
    api,
    album,
    journalAlbum,
    onProgress = async () => {},
}) {
    if (journalAlbum.outcome === 'published' && journalAlbum.remoteAlbumId) {
        return journalAlbum;
    }
    let remoteAlbum;
    if (journalAlbum.remoteAlbumId) {
        remoteAlbum = await api.getAdminAlbum(journalAlbum.remoteAlbumId);
    } else {
        const existing = await api.findAdminAlbumBySlug(album.slug);
        if (existing) throw new Error(`album_slug_exists_without_journal:${album.slug}`);
        remoteAlbum = await api.createAlbum({
            title: album.title,
            slug: album.slug,
            shootDate: album.shootDate,
            categoryIds: album.categoryIds,
            tagSlugs: album.tagSlugs,
            status: 'draft',
            metaTitle: album.metaTitle,
            metaDescription: album.metaDescription,
        });
        journalAlbum.remoteAlbumId = remoteAlbum.id;
        await onProgress(journalAlbum);
    }
    journalAlbum.images ??= {};

    for (const image of album.images) {
        const imageState = (journalAlbum.images[image.id] ??= {});
        if (!imageState.remoteImageId) {
            const result = api.uploadPreparedImage
                ? await api.uploadPreparedImage({
                      albumId: remoteAlbum.id,
                      albumSlug: album.slug,
                      image,
                  })
                : await uploadPreparedImage({
                      api,
                      albumId: remoteAlbum.id,
                      albumSlug: album.slug,
                      image,
                  });
            imageState.uploadId = result.uploadId;
            imageState.remoteImageId = result.image.id;
            imageState.outcome = 'consumed';
        }
        await api.updateImage(imageState.remoteImageId, { altText: image.altText });
        await onProgress(journalAlbum);
    }

    const hydrated = await api.getAdminAlbum(remoteAlbum.id);
    const expectedIds = new Set(
        album.images.map((image) => journalAlbum.images[image.id]?.remoteImageId).filter(Boolean),
    );
    const actualIds = new Set((hydrated.images ?? []).map((image) => image.id));
    if (
        expectedIds.size !== album.images.length ||
        actualIds.size !== album.images.length ||
        [...expectedIds].some((id) => !actualIds.has(id))
    ) {
        throw new Error(`album_image_membership_mismatch:${album.slug}`);
    }

    const coverImageId = remoteCoverId(album, journalAlbum);
    if (!coverImageId) throw new Error(`album_cover_unresolved:${album.slug}`);
    await api.setCover(remoteAlbum.id, coverImageId);
    await api.updateAlbum(remoteAlbum.id, {
        title: album.title,
        slug: album.slug,
        shootDate: album.shootDate,
        categoryIds: album.categoryIds,
        tagSlugs: album.tagSlugs,
        metaTitle: album.metaTitle,
        metaDescription: album.metaDescription,
    });
    await api.publishAlbum(remoteAlbum.id);
    journalAlbum.outcome = 'published';
    journalAlbum.coverImageId = coverImageId;
    delete journalAlbum.lastError;
    return journalAlbum;
}

function albumTagSlugs(album) {
    return [
        ...new Set(
            (album.tags ?? [])
                .map((entry) => entry?.tag?.slug ?? entry?.slug)
                .filter((slug) => typeof slug === 'string' && slug.trim())
                .map((slug) => slug.trim()),
        ),
    ];
}

export async function applyApprovedTagBackfill({ api, entries }) {
    if (!Array.isArray(entries)) throw new TypeError('tag backfill entries must be an array');
    const tags = await api.getTags();
    const known = new Set(tags.map((tag) => tag.slug));
    let createdTags = 0;
    let updatedAlbums = 0;
    for (const entry of entries) {
        const tag = entry?.tag;
        if (!tag?.name?.trim() || !tag?.slug?.trim()) {
            throw new Error('tag backfill entry has invalid tag metadata');
        }
        if (!known.has(tag.slug)) {
            await api.createTag({ name: tag.name.trim(), slug: tag.slug.trim() });
            known.add(tag.slug);
            createdTags += 1;
        }
        for (const albumSlug of entry.albumSlugs ?? []) {
            const album = await api.findAdminAlbumBySlug(albumSlug);
            if (!album) throw new Error(`tag_backfill_album_not_found:${albumSlug}`);
            const tagSlugs = albumTagSlugs(album);
            if (!tagSlugs.includes(tag.slug)) {
                await api.updateAlbum(album.id, { tagSlugs: [...tagSlugs, tag.slug] });
                updatedAlbums += 1;
            }
        }
    }
    return { createdTags, updatedAlbums };
}

export class ProductionAlbumApi {
    constructor(client) {
        this.client = client;
    }

    async findAdminAlbumBySlug(slug) {
        try {
            return await this.client.request(`/albums/admin/slug/${encodeURIComponent(slug)}`);
        } catch (error) {
            if (error instanceof ApiRequestError && error.status === 404) return null;
            throw error;
        }
    }

    createAlbum(body) {
        return this.client.request('/albums', { method: 'POST', body });
    }

    getAdminAlbum(id) {
        return this.client.request(`/albums/admin/${encodeURIComponent(id)}`);
    }

    updateAlbum(id, body) {
        return this.client.request(`/albums/${encodeURIComponent(id)}`, { method: 'PATCH', body });
    }

    setCover(id, imageId) {
        return this.client.request(`/albums/${encodeURIComponent(id)}/cover`, {
            method: 'PATCH',
            body: { imageId },
        });
    }

    publishAlbum(id) {
        return this.client.request(`/albums/${encodeURIComponent(id)}/publish`, {
            method: 'PATCH',
        });
    }

    updateImage(id, body) {
        return this.client.request(`/images/${encodeURIComponent(id)}`, { method: 'PATCH', body });
    }

    getTags() {
        return this.client.request('/tags');
    }

    createTag(body) {
        return this.client.request('/tags', { method: 'POST', body });
    }

    presign(body) {
        return this.client.request('/images/upload-url', {
            method: 'POST',
            body,
            scope: 'upload_url',
        });
    }

    confirm(uploadId) {
        return this.client.request('/images/confirm-upload', {
            method: 'POST',
            body: { uploadId },
            scope: 'confirm_upload',
        });
    }

    status(uploadId) {
        return this.client.request(`/images/upload-sessions/${encodeURIComponent(uploadId)}`, {
            scope: 'upload_status',
        });
    }

    putPresigned(url, data) {
        return this.client.putPresigned(url, data);
    }

    waitUntil(timestamp) {
        return this.client.waitUntil(timestamp);
    }
}
