# Admin Supabase RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver database-backed Supabase administrator membership, fail-closed JWT authorization, public/admin API separation, and a protected Next.js admin session without exposing bearer tokens.

**Architecture:** Supabase owns identities and injects a namespaced `user_role` claim from an RLS-protected role table. NestJS verifies asymmetric tokens against a pinned JWKS endpoint and enforces admin metadata through active guards; Next.js separates anonymous and authenticated clients and places login outside the protected admin layout. Audit events are append-only and correlation-aware.

**Tech Stack:** PostgreSQL/Supabase SQL, Prisma migrations, NestJS 11, Passport, jose, Jest, Next.js 16, React 19, Supabase JS, Node test runner.

## Current implementation status (2026-07-15)

Completed in the isolated `feat/admin-supabase-rbac` worktree:

- Tasks 1–4: Supabase RBAC migration/hook, migration-aware JWT verification, route guards, and public/admin read separation.
- Task 5 (code path): explicit CORS policy plus redacted audit service, request correlation, guard denial events, and admin success/failure interceptor.
- Tasks 6–8 (code path): Supabase browser/session helpers, login/protected admin shell, split public/admin API clients with fail-closed origin validation and refresh handling, and nonce-based admin headers.
- Added frontend Node contract tests (5 passing) and backend audit interceptor coverage; backend suite is 202/202 passing.

Still requiring operator or environment verification:

- Execute `apps/backend/test/supabase-rbac.sql` against a disposable Supabase-compatible database (`DIRECT_URL` is not present in this worktree).
- Configure and exercise the real Supabase Custom Access Token Hook, bootstrap/revoke an administrator, and perform the HS256 → asymmetric rotation runbook. No key rotation was performed by this implementation.
- Run staging browser/E2E flows for upload, CSP nonce propagation/report-only rollout, concurrent refresh, and audit sink retention. The current audit sink is structured application logging; persistent Supabase audit-table writes remain an operational follow-up.

---

### Task 1: Supabase role, hook, and audit migration

**Files:**
- Create: `apps/backend/prisma/migrations/20260715000100_add_supabase_admin_rbac/migration.sql`
- Create: `apps/backend/test/supabase-rbac.sql`
- Modify: `.env.example`

- [ ] **Step 1: Write the failing SQL contract test**

Create assertions that `public.user_roles`, `public.admin_audit_events`, `auth_hooks.custom_access_token_hook(jsonb)`, their RLS policies, grants, uniqueness, cascade, immutable audit triggers, and dedicated hook-owner privileges exist. Include `set role anon`, `authenticated`, `supabase_auth_admin`, and the hook-owner checks; mutation checks must fail for browser and hook roles.

- [ ] **Step 2: Verify RED**

Run: `psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f apps/backend/test/supabase-rbac.sql`

Expected: FAIL because `public.user_roles` does not exist.

- [ ] **Step 3: Implement the migration**

Create `public.app_role` with only `admin`; role rows keyed by `auth.users(id)` with cascade; append-only audit rows with operator, target, action, outcome, correlation reference, timestamp and JSON metadata; revoke browser access. Create `auth_hooks`, a NOLOGIN hook-owner role with object creation restricted to that schema, and a `security definer set search_path = ''` hook owned by that role. The hook must select only the authenticating subject through RLS and merge `user_role` only for administrators. Grant `supabase_auth_admin` schema usage and exact function execution, never direct table access.

- [ ] **Step 4: Verify GREEN**

Run the SQL contract test against a disposable Supabase-compatible PostgreSQL database.

Expected: all assertions complete with no SQL error.

- [ ] **Step 5: Commit**

`git add apps/backend/prisma/migrations/20260715000100_add_supabase_admin_rbac apps/backend/test/supabase-rbac.sql .env.example && git commit -m "feat(auth): add Supabase admin role hook"`

### Task 2: Fail-closed asymmetric JWT verifier

**Files:**
- Modify: `apps/backend/package.json`
- Modify: `package-lock.json`
- Modify: `apps/backend/src/config/env.validation.ts`
- Modify: `apps/backend/src/config/env.validation.spec.ts`
- Create: `apps/backend/src/auth/jwks-resolver.ts`
- Create: `apps/backend/src/auth/jwks-resolver.spec.ts`
- Modify: `apps/backend/src/auth/strategies/jwt.strategy.ts`
- Create: `apps/backend/src/auth/strategies/jwt.strategy.spec.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing configuration tests**

Require `SUPABASE_URL`, `SUPABASE_JWT_ISSUER`, `SUPABASE_JWT_AUDIENCE`, `SUPABASE_JWKS_URL`, and an asymmetric allowlist limited to `RS256,ES256`. Assert the JWKS URL is HTTPS, pinned to the Supabase origin and path, and that asymmetric mode rejects any legacy secret.

- [ ] **Step 2: Verify RED**

Run: `npm test --workspace=backend -- env.validation.spec.ts --runInBand`

Expected: FAIL because JWT verifier variables are not validated.

- [ ] **Step 3: Implement configuration validation and install `jose`**

Run: `npm install jose --workspace=backend`. Implement strict startup validation with no development secret fallback.

- [ ] **Step 4: Write failing resolver/strategy tests**

Cover wrong signature, expiration, issuer, audience, algorithm, malformed subject, unknown `kid`, redirect, timeout, oversized/malformed JWKS, bounded negative caching, one refresh per token, concurrent single-flight refresh, and stale-key expiry. Assert `role=authenticated` never becomes the application role and `user_role=admin` does.

- [ ] **Step 5: Verify RED**

Run: `npm test --workspace=backend -- jwks-resolver.spec.ts jwt.strategy.spec.ts --runInBand`

Expected: FAIL because the resolver and asymmetric validation are absent.

- [ ] **Step 6: Implement minimal verifier**

Use a pinned fetcher with redirect disabled, abort timeout, byte limit, bounded positive/negative maps, single-flight refresh, and global refresh interval. Validate `alg`, `iss`, `aud`, `exp`, and UUID-like `sub`; map only `user_role` to the request user's role.

- [ ] **Step 7: Verify GREEN**

Run the two focused suites, then `npm test --workspace=backend -- --runInBand`.

Expected: focused and full suites pass.

- [ ] **Step 8: Commit**

`git add package-lock.json apps/backend/package.json apps/backend/src/auth apps/backend/src/config .env.example && git commit -m "feat(auth): verify Supabase JWTs with pinned JWKS"`

### Task 3: Route authorization coverage

**Files:**
- Modify: `apps/backend/src/albums/albums.controller.ts`
- Modify: `apps/backend/src/images/images.controller.ts`
- Modify: `apps/backend/src/categories/categories.controller.ts`
- Modify: `apps/backend/src/tags/tags.controller.ts`
- Create: `apps/backend/src/auth/authorization-coverage.spec.ts`
- Create: `apps/backend/test/admin-authorization.e2e-spec.ts`

- [ ] **Step 1: Write failing metadata coverage test**

Enumerate every controller route. Assert each is explicitly `@Public()` or admin-classified; every admin route's controller activates both `JwtAuthGuard` and `RolesGuard`; every admin handler carries `@Roles('admin')`. Specifically cover album mutations/dashboard, image mutations, category/tag mutations, usage, and bulk-remove.

- [ ] **Step 2: Verify RED**

Run: `npm test --workspace=backend -- authorization-coverage.spec.ts --runInBand`

Expected: FAIL on development-public album mutations and unguarded category/tag controllers.

- [ ] **Step 3: Apply guards and metadata**

Keep only genuine public reads public. Protect all administrator mutations and management reads at class/handler level; remove every development-only public decorator.

- [ ] **Step 4: Write and run HTTP authorization tests**

Assert protected routes return 401 without a token, 403 with authenticated non-admin claims, and reach controller behavior for `user_role=admin`; genuine public reads remain anonymous.

- [ ] **Step 5: Verify GREEN**

Run focused coverage/e2e suites and the full backend unit suite.

- [ ] **Step 6: Commit**

`git add apps/backend/src/{albums,images,categories,tags,auth} apps/backend/test/admin-authorization.e2e-spec.ts && git commit -m "feat(auth): enforce admin guards on management routes"`

### Task 4: Public and admin read contracts

**Files:**
- Create: `apps/backend/src/albums/album.presenter.ts`
- Create: `apps/backend/src/albums/album.presenter.spec.ts`
- Modify: `apps/backend/src/albums/albums.service.ts`
- Modify: `apps/backend/src/albums/albums.service.spec.ts`
- Modify: `apps/backend/src/albums/albums.controller.ts`
- Modify: `apps/backend/src/images/images.service.ts`
- Modify: `apps/backend/src/images/images.service.spec.ts`
- Modify: `apps/backend/src/images/images.controller.ts`

- [ ] **Step 1: Write failing public contract tests**

Public list must reject unknown/privileged status filters with 400 and return only published, active, already-published albums. Public detail and image list must return 404 for draft, scheduled, deleted, unknown or unpublished parents. Public presenters must omit scheduling, deletion, storage keys, upload state, operator/private and management-only fields.

- [ ] **Step 2: Verify RED**

Run: `npm test --workspace=backend -- albums.service.spec.ts images.service.spec.ts album.presenter.spec.ts --runInBand`

Expected: FAIL because public methods currently share management queries and presenters.

- [ ] **Step 3: Implement split service methods and routes**

Expose public `GET /albums`, `GET /albums/:slug`, related reads and public album images through allowlisted DTO presenters. Add protected `GET /admin/albums`, `GET /admin/albums/:id`, dashboard, category usage and tag usage methods returning management DTOs.

- [ ] **Step 4: Verify GREEN**

Run focused suites, full backend suite, and `npm run build --workspace=backend`.

- [ ] **Step 5: Commit**

`git add apps/backend/src/{albums,images,categories,tags} && git commit -m "feat(api): separate public and admin read contracts"`

### Task 5: CORS and administrator audit pipeline

**Files:**
- Create: `apps/backend/src/audit/admin-audit.service.ts`
- Create: `apps/backend/src/audit/admin-audit.service.spec.ts`
- Create: `apps/backend/src/audit/admin-audit.interceptor.ts`
- Create: `apps/backend/src/audit/audit.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Modify: `apps/backend/src/main.ts`
- Create: `apps/backend/src/main.spec.ts`

- [ ] **Step 1: Write failing audit and CORS tests**

Assert success, denial and failure produce one schema-valid event using verified `sub` and request ID; bulk and upload actions identify affected resources. Assert tokens, authorization/cookie headers, passwords, presigned URLs and raw bodies are recursively redacted. Assert explicit production origins/methods/headers and `credentials: false`.

- [ ] **Step 2: Verify RED**

Run: `npm test --workspace=backend -- admin-audit.service.spec.ts main.spec.ts --runInBand`

Expected: FAIL because audit infrastructure is absent and CORS enables credentials.

- [ ] **Step 3: Implement minimal audit/interceptor and CORS factory**

Persist through Prisma raw SQL into the append-only table; audit failures emit a safe operational error without raw request fallback. Attach a request/correlation ID and register the interceptor for administrator operations.

- [ ] **Step 4: Verify GREEN**

Run focused suites, full backend suite and backend build.

- [ ] **Step 5: Commit**

`git add apps/backend/src/{audit,app.module.ts,main.ts,main.spec.ts} && git commit -m "feat(audit): record redacted administrator actions"`

### Task 6: Frontend test harness and Supabase session

**Files:**
- Modify: `apps/frontend/package.json`
- Modify: `package-lock.json`
- Create: `apps/frontend/vitest.config.ts`
- Create: `apps/frontend/src/lib/auth/supabase.ts`
- Create: `apps/frontend/src/lib/auth/session.ts`
- Create: `apps/frontend/src/lib/auth/session.test.ts`
- Create: `apps/frontend/src/app/admin/(public)/login/page.tsx`
- Create: `apps/frontend/src/app/admin/(protected)/layout.tsx`
- Move: current protected admin pages/components under `apps/frontend/src/app/admin/(protected)/` while preserving URLs.

- [ ] **Step 1: Install and configure Vitest/jsdom/testing-library and Supabase**

Run: `npm install @supabase/supabase-js --workspace=frontend && npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom --workspace=frontend`.

- [ ] **Step 2: Write failing session tests**

Cover generic login failure, admin success, non-admin access denied, intended-path allowlist, unauthenticated redirect, login outside protected layout, logout, and missing Supabase configuration.

- [ ] **Step 3: Verify RED**

Run: `npm test --workspace=frontend -- session.test.ts`

Expected: FAIL because session helpers and route groups do not exist.

- [ ] **Step 4: Implement session and route groups**

Use one browser Supabase client, `getSession` plus auth-state subscription, refresh before checking `user_role`, safe internal intended paths, and sign-out redirect. The protected layout owns the sidebar; login has no protected chrome.

- [ ] **Step 5: Verify GREEN**

Run frontend tests and `npm run build --workspace=frontend`.

- [ ] **Step 6: Commit**

`git add package-lock.json apps/frontend && git commit -m "feat(admin): add Supabase login and protected routes"`

### Task 7: Public/admin API client split and refresh single-flight

**Files:**
- Replace: `apps/frontend/src/lib/api/client.ts`
- Create: `apps/frontend/src/lib/api/client.test.ts`
- Modify: `apps/frontend/src/lib/api/albums.ts`
- Modify: `apps/frontend/src/lib/api/images.ts`
- Modify: `apps/frontend/src/lib/api/categories.ts`
- Modify: `apps/frontend/src/lib/api/tags.ts`

- [ ] **Step 1: Write failing destination and refresh tests**

Public client works in browser/SSR and never reads or attaches a token. Admin client rejects missing, relative, malformed, credential-bearing, frontend-origin and non-allowlisted API URLs; production requires HTTPS. Reject absolute caller endpoints, base overrides and authenticated redirects before reading the token. Cover one refresh/retry for replayable 401, one shared refresh for concurrent 401s, no retry for abort/streaming body/403, and one logout after repeated 401.

- [ ] **Step 2: Verify RED**

Run: `npm test --workspace=frontend -- client.test.ts`

Expected: FAIL because the single client uses localStorage and fallbacks.

- [ ] **Step 3: Implement clients and classify service methods**

`publicApiClient` accepts anonymous relative paths only. Browser-only `adminApiClient` validates immutable origin first, then obtains the current Supabase access token, uses `redirect: 'manual'`, and performs bounded single-flight refresh. Move public gallery calls to public DTOs and all management reads/mutations to admin DTOs.

- [ ] **Step 4: Verify GREEN**

Run client tests, all frontend tests, type checking and frontend build.

- [ ] **Step 5: Commit**

`git add apps/frontend/src/lib package-lock.json && git commit -m "feat(admin): split anonymous and authenticated API clients"`

### Task 8: Nonce-based admin security headers

**Files:**
- Create: `apps/frontend/src/lib/security/admin-csp.ts`
- Create: `apps/frontend/src/lib/security/admin-csp.test.ts`
- Create: `apps/frontend/src/proxy.ts`
- Modify: `apps/frontend/next.config.mjs`
- Modify: `.env.example`

- [ ] **Step 1: Write failing CSP tests**

Assert fresh nonces, no `unsafe-eval` in production, no wildcard origins, required Supabase/API connect origins, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, cache prevention, report-only/enforced modes, and defense headers only on `/admin/:path*`.

- [ ] **Step 2: Verify RED**

Run: `npm test --workspace=frontend -- admin-csp.test.ts`

Expected: FAIL because no centralized policy exists.

- [ ] **Step 3: Implement policy and nonce propagation**

Generate a cryptographic nonce per admin HTML request, forward it through request headers for Next rendering, emit CSP plus `X-Content-Type-Options`, strict referrer policy, frame protection and minimal permissions policy. Validate configured origins and disallow production relaxations.

- [ ] **Step 4: Verify GREEN**

Run focused/all frontend tests and production build.

- [ ] **Step 5: Commit**

`git add apps/frontend/src/{lib/security,proxy.ts} apps/frontend/next.config.mjs .env.example && git commit -m "feat(security): enforce nonce CSP on admin routes"`

### Task 9: Integration verification and operator runbook

**Files:**
- Create: `apps/backend/test/admin-rbac.e2e-spec.ts`
- Create: `docs/admin-rbac-runbook.md`
- Modify: `docs/superpowers/specs/2026-07-15-admin-supabase-rbac-design.md`

- [ ] **Step 1: Add end-to-end acceptance coverage**

Exercise 401/403/admin success for representative album/image/category/tag operations, public unpublished-content denial, admin draft reads, role claim grant/revoke issuance, client destination failure, refresh concurrency, audit correlation/redaction, and image presign/confirm with test doubles at external boundaries.

- [ ] **Step 2: Write operator runbook**

Document Supabase hook enablement, first-admin bootstrap with attributable operator/correlation fields, JWT issuer/audience/JWKS inspection, 10-minute lifetime rollout, legacy migration deadline calculation, administrator grant/revoke, CSP report-only rollout, verification commands and rollback constraints. Commands must use environment variables and never embed secrets.

- [ ] **Step 3: Verify all code**

Run:
- `npm test --workspace=backend -- --runInBand`
- `npm test --workspace=frontend`
- `npm run check-types`
- `npm run build`
- `npm run lint`

Expected: all commands exit 0 with no new warnings.

- [ ] **Step 4: Commit**

`git add apps docs .env.example package-lock.json && git commit -m "test(auth): verify admin RBAC end to end"`
