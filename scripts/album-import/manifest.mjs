import { createHash } from 'node:crypto';

import { MANIFEST_SCHEMA_VERSION, MAX_ALBUM_IMAGES, PRODUCTION_ORIGIN } from './constants.mjs';

export function slugify(value) {
    return value
        .normalize('NFD')
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-');
}

export function splitAlbumParts({ title, images }, maxImages = MAX_ALBUM_IMAGES) {
    if (!title?.trim()) throw new TypeError('title is required');
    if (!Array.isArray(images) || images.length === 0) throw new TypeError('images are required');
    if (!Number.isInteger(maxImages) || maxImages < 1 || maxImages > MAX_ALBUM_IMAGES) {
        throw new RangeError(`maxImages must be between 1 and ${MAX_ALBUM_IMAGES}`);
    }
    const partCount = Math.ceil(images.length / maxImages);
    return Array.from({ length: partCount }, (_, index) => {
        const numberedTitle = partCount > 1 ? `${title.trim()} #${index + 1}` : title.trim();
        return {
            title: numberedTitle,
            slug: slugify(numberedTitle),
            partNumber: index + 1,
            partCount,
            images: images.slice(index * maxImages, (index + 1) * maxImages),
        };
    });
}

function canonicalize(value, key) {
    if (key === 'approval' || key === 'execution' || key === 'journal') return undefined;
    if (Array.isArray(value))
        return value.map((item) => canonicalize(item)).filter((item) => item !== undefined);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map((childKey) => [childKey, canonicalize(value[childKey], childKey)])
                .filter(([, childValue]) => childValue !== undefined),
        );
    }
    return value;
}

export function computeApprovalDigest(manifest) {
    const canonical = JSON.stringify(canonicalize(manifest));
    return createHash('sha256').update(canonical).digest('hex');
}

export function approveManifest(manifest, approvedAt = new Date().toISOString()) {
    const withoutApproval = structuredClone(manifest);
    delete withoutApproval.approval;
    return {
        ...withoutApproval,
        approval: {
            approvedAt,
            productionOrigin: PRODUCTION_ORIGIN,
            digest: computeApprovalDigest(withoutApproval),
        },
    };
}

function coverExists(album) {
    if (!album.coverFile || !Array.isArray(album.images)) return false;
    const normalized = album.coverFile.normalize('NFC').toLowerCase();
    return album.images.some((image) => {
        const candidates = [image.relativePath, image.normalizedFilename]
            .filter(Boolean)
            .map((value) => value.normalize('NFC').toLowerCase());
        return candidates.includes(normalized);
    });
}

export function validateManifest(manifest, { requireApproval = false } = {}) {
    const errors = [];
    const warnings = [];
    if (manifest?.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
        errors.push(`schemaVersion must be ${MANIFEST_SCHEMA_VERSION}`);
    }
    if (manifest?.productionOrigin !== PRODUCTION_ORIGIN) {
        errors.push(`productionOrigin must be ${PRODUCTION_ORIGIN}`);
    }
    if (!manifest?.sourceRoot) errors.push('sourceRoot is required');
    if (!Array.isArray(manifest?.albums) || manifest.albums.length === 0) {
        errors.push('at least one album is required');
    }
    if (manifest?.unassignedImages?.length) {
        errors.push(`${manifest.unassignedImages.length} unassigned images require AI grouping`);
    }

    const slugs = new Set();
    for (const [index, album] of (manifest?.albums ?? []).entries()) {
        const label = album.slug || `album[${index}]`;
        if (!album.title?.trim()) errors.push(`${label}: title is required`);
        if (!album.slug?.trim()) errors.push(`${label}: slug is required`);
        if (slugs.has(album.slug)) errors.push(`duplicate slug: ${album.slug}`);
        slugs.add(album.slug);
        if (!Array.isArray(album.images) || album.images.length < 1) {
            errors.push(`${label}: at least one image is required`);
        } else if (album.images.length > MAX_ALBUM_IMAGES) {
            errors.push(`${label}: exceeds ${MAX_ALBUM_IMAGES} images`);
        }
        if (album.description) errors.push(`${label}: description must remain empty`);
        if (!album.shootDate) errors.push(`${label}: shootDate is required`);
        if (!coverExists(album)) errors.push(`${label}: coverFile must reference an album image`);
        if (album.needsReview?.length)
            errors.push(`${label}: needs review: ${album.needsReview.join(', ')}`);
        for (const image of album.images ?? []) {
            if (!image.capturedAt)
                errors.push(`${label}: ${image.relativePath} is missing EXIF capture date`);
            if (!image.altText?.trim())
                warnings.push(`${label}: ${image.relativePath} is missing alt text`);
        }
    }

    if (requireApproval) {
        const expected = computeApprovalDigest(manifest);
        if (manifest?.approval?.productionOrigin !== PRODUCTION_ORIGIN) {
            errors.push('approval production origin is missing or invalid');
        }
        if (manifest?.approval?.digest !== expected) {
            errors.push('approval digest is missing or stale');
        }
    }
    return { valid: errors.length === 0, errors, warnings };
}
