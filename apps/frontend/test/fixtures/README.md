# Local SEO API fixture

`seo-api.ts` is a test-only, dependency-free public API fixture. It binds only to `127.0.0.1`, does not read a database or credentials, and does not start when imported by tests.

From the repository root:

```powershell
node --import tsx apps/frontend/test/fixtures/seo-api.ts --port 3100
```

Optional fixture-only TLS uses the controller-generated local key/certificate paths:

```powershell
node --import tsx apps/frontend/test/fixtures/seo-api.ts --port 3100 --tls-key <path-to-key.pem> --tls-cert <path-to-cert.pem>
```

The equivalent environment variables are `SEO_FIXTURE_PORT`, `SEO_FIXTURE_TLS_KEY`, and `SEO_FIXTURE_TLS_CERT`. TLS requires both paths. The controller owns trust configuration (`NODE_EXTRA_CA_CERTS` for its process and explicit local trust in Playwright); the fixture never disables TLS verification or installs certificates.

Normal browser data is deterministic: 17 published albums, numbered and cursor pages of eight, one indexable `wedding` category with eight distinguishable album IDs, four-image detail batches, and SVG images with intrinsic `640x480` dimensions.

Local failure modes are toggled one at a time with `GET /_fixture/control?mode=...` and reset with `GET /_fixture/control?mode=reset`:

- `primary404`, `primary500`
- `related500`
- `image404`, `image500`
- `sitemapSecondPageFailure` (expands only `limit=50` catalog requests beyond one page, then fails the cursor request)

The browser spec requires `SEO_BROWSER_FIXTURE_READY=1` and a loopback `FRONTEND_BASE_URL`; without both prerequisites it reports skipped tests. Focused fixture tests run with:

```powershell
node --import tsx --test --test-concurrency=1 apps/frontend/test/seo-api.fixture.test.ts
```
