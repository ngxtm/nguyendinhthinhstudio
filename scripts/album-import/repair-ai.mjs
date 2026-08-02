import { requestJsonCompletion } from './ai.mjs';

export const ALT_REPAIR_BATCH_SIZE = 8;

function imageContent(images) {
    return images.flatMap((image) => [
        { type: 'text', text: `imageId: ${image.id}` },
        {
            type: 'image_url',
            image_url: { url: image.thumbnailDataUrl, detail: 'low' },
        },
    ]);
}

export function buildAltRepairMessages({ album, images }) {
    if (!Array.isArray(images) || images.length < 1 || images.length > ALT_REPAIR_BATCH_SIZE) {
        throw new RangeError(`alt repair requires 1 to at most ${ALT_REPAIR_BATCH_SIZE} images`);
    }
    return [
        {
            role: 'system',
            content:
                'Write natural Vietnamese photography alt text. Return only one JSON object and preserve every supplied image ID exactly.',
        },
        {
            role: 'user',
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        task: 'Return imageAltTexts for every supplied image.',
                        albumTitle: album.title,
                        categorySlugs: album.categorySlugs ?? [],
                        tagSlugs: album.tagSlugs ?? [],
                        imageIds: images.map((image) => image.id),
                        rules: {
                            language: 'Natural Vietnamese.',
                            maximumLength: 180,
                            completeness: 'Every image ID exactly once.',
                            style: 'Describe visible subject and scene without keyword stuffing.',
                        },
                    }),
                },
                ...imageContent(images),
            ],
        },
    ];
}

export function parseAltRepairResult(value, { imageIds }) {
    const supplied = value?.imageAltTexts;
    if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) {
        throw new Error('alt repair must contain imageAltTexts for every image ID');
    }
    const expected = new Set(imageIds);
    if (expected.size !== imageIds.length || Object.keys(supplied).length !== expected.size) {
        throw new Error('alt repair must contain every image ID exactly once');
    }
    const imageAltTexts = {};
    for (const [id, raw] of Object.entries(supplied)) {
        if (!expected.has(id)) throw new Error('alt repair contains an unknown image ID');
        const text = typeof raw === 'string' ? raw.trim() : '';
        if (!text) throw new Error('alt repair must contain every image ID exactly once');
        if (text.length > 180) throw new Error('alt repair text must not exceed 180 characters');
        imageAltTexts[id] = text;
    }
    return { imageAltTexts };
}

export async function repairAltBatchWithAi({
    album,
    images,
    fetchImpl = fetch,
    baseUrl = process.env.NDT_AI_BASE_URL,
    apiKey = process.env.NDT_AI_API_KEY,
    model = process.env.NDT_AI_MODEL,
}) {
    const value = await requestJsonCompletion({
        messages: buildAltRepairMessages({ album, images }),
        fetchImpl,
        baseUrl,
        apiKey,
        model,
        taskName: 'AI alt repair',
    });
    return parseAltRepairResult(value, { imageIds: images.map((image) => image.id) });
}

export function buildMetadataRepairMessages({ album }) {
    return [
        {
            role: 'system',
            content:
                'Repair photography SEO and choose a cover. Return only one valid JSON object.',
        },
        {
            role: 'user',
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        task: 'Return only metaTitle, metaDescription, and coverCandidates.',
                        albumTitle: album.title,
                        currentMetaTitle: album.metaTitle,
                        currentMetaDescription: album.metaDescription,
                        imageIds: album.images.map((image) => image.id),
                        rules: {
                            metaTitle: '20-70 characters.',
                            metaDescription: '50-170 characters.',
                            coverCandidates: 'Ordered valid supplied image IDs.',
                        },
                    }),
                },
                ...imageContent(album.images),
            ],
        },
    ];
}

export function parseMetadataRepairResult(value, { imageIds }) {
    const metaTitle = typeof value?.metaTitle === 'string' ? value.metaTitle.trim() : '';
    if (metaTitle.length < 20 || metaTitle.length > 70) {
        throw new Error('metadata repair metaTitle must contain 20-70 characters');
    }
    const metaDescription =
        typeof value?.metaDescription === 'string' ? value.metaDescription.trim() : '';
    if (metaDescription.length < 50 || metaDescription.length > 170) {
        throw new Error('metadata repair metaDescription must contain 50-170 characters');
    }
    const validIds = new Set(imageIds);
    const coverCandidates = Array.isArray(value?.coverCandidates)
        ? [...new Set(value.coverCandidates.filter((id) => validIds.has(id)))]
        : [];
    if (!coverCandidates.length)
        throw new Error('metadata repair requires a valid cover candidate');
    return { metaTitle, metaDescription, coverCandidates, coverFileId: coverCandidates[0] };
}

export async function repairMetadataWithAi({
    album,
    fetchImpl = fetch,
    baseUrl = process.env.NDT_AI_BASE_URL,
    apiKey = process.env.NDT_AI_API_KEY,
    model = process.env.NDT_AI_MODEL,
}) {
    const value = await requestJsonCompletion({
        messages: buildMetadataRepairMessages({ album }),
        fetchImpl,
        baseUrl,
        apiKey,
        model,
        taskName: 'AI metadata repair',
    });
    return parseMetadataRepairResult(value, { imageIds: album.images.map((image) => image.id) });
}
