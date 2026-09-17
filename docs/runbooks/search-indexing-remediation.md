# Search indexing remediation rollout

> Historical rollout for `.site`. For the current `.com.vn` domain migration,
> follow [the domain migration checklist](domain-migration-com-vn.md).
> Do not apply the old canonical-host rules below unchanged to the new zone.

This runbook deploys the canonical URL, public gallery category, metadata, sitemap,
and API indexing changes. It also records the two required Cloudflare changes and
the Search Console follow-up. It does not authorize a production deployment,
database migration, Cloudflare change, or Search Console action by itself.

Canonical public origin: `https://ndtstudio.site`.

## Safety and prerequisites

- Use the reviewed release revision for the frontend, backend, and one-shot
  migration container.
- Rehearse the release against staging first and confirm the category migration,
  public navigation, redirects, and response headers there.
- Confirm the production database backup/PITR state before deployment.
- Keep Dokploy **Advanced → Run Command** empty. The existing
  `backend-migrate` service is the only production migration runner.
- Do not run `prisma migrate dev`, `prisma db push`, or edit an applied migration.
- Save timestamps and sanitized command output for the release evidence. Never
  save cookies, authorization headers, database URLs, or Cloudflare credentials.

Stop if a migration fails, a redirect loops, a canonical page returns non-200,
the API loses its `X-Robots-Tag`, or the sitemap includes a redirect/404/noindex
URL.

## 1. Cloudflare settings

### Disable Email Address Obfuscation

For the `ndtstudio.site` zone, open **Security → Settings** (or **Scrape
Shield** in the alternate dashboard view), locate **Email Address
Obfuscation**, and switch it **Off**. Cloudflare documents both dashboard paths
in its [Email Address Obfuscation guide](https://developers.cloudflare.com/waf/tools/scrape-shield/email-address-obfuscation/).

After the setting propagates, the public HTML must retain normal `mailto:`
links and must not contain `/cdn-cgi/l/email-protection` or
`email-decode.min.js`.

### Normalize HTTP and `www` in one edge hop

In **Rules → Redirect Rules → Single Redirects**, create a rule named
`Canonical HTTPS apex` above older overlapping redirect rules:

```text
Match expression:
(http.host eq "www.ndtstudio.site") or
(http.host eq "ndtstudio.site" and not ssl)

Dynamic target expression:
concat("https://ndtstudio.site", http.request.uri.path)

Status code: 301
Preserve query string: Enabled
```

The rule deliberately matches only the public apex and `www` hosts; it must not
rewrite `api.ndtstudio.site` or `img.ndtstudio.site`. Cloudflare's
[Single Redirect settings](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/settings/)
support dynamic targets, permanent status codes, and query preservation. Disable
or reorder any older Always Use HTTPS, Page Rule, Bulk Redirect, or origin rule
that would create a second host/scheme normalization hop.

Next.js retains a fallback HTTPS `www` redirect and explicit legacy path
redirects. The edge rule remains the production authority for public host/scheme
normalization.

## 2. Deploy and verify the Prisma migration

Deploy the reviewed Compose revision normally. Require the one-shot
`backend-migrate` service to exit `0` before the backend starts. The migration
`20260728000100_add_gallery_category_navigation` adds
`Category.showInNavigation`, `Category.navigationOrder`, and the former public
taxonomy. It is additive and does not guess album assignments.

On the VPS:

```sh
MID=$(docker ps -aq --filter 'name=backend-migrate' | head -n 1)
test -n "$MID"
docker logs "$MID"
test "$(docker inspect -f '{{.State.ExitCode}}' "$MID")" = "0"

PROJECT=$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$MID")
BID=$(docker ps -q \
  --filter "label=com.docker.compose.project=$PROJECT" \
  --filter 'label=com.docker.compose.service=backend' | head -n 1)
test -n "$BID"
test "$(docker inspect -f '{{.State.Health.Status}}' "$BID")" = "healthy"
```

Follow [the production Prisma migration runbook](../deployment/prisma-migrations.md)
if the migration container does not exit cleanly. Do not automatically resolve a
failed migration.

## 3. Assign and publish gallery categories

Sign in to `/admin` with an administrator account.

1. Open **Quản lý thư viện → Categories**.
2. Confirm each imported category has the intended parent, **Hiện trên menu thư
   viện** value, and order.
3. Open each published album and assign it to the most specific applicable
   category. A child assignment is included automatically when visitors browse
   its parent category.
4. Confirm only intentional categories are navigation-enabled.

A navigation-enabled category still remains absent from the public menu and
sitemap until it has at least one published, active album. An existing empty
category is intentionally `200` with `noindex, follow`; an unknown category must
return a real `404`. Allow up to 60 seconds for cached public navigation and the
sitemap to refresh after an Admin change.

## 4. Production smoke checks

Run these checks from outside Cloudflare/origin infrastructure so they exercise
the public edge. Inspect every `Location` value and response body; do not rely on
`curl -L` alone because it hides intermediate hops.

```powershell
# Host and scheme normalization: exactly one 301, preserving path/query.
curl.exe -sS -D - -o NUL "http://ndtstudio.site/bang-gia?source=seo-smoke"
curl.exe -sS -D - -o NUL "https://www.ndtstudio.site/bang-gia?source=seo-smoke"

# One explicit legacy mapping, then its canonical 200 target.
curl.exe -sS -D - -o NUL "https://ndtstudio.site/thu-vien/nu"
curl.exe -sS -D - -o NUL "https://ndtstudio.site/thu-vien/danh-muc/nu"

# Public canonical metadata and server-rendered gallery links.
$home = curl.exe -fsS "https://ndtstudio.site/"
$gallery = curl.exe -fsS "https://ndtstudio.site/thu-vien"
$home | Select-String -SimpleMatch 'rel="canonical"'
$gallery | Select-String -Pattern 'rel="canonical"|/thu-vien/'

# Cloudflare must no longer rewrite email links.
$contact = curl.exe -fsS "https://ndtstudio.site/lien-he"
if ($contact -match '/cdn-cgi/l/email-protection|email-decode\.min\.js') {
  throw 'Cloudflare Email Address Obfuscation is still active'
}

# Admin is intentionally non-indexable.
$admin = curl.exe -fsS "https://ndtstudio.site/admin/login"
$admin | Select-String -Pattern 'noindex.*nofollow'

# API is entirely non-indexable; root is 404 and health remains 200.
curl.exe -sS -D - -o NUL "https://api.ndtstudio.site/"
curl.exe -sS -D - -o NUL "https://api.ndtstudio.site/health"
curl.exe -fsS "https://api.ndtstudio.site/robots.txt"

# Sitemap and robots are public and use only the apex origin.
curl.exe -fsS "https://ndtstudio.site/robots.txt"
$sitemap = curl.exe -fsS "https://ndtstudio.site/sitemap.xml"
if ($sitemap -match 'https://www\.ndtstudio\.site|/admin|api\.ndtstudio\.site') {
  throw 'Sitemap contains a non-canonical or excluded URL'
}
```

Expected results:

- host/scheme requests return one `301` whose `Location` is the same path/query
  on `https://ndtstudio.site`;
- known legacy paths return `301` directly to their mapped category/landing URL;
- canonical public pages return `200` and a self-referencing apex canonical;
- occupied categories are indexable, empty categories are `noindex, follow`, and
  unknown album/category slugs return `404`;
- API `/` returns `404`, `/health` returns `200`, `/robots.txt` contains
  `Disallow: /`, and all three responses include
  `X-Robots-Tag: noindex, nofollow`;
- Admin HTML contains `noindex, nofollow`;
- the sitemap contains only canonical, indexable public URLs.

Also inspect a retired `/_next/static/media/...` URL from the original report.
It should remain `404`; do not restore an obsolete build hash.

## 5. Search Console follow-up

Only start this section after the release and smoke evidence are accepted.

1. In the `https://ndtstudio.site` property, submit or refresh
   `https://ndtstudio.site/sitemap.xml` and require a successful fetch. Google
   documents this workflow in the [Sitemaps report guide](https://support.google.com/webmasters/answer/7451001?hl=en).
2. Use URL Inspection → **Test live URL** for representative canonical pages:
   `/`, `/thu-vien`, one occupied category, one published album, `/bang-gia`,
   and `/lien-he`. Confirm Google can fetch the live page and the declared
   canonical is the same apex URL.
3. Use **Request indexing** only for canonical pages that should be indexed.
   Do not request indexing for redirects, Admin/API URLs, empty categories,
   missing URLs, or retired assets. The [URL Inspection guide](https://support.google.com/webmasters/answer/9012289?hl=en)
   explains that live availability and an indexing request do not guarantee
   selection in search results.
4. In **Page indexing**, open each previously reported website-generated issue
   and run **Validate fix** only where the URL should now be a canonical,
   indexable `200` or where a redirect error/chain was actually corrected.
5. Record correct `301`, intentional `noindex`, and genuine `404` examples as
   expected exclusions. Do not treat their continued appearance during Google's
   recrawl window as a failed deployment. Google's
   [Page indexing guide](https://support.google.com/webmasters/answer/7440203?hl=en)
   explicitly distinguishes legitimate exclusions from indexing errors.

Record the inspection timestamp, live fetch result, submitted sitemap status,
and validation request identifier without copying private account data.

## Rollback

- If the edge redirect loops or changes the path/query, disable only the new
  `Canonical HTTPS apex` rule and re-run the direct application checks.
- If the application fails, redeploy the previous application revision. The
  database change is additive and should remain in place; Prisma has no automatic
  down migration.
- If category navigation is wrong, disable **Hiện trên menu thư viện** for the
  affected rows or correct album/category assignments. Do not delete taxonomy
  rows as an emergency rollback.
- Re-enabling Email Address Obfuscation would restore the crawlable
  `/cdn-cgi/l/email-protection` behavior and is not part of the normal rollback.
