import { ALBUM_NAMING_PROMPT_VERSION, ARTISTIC_NAMING_POLICY } from './naming.mjs';

function compactCatalog(catalog) {
    return {
        categories: catalog.categories.map(({ name, slug }) => ({ name, slug })),
        tags: catalog.tags.map(({ name, slug }) => ({ name, slug })),
    };
}

function compactNamingContext(namingContext) {
    const reservedTitles = uniqueStrings(namingContext?.reservedTitles).slice(0, 250);
    const rejectedTitle =
        typeof namingContext?.rejectedTitle === 'string' && namingContext.rejectedTitle.trim()
            ? namingContext.rejectedTitle.trim()
            : null;
    return {
        promptVersion: ALBUM_NAMING_PROMPT_VERSION,
        policy: ARTISTIC_NAMING_POLICY,
        reservedTitles,
        rejectedTitle,
    };
}

export function buildVisionMessages({ album, catalog, namingContext = {} }) {
    const safeImages = album.images.map((image) => ({
        id: image.id,
        capturedAt: image.capturedAt ?? null,
    }));
    const content = [
        {
            type: 'text',
            text: JSON.stringify({
                task: 'Analyze this NDT Studio photo album and return the required JSON object.',
                albumId: album.id,
                catalog: compactCatalog(catalog),
                images: safeImages,
                naming: compactNamingContext(namingContext),
                rules: {
                    title: 'Follow naming.policy and do not reuse naming.reservedTitles or naming.rejectedTitle.',
                    description: 'Do not create an album description.',
                    categories: 'Use only supplied category slugs.',
                    tags: 'Prefer supplied tag slugs. Put genuinely missing concepts in proposedTags.',
                    metaTitle: '20-70 characters.',
                    metaDescription: '50-170 characters.',
                    coverCandidates: 'Rank valid image IDs from best to weaker.',
                    imageAltTexts:
                        'One natural Vietnamese description for every image ID; no keyword stuffing.',
                },
            }),
        },
    ];
    for (const image of album.images) {
        content.push({ type: 'text', text: `imageId: ${image.id}` });
        content.push({
            type: 'image_url',
            image_url: { url: image.thumbnailDataUrl, detail: 'low' },
        });
    }
    return [
        {
            role: 'system',
            content:
                'You are a photography catalog editor. Return only one valid JSON object and preserve every supplied image ID exactly.',
        },
        { role: 'user', content },
    ];
}

export function buildGroupingMessages({ images }) {
    const content = [
        {
            type: 'text',
            text: JSON.stringify({
                task: 'Group these adjacent NDT Studio thumbnails into coherent photoshoots.',
                images: images.map((image, position) => ({
                    id: image.id,
                    position,
                })),
                rules: {
                    groupBy:
                        'Same person or people, outfit, background, lighting setup, props, and visual concept.',
                    separateWhen:
                        'The person, outfit, background, occasion, or concept materially changes.',
                    overlap:
                        'Some images may also appear in the previous or next window. Preserve IDs exactly.',
                    uncertain:
                        'Place genuinely ambiguous images in uncertainImageIds instead of guessing.',
                    output: 'Return groups with a short internal label and imageIds, plus uncertainImageIds.',
                },
            }),
        },
    ];
    for (const image of images) {
        content.push({ type: 'text', text: `imageId: ${image.id}` });
        content.push({
            type: 'image_url',
            image_url: { url: image.thumbnailDataUrl, detail: 'low' },
        });
    }
    return [
        {
            role: 'system',
            content:
                'You cluster professional photo-session thumbnails. Return only one valid JSON object. Every supplied image ID must appear exactly once.',
        },
        { role: 'user', content },
    ];
}

function uniqueStrings(value) {
    if (!Array.isArray(value)) return [];
    return [
        ...new Set(
            value
                .filter((item) => typeof item === 'string')
                .map((item) => item.trim())
                .filter(Boolean),
        ),
    ];
}

export function parseAiAlbumAnalysis(value, { catalog, imageIds }) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('AI analysis must be an object');
    }
    const needsReview = [];
    const knownCategories = new Set(catalog.categories.map((entry) => entry.slug));
    const knownTags = new Set(catalog.tags.map((entry) => entry.slug));
    const validImageIds = new Set(imageIds);
    const categorySlugs = uniqueStrings(value.categorySlugs);
    const tagSlugs = uniqueStrings(value.tagSlugs);
    for (const slug of categorySlugs) {
        if (!knownCategories.has(slug)) needsReview.push(`unknown_category:${slug}`);
    }
    for (const slug of tagSlugs) {
        if (!knownTags.has(slug)) needsReview.push(`unknown_tag:${slug}`);
    }
    const proposedTags = Array.isArray(value.proposedTags)
        ? value.proposedTags
              .filter((tag) => tag && typeof tag.name === 'string' && typeof tag.slug === 'string')
              .map((tag) => ({ name: tag.name.trim(), slug: tag.slug.trim() }))
        : [];
    for (const tag of proposedTags) needsReview.push(`proposed_tag:${tag.slug}`);

    const title = typeof value.title === 'string' ? value.title.trim() : '';
    if (title.length < 2 || title.length > 80) needsReview.push('title_length');
    const metaTitle = typeof value.metaTitle === 'string' ? value.metaTitle.trim() : '';
    if (metaTitle.length < 20 || metaTitle.length > 70) needsReview.push('meta_title_length');
    const metaDescription =
        typeof value.metaDescription === 'string' ? value.metaDescription.trim() : '';
    if (metaDescription.length < 50 || metaDescription.length > 170) {
        needsReview.push('meta_description_length');
    }

    const imageAltTexts = {};
    const suppliedAltTexts =
        value.imageAltTexts && typeof value.imageAltTexts === 'object' ? value.imageAltTexts : {};
    for (const imageId of imageIds) {
        const altText =
            typeof suppliedAltTexts[imageId] === 'string' ? suppliedAltTexts[imageId].trim() : '';
        if (!altText) needsReview.push(`missing_alt_text:${imageId}`);
        else if (altText.length > 180) needsReview.push(`alt_text_length:${imageId}`);
        imageAltTexts[imageId] = altText;
    }

    const coverCandidates = uniqueStrings(value.coverCandidates).filter((id) =>
        validImageIds.has(id),
    );
    if (!coverCandidates.length) needsReview.push('invalid_cover_candidate');

    return {
        title,
        categorySlugs: categorySlugs.filter((slug) => knownCategories.has(slug)),
        tagSlugs: tagSlugs.filter((slug) => knownTags.has(slug)),
        proposedTags,
        metaTitle,
        metaDescription,
        coverCandidates,
        coverFileId: coverCandidates[0] ?? null,
        imageAltTexts,
        needsReview: [...new Set(needsReview)],
    };
}

export function parseAiGrouping(value, { imageIds }) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('AI grouping must be an object');
    }
    const expected = new Set(imageIds);
    if (expected.size !== imageIds.length) throw new Error('input image IDs must be unique');
    const seen = new Set();
    const groups = [];
    for (const [index, group] of (Array.isArray(value.groups) ? value.groups : []).entries()) {
        const ids = uniqueStrings(group?.imageIds);
        if (!ids.length) throw new Error(`AI group ${index} is empty`);
        for (const id of ids) {
            if (!expected.has(id) || seen.has(id)) {
                throw new Error('AI grouping must contain every image exactly once');
            }
            seen.add(id);
        }
        groups.push({
            label:
                typeof group?.label === 'string' && group.label.trim()
                    ? group.label.trim()
                    : `group-${index + 1}`,
            imageIds: ids,
        });
    }
    const uncertainImageIds = uniqueStrings(value.uncertainImageIds);
    for (const id of uncertainImageIds) {
        if (!expected.has(id) || seen.has(id)) {
            throw new Error('AI grouping must contain every image exactly once');
        }
        seen.add(id);
    }
    if (seen.size !== expected.size) {
        throw new Error('AI grouping must contain every image exactly once');
    }
    return { groups, uncertainImageIds };
}

function parseJsonContent(content) {
    if (typeof content !== 'string') throw new Error('AI response content is missing');
    const normalized = content
        .trim()
        .replace(/^\`\`\`(?:json)?\s*/i, '')
        .replace(/\s*\`\`\`$/, '');
    return JSON.parse(normalized);
}

export class AiHttpError extends Error {
    constructor(message, { status, retryAfterMs = null } = {}) {
        super(message);
        this.name = 'AiHttpError';
        this.status = status;
        this.retryAfterMs = retryAfterMs;
    }
}

function parseRetryAfterMs(value, now = Date.now()) {
    if (!value) return null;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
    const date = Date.parse(value);
    return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

function sanitizeAiErrorDetail(value) {
    return String(value ?? '')
        .replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi, '[image omitted]')
        .replace(/\b(?:sk|key)-[a-z0-9_-]{8,}\b/gi, '[credential redacted]')
        .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
        .replace(/[\r\n\t]+/g, ' ')
        .slice(0, 500)
        .trim();
}

async function aiHttpError(response, taskName) {
    let detail = '';
    try {
        const text = await response.text();
        const payload = JSON.parse(text);
        const code = sanitizeAiErrorDetail(payload?.error?.code ?? payload?.code);
        const message = sanitizeAiErrorDetail(
            payload?.error?.message ?? payload?.message ?? payload?.error,
        );
        detail = [code, message].filter(Boolean).join(': ');
    } catch {
        detail = '';
    }
    const suffix = detail ? `: ${detail}` : '';
    return new AiHttpError(`${taskName} failed with HTTP ${response.status}${suffix}`, {
        status: response.status,
        retryAfterMs: parseRetryAfterMs(response.headers.get('retry-after')),
    });
}

export async function requestJsonCompletion({
    messages,
    fetchImpl,
    baseUrl,
    apiKey,
    model,
    taskName,
}) {
    if (!baseUrl || !apiKey || !model) {
        throw new Error('NDT_AI_BASE_URL, NDT_AI_API_KEY, and NDT_AI_MODEL are required');
    }
    const origin = new URL(baseUrl);
    if (origin.username || origin.password || !['http:', 'https:'].includes(origin.protocol)) {
        throw new Error('NDT_AI_BASE_URL is invalid');
    }
    const endpoint = new URL(
        origin.pathname.replace(/\/$/, '').endsWith('/v1')
            ? `${origin.pathname.replace(/\/$/, '')}/chat/completions`
            : '/v1/chat/completions',
        origin,
    );
    const response = await fetchImpl(endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            messages,
            response_format: { type: 'json_object' },
            temperature: 0.2,
        }),
    });
    if (!response.ok) throw await aiHttpError(response, taskName);
    const payload = await response.json();
    return parseJsonContent(payload?.choices?.[0]?.message?.content);
}

export async function analyzeAlbumWithAi({
    album,
    catalog,
    namingContext = {},
    fetchImpl = fetch,
    baseUrl = process.env.NDT_AI_BASE_URL,
    apiKey = process.env.NDT_AI_API_KEY,
    model = process.env.NDT_AI_MODEL,
}) {
    const raw = await requestJsonCompletion({
        messages: buildVisionMessages({ album, catalog, namingContext }),
        fetchImpl,
        baseUrl,
        apiKey,
        model,
        taskName: 'AI analysis',
    });
    return parseAiAlbumAnalysis(raw, {
        catalog,
        imageIds: album.images.map((image) => image.id),
    });
}

export async function analyzeGroupingWindowWithAi({
    images,
    fetchImpl = fetch,
    baseUrl = process.env.NDT_AI_BASE_URL,
    apiKey = process.env.NDT_AI_API_KEY,
    model = process.env.NDT_AI_MODEL,
}) {
    const raw = await requestJsonCompletion({
        messages: buildGroupingMessages({ images }),
        fetchImpl,
        baseUrl,
        apiKey,
        model,
        taskName: 'AI grouping',
    });
    return parseAiGrouping(raw, { imageIds: images.map((image) => image.id) });
}
