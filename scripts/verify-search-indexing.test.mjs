import assert from 'node:assert/strict';
import test from 'node:test';
import { checkSearchUrl, runSearchIndexingAudit } from './verify-search-indexing.mjs';

const url = 'https://ndtstudio.com.vn/bang-gia';
const page = { url, kind: 'page', status: 200 };
const html = '<link href="https://ndtstudio.com.vn/bang-gia" rel="canonical"><main>Bảng giá</main>';
const respond =
    (body, status = 200, headers = { 'Content-Type': 'text/html' }) =>
    async (_url, options) => {
        assert.equal(options.redirect, 'manual');
        return new Response(body, { status, headers });
    };

test('audit accepts a public self-canonical page and rejects an HTTP 404', async () => {
    assert.deepEqual((await checkSearchUrl(page, respond(html))).issues, []);
    assert.ok(
        (await checkSearchUrl(page, respond(html, 404))).issues.includes('HTTP 404; expected 200'),
    );
    const homepage = { ...page, url: 'https://ndtstudio.com.vn/' };
    assert.deepEqual(
        (
            await checkSearchUrl(
                homepage,
                respond('<link rel="canonical" href="https://ndtstudio.com.vn">'),
            )
        ).issues,
        [],
    );
});

test('audit rejects wrong canonicals, noindex and malformed emitted links', async () => {
    for (const body of [
        html.replace('/bang-gia', '/'),
        html + '<meta name="googlebot" content="noindex">',
        html + '<a href="/&">Link</a>',
    ]) {
        assert.ok((await checkSearchUrl(page, respond(body))).issues.length);
    }
    assert.ok(
        (
            await checkSearchUrl(
                page,
                respond(html, 200, { 'Content-Type': 'text/html', 'X-Robots-Tag': 'noindex' }),
            )
        ).issues.length,
    );
});

test('audit checks redirect targets without following a broken chain', async () => {
    const entry = {
        url,
        kind: 'redirect',
        status: 301,
        destination: 'https://ndtstudio.com.vn/lien-he',
    };
    assert.deepEqual(
        (await checkSearchUrl(entry, respond('', 301, { Location: '/lien-he' }))).issues,
        [],
    );
    assert.ok(
        (await checkSearchUrl(entry, respond('', 301, { Location: '/showroom' }))).issues.length,
    );
});

test('audit requires actual image responses and intentional API exclusions', async () => {
    assert.ok(
        (await checkSearchUrl({ url, kind: 'image', status: 200 }, respond(html))).issues.length,
    );
    assert.deepEqual(
        (
            await checkSearchUrl(
                { url, kind: 'api', status: 404, noindex: true },
                respond('{}', 404, { 'X-Robots-Tag': 'noindex, nofollow' }),
            )
        ).issues,
        [],
    );
});

test('a failed or empty sitemap fails the audit instead of silently passing', async () => {
    const results = await runSearchIndexingAudit({ fetchImpl: respond('<urlset></urlset>') });
    assert.ok(
        results.some((result) => result.url.endsWith('/sitemap.xml') && result.issues.length),
    );
});
