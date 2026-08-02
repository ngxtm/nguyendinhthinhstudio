import { splitAlbumParts } from './manifest.mjs';

class DisjointSet {
    constructor(ids) {
        this.parent = new Map(ids.map((id) => [id, id]));
    }

    find(id) {
        const parent = this.parent.get(id);
        if (!parent) throw new Error(`unknown image ID: ${id}`);
        if (parent === id) return id;
        const root = this.find(parent);
        this.parent.set(id, root);
        return root;
    }

    union(left, right) {
        const leftRoot = this.find(left);
        const rightRoot = this.find(right);
        if (leftRoot !== rightRoot) this.parent.set(rightRoot, leftRoot);
    }
}

export async function regroupUnassignedImages(
    manifest,
    { clusterWindow, windowSize = 32, overlap = 6 } = {},
) {
    if (typeof clusterWindow !== 'function') throw new TypeError('clusterWindow is required');
    if (!Number.isInteger(windowSize) || windowSize < 2) {
        throw new RangeError('windowSize must be at least 2');
    }
    if (!Number.isInteger(overlap) || overlap < 1 || overlap >= windowSize) {
        throw new RangeError('overlap must be between 1 and windowSize - 1');
    }
    const result = structuredClone(manifest);
    const images = result.unassignedImages ?? [];
    if (!images.length) return result;

    const order = new Map(images.map((image, index) => [image.id, index]));
    const sets = new DisjointSet(images.map((image) => image.id));
    const step = windowSize - overlap;
    for (let start = 0; start < images.length; start += step) {
        const window = images.slice(start, start + windowSize);
        if (!window.length) break;
        const grouping = await clusterWindow(window);
        for (const group of grouping.groups ?? []) {
            const [first, ...rest] = group.imageIds;
            for (const imageId of rest) sets.union(first, imageId);
        }
        if (start + windowSize >= images.length) break;
    }

    const components = new Map();
    for (const image of images) {
        const root = sets.find(image.id);
        const component = components.get(root) ?? [];
        component.push(image);
        components.set(root, component);
    }
    const groups = [...components.values()]
        .map((group) => group.toSorted((left, right) => order.get(left.id) - order.get(right.id)))
        .toSorted((left, right) => order.get(left[0].id) - order.get(right[0].id));

    const regroupedAlbums = [];
    for (const [groupIndex, group] of groups.entries()) {
        const parts = splitAlbumParts({
            title: `Needs review group ${groupIndex + 1}`,
            images: group,
        });
        for (const part of parts) {
            regroupedAlbums.push({
                title: part.title,
                slug: part.slug,
                partNumber: part.partNumber,
                partCount: part.partCount,
                shootDate: null,
                categorySlugs: [],
                tagSlugs: [],
                metaTitle: '',
                metaDescription: '',
                coverFile: part.images[0].relativePath,
                images: part.images,
                needsReview: ['ai_enrichment_required', 'missing_exif_date'],
                groupingSource: 'ai_visual',
            });
        }
    }
    result.albums = [...(result.albums ?? []), ...regroupedAlbums];
    result.unassignedImages = [];
    return result;
}
