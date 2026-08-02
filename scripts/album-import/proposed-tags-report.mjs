function normalize(value) {
    return String(value ?? '')
        .normalize('NFD')
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function publishedSearchText(album) {
    const values = [album.title, album.slug];
    for (const category of album.categories ?? []) values.push(category.name, category.slug);
    for (const entry of album.tags ?? []) {
        const tag = entry?.tag ?? entry;
        values.push(tag?.name, tag?.slug);
    }
    return normalize(values.filter(Boolean).join(' '));
}

export function collectProposedTagReview(manifest, publishedAlbums = []) {
    const proposals = new Map();
    for (const entry of manifest?.tagBackfill ?? []) {
        const slug = entry?.tag?.slug?.trim();
        if (!slug) continue;
        proposals.set(slug, {
            name: entry.tag.name?.trim() || slug,
            slug,
            requestingAlbumSlugs: [],
            matchingPublishedAlbums: [],
        });
    }
    for (const album of manifest?.albums ?? []) {
        for (const reason of album.needsReview ?? []) {
            if (!reason.startsWith('proposed_tag:')) continue;
            const slug = reason.slice('proposed_tag:'.length).trim();
            if (!slug) continue;
            const proposal = proposals.get(slug) ?? {
                name: slug,
                slug,
                requestingAlbumSlugs: [],
                matchingPublishedAlbums: [],
            };
            if (!proposal.requestingAlbumSlugs.includes(album.slug)) {
                proposal.requestingAlbumSlugs.push(album.slug);
            }
            proposals.set(slug, proposal);
        }
    }
    for (const proposal of proposals.values()) {
        const needles = [normalize(proposal.name), normalize(proposal.slug)].filter(Boolean);
        proposal.matchingPublishedAlbums = publishedAlbums
            .filter((album) => {
                const haystack = publishedSearchText(album);
                return needles.some((needle) => haystack.includes(needle));
            })
            .map((album) => album.title);
    }
    return [...proposals.values()];
}

function escapeHeading(value) {
    return String(value ?? '').replace(/([\\`*_{}\[\]<>()#+.!|\-])/g, '\\$1');
}

export function renderProposedTagsReport(manifest, publishedAlbums = []) {
    const entries = collectProposedTagReview(manifest, publishedAlbums);
    const lines = [
        '# Rejected proposed tags review',
        '',
        `Proposals: ${entries.length}`,
        '',
        'These proposals were preserved for review but are not approved for creation or production backfill.',
        '',
    ];
    for (const [index, entry] of entries.entries()) {
        lines.push(
            `## ${index + 1}. ${escapeHeading(entry.name)}`,
            '',
            `- Slug: \`${entry.slug}\``,
            '- Requesting import albums:',
            ...(entry.requestingAlbumSlugs.length
                ? entry.requestingAlbumSlugs.map((slug) => `  - \`${slug}\``)
                : ['  - None found']),
            '- Matching published albums:',
            ...(entry.matchingPublishedAlbums.length
                ? entry.matchingPublishedAlbums.map((title) => `  - ${escapeHeading(title)}`)
                : ['  - None found']),
            '',
        );
    }
    return `${lines.join('\n').trimEnd()}\n`;
}
