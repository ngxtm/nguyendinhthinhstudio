import { pathToFileURL } from 'node:url';

const SITE = 'https://ndtstudio.com.vn';

// Exact public assets from the Search Console screenshots, without credentials.
const reportedImages = [
    [
        'PRd6ZlEpHIgMi-lnSBdkPDqj9red6pzxKK_GBJytoZo',
        1200,
        '290d5968-5ac1-40f5-afa4-d0814e9fd4ac/48512396-1029-47b0-8c84-98cc7e5d9114-NDT_8871.webp',
    ],
    [
        'jatreIi02hLO1RPq3iM6JpLTWTdM5l-53aVadZdAkE0',
        2560,
        '20e98dbf-9aae-4aae-8eab-19f4ced2f5dc/025d832c-0598-42d9-b2ec-68751b08f490-han3781.webp',
    ],
    [
        '9soArmTCsNCcPEL9SWemp8pn_fI-AVOPcZcM6YEdHu8',
        2560,
        '3ebbe539-3f99-41bd-8b70-27ca6f3ed961/6340e851-012d-4862-9e5e-cbe21f596eec-thao5351.webp',
    ],
    [
        'wdJGPfzO783tsxOXYzA6zaik4Y_cKcsp4-UQtfS3MBw',
        1200,
        '144ab654-091b-45cb-9945-337ec79f6990/9264d0cd-83c1-4dd0-8bb4-02605f31b455-linh0950.webp',
    ],
];

export function reportedSearchCases() {
    const pages = [
        '/',
        '/bang-gia',
        '/thu-vien',
        '/thu-vien?page=2',
        '/thu-vien/danh-muc/thoi-trang?page=2',
        '/thu-vien/danh-muc/cong-chua',
        '/thu-vien/danh-muc/birthday?page=4',
        '/thu-vien/danh-muc/birthday?page=5',
    ].map((path) => ({ url: `${SITE}${path}`, kind: 'page', status: 200 }));
    const redirects = [
        ['/&', '/'],
        ['/%26', '/'],
        ['/og', '/share_home_v3.jpg'],
        ['/share_home_v2.jpg', '/share_home_v3.jpg'],
        ['/dieu-khoan-dich-vu', '/gioi-thieu/chinh-sach'],
        ['/thu-vien/wedding', '/thu-vien/danh-muc/wedding'],
        ['/showroom', '/lien-he'],
        ['/thu-vien/gia-dinh', '/thu-vien/danh-muc/gia-dinh'],
        ['/thu-vien/nu/cong-chua', '/thu-vien/danh-muc/cong-chua'],
    ].map(([path, destination]) => ({
        url: `${SITE}${path}`,
        kind: 'redirect',
        status: 301,
        destination: `${SITE}${destination}`,
    }));
    return [
        ...pages,
        ...redirects,
        { url: 'http://ndtstudio.com.vn/', kind: 'redirect', status: 301, destination: `${SITE}/` },
        { url: `${SITE}/share_home_v3.jpg`, kind: 'image', status: 200 },
        { url: 'https://api.ndtstudio.com.vn/', kind: 'api', status: 404, noindex: true },
        ...reportedImages.map(([signature, size, key]) => ({
            url: `https://img.ndtstudio.com.vn/${signature}/rs:fit:${size}:${size}/q:80/f:webp/${Buffer.from(`s3://ndt-studio-images-prod/albums/${key}`).toString('base64url')}`,
            kind: 'image',
            status: 200,
        })),
    ];
}

function decodeEntities(value) {
    return value.replace(
        /&(amp|quot|apos|lt|gt);/g,
        (_, entity) => ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' })[entity],
    );
}

function attribute(tag, name) {
    return decodeEntities(
        new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1] ?? '',
    );
}

export async function checkSearchUrl(entry, fetchImpl = fetch) {
    const issues = [];
    let status;
    try {
        const response = await fetchImpl(entry.url, {
            redirect: 'manual',
            signal: AbortSignal.timeout(20_000),
        });
        status = response.status;
        if (status !== entry.status) issues.push(`HTTP ${status}; expected ${entry.status}`);
        const robots = response.headers.get('x-robots-tag') ?? '';
        if (entry.noindex && !/\bnoindex\b/i.test(robots))
            issues.push('Missing X-Robots-Tag: noindex');
        if (entry.kind === 'redirect') {
            const location = response.headers.get('location');
            if (!location || new URL(location, entry.url).href !== entry.destination)
                issues.push('Incorrect redirect destination');
        } else if (entry.kind === 'image') {
            if (!/^image\//i.test(response.headers.get('content-type') ?? ''))
                issues.push('Expected an image MIME type');
        } else if (entry.kind === 'page') {
            if (!/^text\/html\b/i.test(response.headers.get('content-type') ?? ''))
                issues.push('Expected HTML');
            const html = await response.text();
            const canonicals = [...html.matchAll(/<link\b[^>]*>/gi)]
                .map((match) => match[0])
                .filter((tag) => attribute(tag, 'rel').toLowerCase() === 'canonical');
            if (
                canonicals.length !== 1 ||
                new URL(attribute(canonicals[0], 'href')).href !== new URL(entry.url).href
            )
                issues.push('Missing or incorrect self-canonical');
            if (
                /\bnoindex\b/i.test(robots) ||
                [...html.matchAll(/<meta\b[^>]*>/gi)].some(
                    ([tag]) =>
                        /^(robots|googlebot)$/i.test(attribute(tag, 'name')) &&
                        /\bnoindex\b/i.test(attribute(tag, 'content')),
                )
            ) {
                issues.push('Public page is noindex');
            }
            if (/<a\b[^>]*\bhref\s*=\s*["']\/(?:&|%26)(?:["'?])/i.test(html))
                issues.push('HTML still links to the malformed homepage URL');
        }
        if (!response.bodyUsed) await response.body?.cancel();
    } catch (error) {
        issues.push(`Request failed (${error.name})`);
    }
    return { url: entry.url, status, issues };
}

export async function runSearchIndexingAudit({
    includeSitemap = true,
    fetchImpl = fetch,
    onResult = () => {},
} = {}) {
    const entries = reportedSearchCases();
    const results = [];
    if (includeSitemap) {
        const sitemapUrl = `${SITE}/sitemap.xml`;
        try {
            const response = await fetchImpl(sitemapUrl, {
                redirect: 'manual',
                signal: AbortSignal.timeout(20_000),
            });
            const xml = await response.text();
            if (response.status !== 200 || !/<urlset\b/.test(xml))
                throw new Error('Invalid sitemap');
            const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) =>
                decodeEntities(url),
            );
            if (!urls.length) throw new Error('Empty sitemap');
            const seen = new Set(entries.map((entry) => entry.url));
            for (const url of urls) {
                const parsed = new URL(url);
                if (parsed.origin !== SITE || /^\/(admin|api|private)(\/|$)/.test(parsed.pathname))
                    throw new Error('Non-public sitemap URL');
                if (!seen.has(url)) entries.push({ url, kind: 'page', status: 200 });
                seen.add(url);
            }
        } catch (error) {
            const result = { url: sitemapUrl, issues: [`Sitemap check failed (${error.name})`] };
            results.push(result);
            onResult(result);
        }
    }
    // Bound requests so a verification run does not burst against the public API.
    let index = 0;
    await Promise.all(
        Array.from({ length: 3 }, async () => {
            while (index < entries.length) {
                const result = await checkSearchUrl(entries[index++], fetchImpl);
                results.push(result);
                onResult(result);
            }
        }),
    );
    return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    let completed = 0;
    const results = await runSearchIndexingAudit({
        includeSitemap: !process.argv.includes('--reported-only'),
        onResult(result) {
            completed++;
            if (result.issues.length)
                console.error(`FAIL ${result.url}: ${result.issues.join('; ')}`);
            else if (completed % 25 === 0) console.log(`Checked ${completed} URLs`);
        },
    });
    const failed = results.filter((result) => result.issues.length).length;
    console.log(
        `Search indexing audit: ${results.length - failed}/${results.length} passed; ${failed} failed`,
    );
    process.exitCode = failed ? 1 : 0;
}
