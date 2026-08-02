function requiresMissingExifReview(album) {
    return (
        !album?.shootDate ||
        album.needsReview?.includes('missing_exif_date') ||
        (album.images ?? []).some((image) => !image.capturedAt)
    );
}

function escapeHeading(value) {
    return String(value ?? '')
        .normalize('NFC')
        .replace(/([\\`*_{}\[\]<>()#+.!|\-])/g, '\\$1');
}

function inlineCode(value) {
    const text = String(value ?? '').normalize('NFC');
    const longestRun = Math.max(0, ...[...text.matchAll(/`+/g)].map((match) => match[0].length));
    const fence = '`'.repeat(longestRun + 1);
    const padding = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
    return `${fence}${padding}${text}${padding}${fence}`;
}

export function findMissingExifAlbums(manifest) {
    return (manifest?.albums ?? []).filter(requiresMissingExifReview);
}

export function renderMissingExifReport(manifest) {
    const albums = findMissingExifAlbums(manifest);
    const imageCount = albums.reduce((sum, album) => sum + (album.images?.length ?? 0), 0);
    const lines = [
        '# Missing-EXIF album review',
        '',
        `Albums: ${albums.length}`,
        '',
        `Images: ${imageCount}`,
        '',
        'Fill each `Chosen shoot date` field with an ISO date (`YYYY-MM-DD`) before updating the manifest.',
        '',
    ];
    for (const [index, album] of albums.entries()) {
        lines.push(
            `## ${index + 1}. ${escapeHeading(album.title)}`,
            '',
            `- Slug: ${inlineCode(album.slug)}`,
            `- Images: ${album.images?.length ?? 0}`,
            `- Cover: ${inlineCode(album.coverFile)}`,
            '- Chosen shoot date: `YYYY-MM-DD`',
            '',
            '### Source images',
            '',
        );
        for (const image of album.images ?? []) {
            lines.push(`- ${inlineCode(image.relativePath)}`);
        }
        lines.push('');
    }
    return `${lines.join('\n').trimEnd()}\n`;
}
