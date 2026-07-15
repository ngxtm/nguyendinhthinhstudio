# Admin Supabase RBAC Design

**Date:** 2026-07-15  
**Status:** Approved  
**Scope:** Authenticate and authorize the existing `/admin` area now while keeping the design portable to `admin.ndtstudio.site`.

## Context

The backend image mutation endpoints are protected by `JwtAuthGuard` and `@Roles('admin')`. The frontend API client currently looks for a manually stored `auth_token`, but the application has no complete login, refresh, logout, or role-assignment flow. Consequently, `POST /images/upload-url` returns `401 Unauthorized` before any R2 or imgproxy operation occurs.

The project will soon have multiple administrators with identical privileges. Authentication must therefore support multiple accounts without email allowlists or manually copied tokens.

## Goals

- Authenticate administrators with Supabase email and password.
- Use Supabase access JWTs as Bearer tokens for calls to the NestJS API.
- Store administrator membership in a server-controlled RBAC table.
- Add a Custom Access Token Hook that emits an application role claim.
- Preserve the existing `@Roles('admin')` controller contract.
- Protect all admin mutations at the API boundary, not only in the UI.
- Require an explicit authorization classification and response-data contract for every API route, including reads.
- Keep the design portable from `/admin` to `admin.ndtstudio.site`.
- Provide safe bootstrap, grant, revoke, refresh, and logout procedures.

## Non-goals

- Fine-grained permissions or different administrator levels.
- Owner, editor, or viewer roles.
- Public self-registration.
- A custom password or session implementation.
- A server-side session store or Next.js BFF.
- Cloudflare Access integration in this phase.
- Moving the admin UI to its future subdomain in this phase.

## Selected approach

Use Supabase Auth for email/password authentication, a minimal database-backed RBAC model for authorization, and a Supabase Custom Access Token Hook to add `user_role: "admin"` to access JWTs.

The browser uses the official Supabase client to manage the access/refresh-token lifecycle. For each protected API request, the frontend obtains the current access token and sends:

```http
Authorization: Bearer <supabase-access-token>
```

The backend verifies the JWT against Supabase's asymmetric JSON Web Key Set (JWKS) and reads only the application claim `user_role`. It must not treat Supabase's standard `role: "authenticated"` claim as the application administrator role. Legacy shared-secret verification is not part of the steady-state production design; it may exist only in the explicitly enabled, time-limited migration mode described below.

## Architecture

```text
/admin/login
    |
    | email + password
    v
Supabase Auth
    |
    | signed access JWT + managed refresh token
    v
Supabase browser client
    |
    | Authorization: Bearer <JWT>
    v
NestJS JwtStrategy
    |
    | verified user with role from user_role
    v
RolesGuard -> @Roles('admin') -> admin mutation
```

Authorization data flow:

```text
auth.users.id
    |
    v
public.user_roles(user_id, role)
    |
    v
Custom Access Token Hook
    |
    v
JWT claim: user_role = "admin"
```

Authentication answers who the user is. The `user_roles` table and signed `user_role` claim answer whether that authenticated user is an administrator.

## Data model

Create an application role enum and a one-role-per-user table:

```sql
create type public.app_role as enum ('admin');

create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null
);
```

The primary key guarantees that a user has at most one role. All administrators currently have identical privileges, so a join table supporting multiple roles per user is unnecessary.

### Access control

- Enable RLS on `public.user_roles`.
- Browser clients receive no select, insert, update, or delete policy.
- Users must not be able to read, assign, or modify their own role directly.
- Create a dedicated `auth_hooks` schema and a dedicated non-login hook-owner role. The hook owner receives `usage, create` only on `auth_hooks`, not `create` on `public`.
- Grant the hook-owner role `usage` on schema `public`, `usage` on `public.app_role`, and `select` on `public.user_roles`, with a narrow RLS `select` policy that applies only to that role; do not grant table mutation privileges.
- The token hook receives only the minimum read permission required to resolve the current user's role.
- Define the hook as `auth_hooks.custom_access_token_hook(jsonb)`. It is owned by the dedicated hook-owner role, uses `security definer` only for the role lookup, sets an empty `search_path`, and fully qualifies every referenced database object.
- Revoke all privileges on schema `auth_hooks` and hook-function execution from `public`, `anon`, and `authenticated`; revoke direct `user_roles` table privileges from those roles as well.
- Grant `supabase_auth_admin` `usage` on schema `auth_hooks` and `execute` on `auth_hooks.custom_access_token_hook(jsonb)`. Do not grant `supabase_auth_admin` direct table access or schema `create`.
- The hook preserves all required input claims and changes only the application-owned `user_role` claim.
- Role grants and revocations run through an operator-only mechanism using trusted database access or a service-role credential. The workflow must authenticate an individual operator and emit the role audit event described below; possession of a shared service-role credential alone is not an attributable operator identity.
- Routine grants and revocations through an unattributed shared SQL session are prohibited. A break-glass database-console change requires a recorded operator identity and incident/change reference in the audit event.
- Service-role credentials never enter the frontend bundle, browser storage, logs, or committed files.

## JWT contract

The Custom Access Token Hook looks up the authenticating user's row and adds this claim only when the row exists:

```json
{
  "user_role": "admin"
}
```

If no row exists, the hook must omit `user_role`; it must never infer admin access from email domain, `user_metadata`, or the standard Supabase `role` claim.

The backend payload contract includes:

```ts
interface JwtPayload {
  sub: string;
  email?: string;
  user_role?: 'admin';
  iss: string;
  aud: string | string[];
  exp: number;
}
```

Production verification uses these values:

```text
issuer   = <SUPABASE_URL>/auth/v1
jwksUri  = <SUPABASE_URL>/auth/v1/.well-known/jwks.json
audience = authenticated
```

Before rollout, inspect the signing algorithm enabled by the Supabase project and configure an exact algorithm allowlist for that project. The JWKS URL is derived from and pinned to the configured Supabase project URL; token headers or claims can never select or redirect it. An unknown key, unavailable uncached key, or verification error must fail closed.

The JWKS resolver owns a bounded in-process key cache with a configured maximum entry count and TTL constrained by the upstream HTTP cache metadata. A cache miss for a previously unseen `kid` may trigger at most one JWKS refresh for that token. Concurrent misses join one single-flight refresh, and unknown-key refreshes are rate-limited globally so attacker-controlled `kid` values cannot create unbounded outbound traffic. Unknown `kid` values enter a short, bounded negative cache; expiry permits later recovery after legitimate key rotation without retaining attacker-controlled identifiers indefinitely.

JWKS network access uses explicit connection and response/read timeouts, follows no redirects away from the pinned origin, and rejects responses above a small configured size limit before parsing. A timeout, rate-limit decision, oversized or malformed response, or unresolved key returns `401`; cached valid keys continue to work until their configured usable lifetime ends. Resolver metrics record cache hits, refresh attempts, refresh suppression, unknown-key results, and fetch failures without recording tokens or complete JWT headers.

The backend supports two explicit verification modes:

- `asymmetric`: the steady state. Accept only the configured asymmetric algorithm and keys resolved from JWKS. Legacy shared-secret configuration is rejected.
- `migration`: a time-limited cutover mode used only when the project currently signs with `HS256`. It contains two independent validators: one accepts only `HS256` with the legacy secret, and the other accepts only the configured asymmetric algorithm with JWKS. The JWT header selects a validator only after its algorithm is matched against that validator's exact allowlist; neither validator may use the other key type, and verification failure never falls through to the other validator.

Migration mode must have an operator-recorded removal deadline. After Supabase activates asymmetric signing and the maximum lifetime of previously issued `HS256` tokens has elapsed, deploy `asymmetric` mode and remove the legacy secret from application configuration, deployment manifests, and secret storage.

The backend must fail during startup when the selected mode's required Supabase URL, issuer, audience, JWKS URI, algorithm allowlist, or temporary migration secret is missing or invalid. It must never use a built-in development secret or silently change verification modes.

After successful signature, algorithm, issuer, audience, expiry, and subject validation, `JwtStrategy` maps only `user_role` to the request user's application role. `sub` must be a valid UUID. A missing `user_role` remains undefined rather than being replaced with a default application role. `RolesGuard` continues to compare that role with `@Roles('admin')`.

## Public and administrator read contracts

Authentication guards are not sufficient when one service method serves both public and administrative reads. Public and administrative queries must be separate code paths with separate response DTOs.

Public read contracts:

- `GET /albums` always applies `status = 'published'` and active deletion state in the service query. An absent status or `status=published` is accepted; `status=all`, `draft`, `scheduled`, or any other status returns `400` and never weakens the database predicate.
- `GET /albums/:slug` returns an album only when its status is `published` and deletion state is active; an unpublished, deleting, deleted, or unknown slug returns `404`.
- `GET /images/album/:albumId` returns completed images only when the parent album is published and active; an unpublished, deleting, deleted, or unknown album returns `404`.
- Related-album and tag-feed queries continue to enforce published and active parent-album predicates in their database queries.
- `PublicAlbumSummaryDto` is allowlisted to public identity/content fields: id, title, slug, description, shoot date, published/featured presentation fields, public cover image, public tags/categories, image count, view count, and publication timestamp.
- `PublicAlbumDetailDto` extends the public summary with public image renditions and public SEO title/description.
- `PublicImageDto` contains only public image identity, filename/alt text, rendition URLs, display order, and dimensions. It excludes album ownership internals, object keys, upload state, presign data, provider metadata, and deletion state.
- Public DTOs never expose `googleDriveLink`, scheduling/deletion state, private upload metadata, internal object identifiers, or other operator-only fields.
- The public detail endpoint owns view-count behavior. Remove the caller-controlled `skipViewIncrement` query parameter from the public contract.

Protected administrator read contracts:

- Add `GET /admin/albums` and `GET /admin/albums/:id` as protected admin list/detail endpoints backed by admin-specific service methods and DTOs. They may query draft, scheduled, and published albums, include management fields required by the admin UI, and do not increment public view counts.
- `GET /albums/dashboard/stats`, `GET /categories/:id/usage`, and `GET /tags/:id/usage` are admin-only reads protected by `JwtAuthGuard`, `RolesGuard`, and `@Roles('admin')`.
- Admin-only reads use `adminApiClient`; public reads use `publicApiClient`. A public endpoint must never switch to an admin query or response projection based on caller-controlled query parameters.

## Frontend session design

### Supabase client

Create one browser client configured from public Supabase URL and anon/publishable key environment variables. These values identify the Supabase project and are allowed in the browser; the service-role key is not.

The Supabase client owns session persistence, token refresh, and logout. Remove the custom `localStorage.getItem('auth_token')` contract. Application code must not maintain a second token copy.

### Login

`/admin/login` is the only public admin route. It accepts email and password and calls Supabase password sign-in. After authentication:

1. Obtain the fresh session.
2. Confirm the access JWT represents an admin.
3. Navigate to the intended safe admin path or `/admin`.
4. Show a generic login failure without revealing whether an account exists.

Public registration is not exposed.

### Admin route protection

Use Next.js route groups so the public login page cannot be redirected by or rendered inside the protected admin shell:

```text
app/admin/layout.tsx                 # Supabase provider only; no auth redirect
app/admin/(auth)/login/page.tsx      # public /admin/login
app/admin/(protected)/layout.tsx     # auth observer, guard, and admin shell
app/admin/(protected)/page.tsx       # protected /admin
app/admin/(protected)/...            # remaining protected admin routes
```

Route-group names do not change public URLs. The protected layout observes Supabase auth state:

- No session: redirect to `/admin/login`.
- Authenticated without admin role: show an access-denied state and allow logout.
- Authenticated admin: render admin content.
- Initial session resolution: render a neutral loading state to prevent protected UI flashing.

The login route must never be wrapped by the protected layout. Any intended-path parameter is accepted only when it is a same-origin `/admin` path other than `/admin/login`; otherwise navigation falls back to `/admin`.

This route protection is user experience only. NestJS guards remain the security boundary.

### Admin browser security headers

Because the Supabase browser client persists session credentials, an XSS in the admin origin could steal an administrator session. Every response under `/admin/:path*`, including `/admin/login`, therefore receives an admin-specific security-header policy.

The admin Content Security Policy is introduced in report-only mode first, with violation reports monitored and required application/Supabase/API origins identified, then switched to enforcement after staging and production observation show no unexplained violations. The enforced policy uses a cryptographically random, fresh per-response nonce generated by Next.js middleware and propagated through the request to framework and application scripts. Admin HTML is dynamically rendered and not stored in shared caches so a nonce is never reused through a cached document. `script-src` is nonce-based, production never includes `'unsafe-eval'`, and inline scripts without the nonce are rejected. The policy also sets `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, and `frame-ancestors 'none'`. `connect-src` is allowlisted to `'self'`, the configured API origin, the configured Supabase project HTTPS origin, and only additional endpoints proven necessary for authentication or telemetry; wildcard origins are not allowed.

Admin responses also set `X-Content-Type-Options: nosniff`, a restrictive `Referrer-Policy`, `X-Frame-Options: DENY` for legacy clickjacking protection consistent with `frame-ancestors 'none'`, and a minimal `Permissions-Policy` that disables browser capabilities the admin UI does not use. Header values are centralized in one admin policy and environment-derived origins are validated at startup/build time. Development may explicitly relax only the directives required by Next.js tooling; those relaxations must not be emitted by a production build.

CSP reports are treated as untrusted telemetry, sampled/rate-limited at their collection boundary, and must not include authorization headers or session values. If enforcement causes a production regression, rollback returns temporarily to the same policy in report-only mode rather than removing the other security headers.

### API client

Split the API layer into one shared HTTP transport and two explicit wrappers:

```text
publicApiClient  -> browser/SSR safe, never imports Supabase, never sends Authorization
adminApiClient   -> browser-only, requires a Supabase session and sends the current Bearer token
```

Public gallery and other intentionally public reads use `publicApiClient`. Admin mutations and admin-only reads use `adminApiClient`. Protected service functions must not accept a caller-controlled flag that can downgrade them to public mode. Calling `adminApiClient` without a browser session fails locally as an authentication error; calling it during server rendering is unsupported and must fail clearly rather than silently issuing an unauthenticated request.

`adminApiClient` is fail-closed about its destination. `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_ADMIN_API_ORIGINS` are required whenever the admin bundle runs in development or production. The API URL must parse as an absolute `http:` or `https:` URL without credentials, query, or fragment, and its origin must exactly match one entry in the explicit comma-separated origin allowlist. Production accepts only `https:` entries, while local development may allow an explicitly listed loopback HTTP origin. Missing, malformed, relative, same-origin-frontend, or unapproved values fail the build or client initialization instead of falling back to `''`, `window.location`, a deployment frontend URL, or `localhost`.

The admin wrapper accepts only relative API paths, resolves them against the validated base URL, and rechecks the final origin before reading the session or attaching `Authorization`. Authenticated requests reject redirects rather than following a response to another origin. The validated base URL is immutable for the lifetime of the bundle; callers cannot override it through request options. `publicApiClient` may retain a separately documented SSR/public resolution strategy, but it never shares an authorization-capable path with `adminApiClient`.

On an `adminApiClient` request returning `401`:

1. Join or create one module-scoped refresh Promise. Concurrent `401` responses must await the same refresh operation.
2. Clear the shared Promise in a `finally` block after refresh completes.
3. Retry each eligible request once with the new token.
4. If refresh fails or a retried request still returns `401`, clear the session once and send the user to login.

Each admin request carries an internal retry marker so it cannot enter the refresh path twice. Automatic retry is allowed only when the request body is replayable, such as JSON, text, or a reusable `FormData` value. Requests backed by a consumed `ReadableStream` are not retried automatically. An aborted request must not trigger refresh or retry. Public `401` responses never trigger Supabase refresh or logout. A `403` is not refreshed automatically because it indicates insufficient authorization, not an expired credential.

### Logout

Logout calls Supabase sign-out, clears in-memory admin state, and navigates to `/admin/login`. No application-maintained token remains to clean up.

## Administrator lifecycle

### Bootstrap first administrator

The first user is created or invited through the Supabase operator interface. A trusted operator then inserts that user's UUID into `public.user_roles` with role `admin`. There is no public bootstrap endpoint.

The user must sign in again or refresh their session after the role is assigned so the JWT contains the new claim.

### Add an administrator

1. Create or invite the Supabase Auth user.
2. Insert the user's `user_roles` row through the operator-only workflow.
3. Have the user sign in or refresh after assignment.
4. Verify an admin-only read or mutation returns success.

### Revoke an administrator

1. Delete the user's `user_roles` row.
2. Revoke or sign out the user's active sessions through the operator workflow.
3. Verify that refresh and subsequent sign-in cannot produce a token containing `user_role`.
4. Verify a newly issued token returns `403` from an admin API, or that the revoked session returns `401`.
5. Verify any access token issued before revocation stops working no later than its configured expiration.

Deleting a role row or revoking a Supabase session does not invalidate an already-issued access JWT at an API that verifies JWTs offline. Revocation in this phase is therefore bounded by the access-token lifetime rather than immediate. Configure a short access-token lifetime, initially 10 minutes, and document it as the maximum authorization-revocation delay. Session revocation prevents use of the refresh token, and every token issued after role removal must omit `user_role`.

Immediate revocation through a database lookup, token denylist, or token-version check is explicitly deferred. It can be introduced later if the bounded delay no longer meets operational requirements.

## Administrative audit trail

Every role grant/revoke and every authenticated request targeting a protected administrator mutation emits one structured audit event for success, authorization denial, or execution failure. The backend derives the authenticated actor from the already verified JWT `sub`; request bodies and query parameters can never supply or override actor identity. Missing or malformed-token traffic remains rate-limited security telemetry rather than creating unbounded audit events. The operator-only role workflow derives its actor from the authenticated operator channel and records a change/incident reference for break-glass operations.

Each event contains an event ID, UTC timestamp, correlation/request ID, actor kind and stable actor ID, action, resource type and resource ID when known, result (`success`, `denied`, or `failed`), and a small allowlisted metadata object sufficient to investigate the change. Role events identify the affected user and whether the role was granted or revoked. Mutation events cover album, image, category, and tag create/update/delete, bulk operations, image presign/confirm state transitions, and other routes classified as admin mutations.

Audit data is append-only from the application's perspective. Browser roles cannot write, update, or delete it, and administrators cannot alter their own audit records through the application. Structured platform logs are acceptable for this phase if they preserve the required schema, retention, access control, searchability, and alerting; a dedicated audit table is deferred until compliance or retention requirements justify it. If a durable table is introduced, role changes and their audit events should commit in one transaction where the execution channel supports it. `user_roles.created_by` remains useful current-state metadata but is not the audit history.

Audit serialization uses an explicit allowlist and never records access or refresh tokens, passwords, authorization/cookie headers, service-role credentials, complete JWT headers or payloads, presigned URLs, raw request/response bodies, or storage-provider secrets. Audit-pipeline errors are observable and rate-limited; error handling must not fall back to logging sensitive payloads.

## Error handling

| Condition | API result | Frontend behavior |
|---|---:|---|
| Missing, malformed, invalid, or expired JWT | 401 | Refresh once; otherwise logout and redirect to login |
| Valid JWT without `user_role=admin` | 403 | Show access denied; do not retry |
| Invalid email/password | Supabase auth error | Show generic login failure |
| Hook cannot resolve a role | Token has no admin claim or issuance fails safely | Deny admin access |
| Supabase temporarily unavailable | Login/refresh failure | Show retryable service error without exposing secrets |

Authorization fails closed: uncertainty never produces admin access.

## Domain migration

Moving from the current admin path to `admin.ndtstudio.site` does not change the JWT or RBAC model. The migration updates only deployment boundaries:

- Add the new origin and redirect URLs to Supabase configuration.
- Add `https://admin.ndtstudio.site` to backend CORS allowlists and keep allowed methods and headers limited to those used by the admin client.
- Configure frontend environment variables and DNS/TLS.
- Ensure API requests continue targeting `https://api.ndtstudio.site`.
- Re-run login, refresh, logout, `401`, `403`, and admin mutation tests from the new origin.

Bearer authorization avoids relying on a cross-subdomain authentication cookie. Supabase session persistence remains scoped to the admin frontend origin. The NestJS API does not use cookies for authentication, so its CORS configuration must omit credential support rather than returning `Access-Control-Allow-Credentials: true`.

## Security considerations

- Never use `user_metadata` for authorization because users can update it.
- Never expose the service-role key to Next.js client code.
- Never log access or refresh tokens, passwords, authorization/cookie headers, service-role credentials, presigned URLs, complete JWTs, or sensitive request/response bodies.
- Emit allowlisted, attributable audit events for role lifecycle operations and every administrator mutation; application users cannot modify audit history.
- Validate JWT signature, expiration, subject, exact issuer, expected audience, and an explicit asymmetric algorithm allowlist.
- Resolve signing keys only from the pinned Supabase JWKS URL using bounded positive and negative caches, single-flight/rate-limited refresh, strict network limits, and fail-closed error handling.
- Treat XSS as a session-compromise path and apply nonce-based, admin-specific CSP plus defense-in-depth browser headers to `/admin/:path*`.
- Never fall back to a development secret or legacy shared-secret verification outside the explicitly enabled migration window.
- Keep CORS restricted to explicit production admin/frontend origins, required methods, and required headers; do not enable credentialed CORS for the Bearer-only API.
- Maintain API authorization even when frontend route guards pass.
- Rate-limit login through Supabase configuration and use strong administrator passwords.
- Require email confirmation according to the chosen invitation workflow.
- Prefer MFA as a later hardening step once the base email/password flow is stable.

## Testing strategy

### Database and hook

- A user with an `admin` row receives `user_role=admin`.
- A user without a row receives no application role claim.
- Browser roles cannot select, insert, update, or delete role rows directly.
- The dedicated hook-owner role can select the authenticating user's role through the hook's RLS path and cannot mutate role rows.
- Under `set role supabase_auth_admin`, the role has `usage` on `auth_hooks` and can execute `auth_hooks.custom_access_token_hook(jsonb)` but cannot create schema objects or query `user_roles` directly.
- Under the dedicated hook-owner role, object creation is limited to `auth_hooks`; required `public` schema/type usage and role lookup succeed while insert, update, and delete on `user_roles` fail.
- The hook resolves the fully qualified table with an empty `search_path`; objects in attacker-influenced schemas cannot shadow its dependencies.
- Duplicate role rows for one user are rejected.
- Deleting an Auth user cascades its role row.
- Grant and revoke workflows require an attributable operator identity and emit immutable events containing the affected user, action, result, timestamp, and correlation/change reference.
- Browser roles and administrators cannot create, update, or delete audit history through application credentials.

### Backend

- Missing token returns `401`.
- Invalid or expired token returns `401`.
- A token signed by the wrong key returns `401`.
- A token with the wrong issuer or audience returns `401`.
- A token using an algorithm outside the configured allowlist returns `401`.
- A token with a missing or malformed subject returns `401`.
- An unknown signing key fails closed when it cannot be resolved from JWKS.
- The JWKS resolver never follows a token-controlled URL or a redirect away from the pinned Supabase origin, and rejects timed-out, oversized, or malformed JWKS responses.
- A token triggers at most one refresh attempt; concurrent requests with the same or different unknown `kid` values share the single-flight refresh, obey the global refresh rate limit, and produce a bounded number of outbound JWKS requests.
- Unknown `kid` values use a bounded short negative cache, while a legitimate rotated key becomes usable after refresh or negative-cache expiry without restarting the API.
- Cached valid keys remain usable according to the configured cache policy during a transient JWKS outage, then fail closed after their usable lifetime ends.
- In migration mode, `HS256` tokens are checked only by the legacy validator and asymmetric tokens only by the JWKS validator; failure does not fall through between validators.
- Asymmetric mode rejects `HS256` and refuses to start when legacy-secret configuration remains enabled.
- Valid authenticated token without `user_role` returns `403`.
- Albums, images, categories, and tags controllers that contain admin routes run both `JwtAuthGuard` and `RolesGuard`.
- Valid token with `user_role=admin` reaches every protected album, image, category, and tag mutation, including bulk-remove operations.
- The standard Supabase `role=authenticated` claim never satisfies `@Roles('admin')`.
- Every API route, including `GET`, has an explicit public, admin, or system/webhook authorization classification and an explicit response-data contract.
- Public album list returns `400` for privileged or unknown status filters and otherwise returns active published albums only.
- Public album detail and image listing return `404` for draft, scheduled, deleted, or unknown parent albums.
- Public response DTOs exclude administrative, scheduling/deletion, private upload, storage-internal, and operator-only fields.
- Admin album list/detail, dashboard statistics, category usage, and tag usage reads require `user_role=admin`.
- Intended public album, image, category, and tag reads are explicitly marked public and remain accessible without a token.
- Adding `@Roles('admin')` metadata without active `JwtAuthGuard` and `RolesGuard` fails the authorization coverage test.
- No development-only `@Public()` decorator remains on an admin mutation.
- Successful, denied, and failed administrator mutations emit one schema-valid audit event whose actor comes from the verified JWT `sub` and whose request/correlation ID links it to request logs.
- Bulk operations and image presign/confirm transitions identify their action and affected resource without logging presigned URLs, tokens, authorization headers, or raw sensitive bodies.
- Audit serialization tests reject or redact every prohibited sensitive field, and audit-pipeline errors do not trigger sensitive fallback logging.

### Frontend

- Login success enters the admin area.
- Invalid credentials show a generic error.
- `/admin/login` renders without the protected admin layout and never redirects to itself.
- Unauthenticated navigation to a protected admin route redirects to login.
- An invalid or external intended-path value falls back to `/admin`.
- Authenticated non-admin navigation shows access denied.
- Public service functions use `publicApiClient`, work in browser and SSR contexts, never attach a Bearer token, and consume only public DTOs.
- Protected mutation and read functions use browser-only `adminApiClient`, consume admin DTOs, and cannot be downgraded to public mode.
- Admin requests include the current Bearer token.
- Admin client initialization fails for a missing, relative, malformed, credential-bearing, frontend-origin, or otherwise unapproved API URL; production also rejects non-HTTPS API origins.
- Before reading or attaching the token, every admin request resolves to the immutable allowlisted API origin. Absolute caller-supplied endpoints, base-URL overrides, and authenticated redirects are rejected.
- Tests intercept fetch and prove Bearer tokens are never sent to the frontend origin, a redirect target, or any origin outside the configured allowlist, including when environment configuration is absent.
- A public `401` does not trigger refresh or logout.
- A single admin `401` triggers one refresh and one retry.
- Multiple concurrent `401` responses trigger exactly one shared refresh, after which each eligible request retries at most once.
- Aborted requests and requests with consumed streaming bodies do not refresh or retry automatically.
- Repeated `401` logs out once without an infinite loop.
- `403` does not trigger refresh.
- Logout removes the session and returns to login.
- `/admin/login` and representative protected admin routes emit the admin security-header set in report-only and enforced configurations.
- The enforced production CSP uses a fresh nonce, permits required Next.js/Supabase/API connections, blocks an inline script without that nonce, contains no `'unsafe-eval'`, and includes `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, and `frame-ancestors 'none'`; two HTML responses receive different nonces and shared caches never replay an admin document nonce.
- Admin responses emit `X-Content-Type-Options`, `Referrer-Policy`, clickjacking protection, and the minimal `Permissions-Policy`; public routes are not accidentally assigned an incompatible admin policy.
- Production configuration rejects wildcard or malformed CSP origins and does not emit development-only CSP relaxations.

### End-to-end acceptance

- A bootstrapped administrator logs in and uploads an image successfully through presign, R2 PUT, and confirm.
- A normal authenticated user receives `403` from `POST /images/upload-url`.
- An unauthenticated user receives `401`.
- Public list/detail/image requests cannot retrieve draft or scheduled album data even when supplied a privileged status filter, known slug, or known album ID.
- An administrator can retrieve draft and scheduled albums only through protected admin read endpoints.
- A revoked administrator cannot obtain a new JWT containing `user_role=admin`.
- A previously issued administrator JWT remains authorized only until its expiration, never beyond the configured maximum revocation delay.
- Role grant/revoke and representative successful, denied, failed, and bulk administrator mutations produce attributable, correlated audit events without sensitive values.
- Misconfigured or redirected admin API requests fail locally and never disclose the Bearer token to the frontend or an unapproved origin.
- The same test suite can target the future admin subdomain by changing environment configuration.

## Rollout

1. Inspect and record the current Supabase signing algorithm, issuer, audience, JWKS URI, current access-token lifetime, and whether the project requires legacy-to-asymmetric migration.
2. Configure a 10-minute access-token lifetime. Record the latest possible expiration of tokens issued under the previous lifetime; that timestamp, not merely 10 minutes after rotation, determines when legacy verification can be removed.
3. Deploy the RBAC enum, table, RLS policies, dedicated `auth_hooks` schema, explicit grants, dedicated hook-owner role, hardened `auth_hooks.custom_access_token_hook(jsonb)` configuration, and the structured administrative audit schema/sink with retention and access controls.
4. Bootstrap and verify the first administrator, including hook claim issuance and browser-role denial tests.
5. Configure and verify the pinned JWKS URL, bounded key and negative caches, single-flight/rate-limited refresh, per-token refresh limit, network timeouts, response-size limit, and resolver metrics. If Supabase already uses asymmetric signing, deploy the backend in `asymmetric` mode. If it uses `HS256`, deploy `migration` mode with an operator-recorded removal deadline before activating the new Supabase signing key.
6. For a legacy project, activate asymmetric signing, verify that newly refreshed tokens use the configured asymmetric algorithm and pass JWKS verification, then keep migration mode only until every previously issued `HS256` token has expired.
7. Deploy `asymmetric` mode, remove the legacy secret and migration-mode configuration from the application, deployment manifests, and secret storage, and verify that `HS256` tokens are rejected.
8. Inventory every backend route, including `GET`, and classify its authorization and response-data contract as public, admin, or system/webhook.
9. Split public and admin album/image read service methods and DTOs. Enforce published-and-active predicates and explicit public DTO allowlists on public reads; add protected `GET /admin/albums` and `GET /admin/albums/:id` endpoints and protect dashboard statistics and category/tag usage reads.
10. Apply class-level `@UseGuards(JwtAuthGuard, RolesGuard)` to every controller containing admin routes, including albums, images, categories, and tags. Remove temporary `@Public()` decorators from admin routes, apply `@Roles('admin')` to every admin mutation and admin-only read including bulk-remove and usage operations, and explicitly mark only genuinely public reads with `@Public()`.
11. Restrict backend CORS to explicit origins, required methods, and required headers, and remove credential support from the Bearer-only API.
12. Verify that each album, image, category, and tag admin mutation and admin-only read returns `401` without authentication, `403` for a valid non-admin, and reaches normal behavior for an administrator. Verify that public reads remain unauthenticated but cannot expose unpublished content or administrative fields. Verify attributable, correlated, redacted audit events for role changes and representative success, denial, failure, bulk, and image-state mutation outcomes.
13. Deploy the frontend Supabase client, `publicApiClient`/`adminApiClient` split, required validated `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_ADMIN_API_ORIGINS`, public/protected service functions and DTOs, public/protected admin route groups, login and logout flows, protected layout, and single-flight admin refresh integration. Remove every same-origin, deployment-frontend, and implicit localhost fallback from `adminApiClient`. Add the centralized admin security-header policy and first deploy its CSP in report-only mode.
14. Verify login, intended-path validation, access denial, public/admin read separation, API-destination fail-closed behavior, token non-disclosure across missing configuration and redirects, concurrent `401` handling, logout, a harmless protected request, and security headers on login and protected routes. Review CSP reports, correct the allowlist without wildcards, then enable enforcement and verify nonce propagation plus blocked non-nonced script behavior.
15. Verify the full album and image mutation flows, including image upload through presign, R2 PUT, and confirm, plus representative category and tag create, update, delete, and bulk-remove flows in staging fixtures; correlate each operation with its redacted audit event.
16. Add remaining administrators through the attributable operator workflow and verify grant events.
17. Exercise and record the rollback procedures before enabling the flow in production.

### Rollback

- Frontend failure: roll back the frontend while retaining backend authorization. Never make mutation endpoints public as a rollback.
- Hook failure: disable or roll back the hook through the Supabase operator interface, correct it, and re-enable it only after staging verification. Existing tokens remain subject to their signed claims until expiry.
- Backend failure before asymmetric signing is activated: restore the last verifier that accepts the currently active Supabase signing algorithm.
- Backend failure after asymmetric signing is activated: do not roll back to an `HS256`-only backend. Keep or restore the time-limited migration verifier when still inside its deadline, or forward-fix/restore the last known-good JWKS verifier. A signing-key rollback may be used only through a pre-validated Supabase operator procedure.
- Migration cleanup failure: keep migration mode only long enough to restore service, record a new short removal deadline, and do not delete the legacy secret until the backend is confirmed healthy in `asymmetric` mode.
- API configuration failure: fail the admin client build or initialization and restore the last known-good allowlisted API configuration; never enable same-origin fallback as a rollback.
- Audit pipeline failure: retain authorization and audit instrumentation, alert operators, and restore the configured sink or transport; never disable redaction or log raw requests as a diagnostic fallback.

## Acceptance criteria

- Administrators authenticate using Supabase email/password.
- Multiple administrators can be managed through database-backed membership.
- Newly issued JWTs carry `user_role=admin` only when the user is present in `user_roles` at issuance time.
- Users cannot grant themselves administrator access.
- Frontend API requests use the current Supabase access token instead of a manually stored `auth_token`.
- Every API route, including reads, has an explicit public, admin, or system/webhook authorization classification and response-data contract.
- No development-only `@Public()` decorator remains on an admin mutation.
- Every controller containing admin routes actively runs both `JwtAuthGuard` and `RolesGuard`; `@Roles('admin')` is never relied upon as metadata alone.
- Album, image, category, and tag admin mutations, including bulk-remove operations, return `401` without valid authentication and `403` without the admin role.
- Steady-state JWT verification uses the configured Supabase JWKS, exact issuer and audience, and an explicit asymmetric algorithm allowlist, with no legacy secret present.
- Attacker-controlled `kid` values cannot create unbounded JWKS traffic: the pinned resolver has bounded positive/negative caches, single-flight and rate-limited unknown-key refresh, strict network limits, at most one refresh per token, and passing concurrency coverage.
- If migration mode is required, its two validators are algorithm- and key-type-bound, have no failure fallback between them, and are removed by the recorded deadline after legacy tokens expire.
- The backend refuses to start when required JWT verification configuration is missing, contradictory, or invalid.
- The hook owner can create objects only in `auth_hooks` and has only required public schema/type usage plus role-table select through its narrow RLS path; browser roles have no hook-schema or direct table access; `supabase_auth_admin` has hook-schema usage and exact hook execution without create or direct table access.
- Public API functions use a browser/SSR-safe client that never attaches authorization and consume published-only public DTOs; protected functions use a browser-only admin client and admin DTOs and cannot be downgraded to public mode.
- `adminApiClient` requires an absolute allowlisted API URL, rejects same-origin frontend and authenticated redirects, and never reads or sends a Bearer token until the final request origin is validated; missing or invalid configuration fails closed.
- Public album list/detail/image endpoints cannot expose draft or scheduled albums or administrative/storage-internal fields; protected admin reads provide the required management data.
- `/admin/login` is outside the protected admin layout; protected admin URLs retain their existing public paths through route groups.
- `/admin/login` and protected admin responses enforce the approved nonce-based CSP and defense-in-depth browser headers; production contains no `'unsafe-eval'`, wildcard connection origins, or development-only relaxations.
- Concurrent protected requests share one refresh operation and each request retries at most once only when replayable.
- Backend CORS allows only explicit origins, required methods, and required headers and does not enable credentials for the Bearer-only API.
- A valid administrator can complete the album-management and image-upload flows.
- Revoked administrators cannot receive new admin-bearing JWTs; previously issued JWTs expire within the configured 10-minute maximum revocation delay.
- Role grant/revoke and all administrator mutations produce attributable, correlated, append-only audit events for success and failure outcomes without tokens, credentials, presigned URLs, or sensitive bodies.
- No service-role key or sensitive session data is exposed or committed.
- Moving to `admin.ndtstudio.site` requires configuration changes, not an authorization redesign.
