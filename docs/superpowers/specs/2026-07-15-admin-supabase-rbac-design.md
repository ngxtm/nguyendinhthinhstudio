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

The backend verifies the JWT and reads only the application claim `user_role`. It must not treat Supabase's standard `role: "authenticated"` claim as the application administrator role.

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
- Browser clients receive no insert, update, or delete policy.
- Users must not be able to assign or modify their own role.
- The token hook receives only the minimum read permission required to resolve the current user's role.
- Role grants and revocations run through an operator-only mechanism using trusted database access or a service-role credential.
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
  aud: string | string[];
  exp: number;
}
```

After successful signature, audience, and expiry validation, `JwtStrategy` maps `user_role` to the request user's application role. `RolesGuard` continues to compare that role with `@Roles('admin')`.

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

The admin layout observes Supabase auth state:

- No session: redirect to `/admin/login`.
- Authenticated without admin role: show an access-denied state and allow logout.
- Authenticated admin: render admin content.
- Initial session resolution: render a neutral loading state to prevent protected UI flashing.

This route protection is user experience only. NestJS guards remain the security boundary.

### API client

Before a protected request, `apiClient` asks Supabase for the current session and attaches its access token. Public API calls may proceed without a token.

On a protected request returning `401`:

1. Attempt one session refresh.
2. Retry the request once with the new token.
3. If it still fails, clear the session and send the user to login.

The client must not loop retries. A `403` is not refreshed automatically because it indicates insufficient authorization, not an expired credential.

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
3. Verify a newly issued token lacks `user_role`.
4. Verify admin API access returns `403` or `401`, depending on session state.

Deleting a role row alone does not invalidate an already-issued access JWT. Operational revocation must therefore include session revocation when immediate removal is required. Keep access-token lifetime reasonably short.

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
- Add `https://admin.ndtstudio.site` to backend CORS allowlists.
- Configure frontend environment variables and DNS/TLS.
- Ensure API requests continue targeting `https://api.ndtstudio.site`.
- Re-run login, refresh, logout, `401`, `403`, and admin mutation tests from the new origin.

Bearer authorization avoids relying on a cross-subdomain authentication cookie. Supabase session persistence remains scoped to the admin frontend origin.

## Security considerations

- Never use `user_metadata` for authorization because users can update it.
- Never expose the service-role key to Next.js client code.
- Never log access tokens, refresh tokens, passwords, or complete authorization headers.
- Validate JWT signature, expiration, and expected audience/issuer configuration.
- Keep CORS restricted to explicit production admin/frontend origins.
- Maintain API authorization even when frontend route guards pass.
- Rate-limit login through Supabase configuration and use strong administrator passwords.
- Require email confirmation according to the chosen invitation workflow.
- Prefer MFA as a later hardening step once the base email/password flow is stable.

## Testing strategy

### Database and hook

- A user with an `admin` row receives `user_role=admin`.
- A user without a row receives no application role claim.
- Browser/anon users cannot insert, update, or delete role rows.
- Duplicate role rows for one user are rejected.
- Deleting an Auth user cascades its role row.

### Backend

- Missing token returns `401`.
- Invalid or expired token returns `401`.
- Valid authenticated token without `user_role` returns `403`.
- Valid token with `user_role=admin` reaches each protected image mutation.
- The standard Supabase `role=authenticated` claim never satisfies `@Roles('admin')`.
- Existing public image and album reads remain public.

### Frontend

- Login success enters the admin area.
- Invalid credentials show a generic error.
- Unauthenticated navigation redirects to login.
- Authenticated non-admin navigation shows access denied.
- Admin requests include the current Bearer token.
- A single `401` triggers one refresh and one retry.
- Repeated `401` logs out without an infinite loop.
- `403` does not trigger refresh.
- Logout removes the session and returns to login.

### End-to-end acceptance

- A bootstrapped administrator logs in and uploads an image successfully through presign, R2 PUT, and confirm.
- A normal authenticated user receives `403` from `POST /images/upload-url`.
- An unauthenticated user receives `401`.
- Revoked admin credentials cannot obtain new authorized access.
- The same test suite can target the future admin subdomain by changing environment configuration.

## Rollout

1. Deploy the RBAC enum, table, RLS, grants, and token hook configuration.
2. Bootstrap and verify the first administrator.
3. Deploy backend JWT claim mapping and authorization tests.
4. Deploy frontend Supabase session, login, route guard, and API integration.
5. Verify login and a harmless protected request.
6. Verify the full image upload flow.
7. Add remaining administrators through the operator workflow.
8. Record rollback instructions before enabling the flow in production.

If frontend rollout fails, retain backend protection and roll back the frontend; do not make mutation endpoints public. If the hook prevents token issuance, disable or roll back the hook configuration through the Supabase operator interface, correct it, and re-enable it only after staging verification.

## Acceptance criteria

- Administrators authenticate using Supabase email/password.
- Multiple administrators can be managed through database-backed membership.
- JWTs carry `user_role=admin` only for users present in `user_roles`.
- Users cannot grant themselves administrator access.
- Frontend API requests use the current Supabase access token instead of a manually stored `auth_token`.
- Backend admin endpoints return `401` without valid authentication and `403` without the admin role.
- A valid administrator can complete the image upload flow.
- No service-role key or sensitive session data is exposed or committed.
- Moving to `admin.ndtstudio.site` requires configuration changes, not an authorization redesign.
