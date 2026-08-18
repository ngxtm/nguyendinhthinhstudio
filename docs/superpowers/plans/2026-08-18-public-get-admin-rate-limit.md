# Public GET and Admin Request Limit Adjustment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow public gallery read requests and all authenticated-admin routes to bypass the global Nest throttler, while retaining rate limiting for public `POST` routes and removing the per-admin upload admission limit.

**Architecture:** Replace the global `ThrottlerGuard` provider with a small subclass that skips throttling for routes marked `@Public()` when the HTTP method is `GET`, and for any route marked `@Roles('admin')`. The existing `@Throttle({ default: { limit: 30, ttl: 60000 } })` on public album view remains active because that route is a public `POST`. Remove only the upload controller's calls to `ImageUploadRateLimitService`; retain its database service and cleanup/reconciler wiring so this change does not delete historical rate-limit state or require a migration.

**Tech Stack:** NestJS 11, `@nestjs/throttler` 6.4, TypeScript, Jest, Supertest, Prisma-backed upload cleanup.

---

### Task 1: Add the route-aware global throttler guard

**Files:**
- Create: `apps/backend/src/throttling/api-throttler.guard.ts`
- Test: `apps/backend/src/throttling/api-throttler.guard.spec.ts`

- [x] **Step 1: Write the failing guard contract test**

Create an exposed test subclass so the protected `shouldSkip` decision can be tested without making real storage calls. Use the real controller metadata to cover all four required cases:

```ts
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AlbumsController } from '../albums/albums.controller';
import { ApiThrottlerGuard } from './api-throttler.guard';

class TestableApiThrottlerGuard extends ApiThrottlerGuard {
  skip(context: ExecutionContext): Promise<boolean> {
    return this.shouldSkip(context);
  }
}

function routeContext(
  controller: typeof AlbumsController,
  methodName: keyof AlbumsController,
  method: string,
): ExecutionContext {
  const handler = controller.prototype[methodName];
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ method }) }),
  } as unknown as ExecutionContext;
}

describe('ApiThrottlerGuard', () => {
  const guard = new TestableApiThrottlerGuard(
    [],
    {} as never,
    new Reflector(),
  );

  it.each([
    ['public GET', 'findAll', 'GET', true],
    ['admin GET', 'findAdminAll', 'GET', true],
    ['admin POST', 'create', 'POST', true],
    ['public POST view counter', 'recordView', 'POST', false],
  ])('%s has expected skip decision', async (_name, methodName, method, expected) => {
    await expect(
      guard.skip(
        routeContext(
          AlbumsController,
          methodName as keyof AlbumsController,
          method,
        ),
      ),
    ).resolves.toBe(expected);
  });
});
```

- [x] **Step 2: Run the focused test and verify it fails because the guard does not exist**

Run from the repository root:

```powershell
npm test --workspace=backend -- --runInBand --runTestsByPath src/throttling/api-throttler.guard.spec.ts
```

Expected result before implementation: Jest cannot resolve `./api-throttler.guard`.

- [x] **Step 3: Implement the minimal route-aware skip policy**

Create `api-throttler.guard.ts` with the following behavior:

```ts
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

@Injectable()
export class ApiThrottlerGuard extends ThrottlerGuard {
  protected override async shouldSkip(
    context: ExecutionContext,
  ): Promise<boolean> {
    const handler = context.getHandler();
    const classRef = context.getClass();
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      handler,
      classRef,
    ]);

    if (roles?.includes('admin')) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      handler,
      classRef,
    ]);
    const request = context.switchToHttp().getRequest<{ method?: string }>();

    return isPublic === true && request.method?.toUpperCase() === 'GET';
  }
}
```

This leaves public non-`GET` routes in the normal throttler path, so the existing album-view `@Throttle` override remains authoritative. Existing `@SkipThrottle()` routes still work because the base guard processes that metadata after `shouldSkip` returns false.

- [x] **Step 4: Run the focused test and verify it passes**

Run the same Jest command. Expected result: all four route decisions pass.

### Task 2: Wire the guard into the application and preserve public POST limits

**Files:**
- Modify: `apps/backend/src/app.module.ts:4,48`
- Test: `apps/backend/src/throttling/api-throttler.guard.spec.ts`

- [x] **Step 1: Add a metadata contract for the public view counter**

Extend the guard spec to assert that the public `POST` route still carries its explicit `30` request/60-second metadata:

```ts
import { THROTTLER_LIMIT } from '@nestjs/throttler/dist/throttler.constants';

it('keeps the public album view counter at 30 requests per minute', () => {
  expect(
    Reflect.getMetadata(
      `${THROTTLER_LIMIT}default`,
      AlbumsController.prototype.recordView,
    ),
  ).toBe(30);
});
```

- [x] **Step 2: Run the focused guard tests before wiring**

Run:

```powershell
npm test --workspace=backend -- --runInBand --runTestsByPath src/throttling/api-throttler.guard.spec.ts
```

Expected result: the route-skip tests pass; the new metadata assertion passes against the unchanged controller.

- [x] **Step 3: Replace the global provider**

In `apps/backend/src/app.module.ts`, replace the `ThrottlerGuard` import with `ApiThrottlerGuard`, add the new import, and change only the global provider:

```ts
import { ThrottlerModule } from '@nestjs/throttler';
import { ApiThrottlerGuard } from './throttling/api-throttler.guard';

// ...

{
  provide: APP_GUARD,
  useClass: ApiThrottlerGuard,
},
```

Keep `ttl: 60000` and `limit: 120` as the fallback for public non-`GET` routes. Do not change the public view-counter decorator.

- [x] **Step 4: Run the guard and application tests**

Run:

```powershell
npm test --workspace=backend -- --runInBand --runTestsByPath src/throttling/api-throttler.guard.spec.ts src/auth/authorization-coverage.spec.ts
```

Expected result: guard routing and existing public/admin metadata contracts pass.

### Task 3: Remove upload rate-limit admission for Admin without deleting cleanup infrastructure

**Files:**
- Modify: `apps/backend/src/images/images.controller.ts:42-45,94-136,238-335`
- Modify: `apps/backend/src/images/images.controller.spec.ts:20-143`
- Modify: `apps/backend/test/images.e2e-spec.ts:13-18,57-69,106-148,201-247,267-287,339-373`

- [x] **Step 1: Change the controller tests to expect no rate-limit dependency**

Update the direct controller harness to construct `ImagesController` with only `ImagesService` and the optional runtime token. Remove assertions that `rateLimit.admit` runs before business work. Retain assertions that:

1. disabled ingress rejects before business work;
2. operator-smoke authorization rejects before business work;
3. valid Admin upload, confirm, status, and abandon calls delegate with the authenticated admin ID;
4. malformed DTOs and typed business exceptions retain their existing error contracts.

Add an explicit regression assertion that a valid upload operation succeeds even when no `ImageUploadRateLimitService` is provided to the controller constructor.

- [x] **Step 2: Run the controller tests to verify they fail against the current admission calls**

Run:

```powershell
npm test --workspace=backend -- --runInBand --runTestsByPath src/images/images.controller.spec.ts
```

Expected result before implementation: the changed constructor/test expectations fail because the current controller still injects and calls `rateLimit.admit`.

- [x] **Step 3: Remove only controller admission calls**

In `ImagesController`:

- remove the `ImageUploadRateLimitService` and `ImageUploadRouteScope` imports;
- remove the `rateLimit` constructor parameter;
- remove the private `admit` method;
- in each upload route, call `this.adminId(request)` directly after `assertUploadIngress` and before DTO/business work;
- keep `JwtAuthGuard`, `RolesGuard`, `@Roles('admin')`, owner checks, ingress checks, DTO validation, and business error mapping unchanged.

Do not delete `ImageUploadRateLimitService`, `ImageUploadRateLimitCleanupService`, their tests, Prisma table, or migration. They remain part of the reconciler/cleanup graph and retaining them avoids an unrelated destructive schema change.

- [x] **Step 4: Update the upload e2e contract**

Remove the e2e assertions that expect upload rate admission, `upload_rate_limited`, or `upload_rate_limit_unavailable`. Keep the authentication, admin-role, operator-smoke, validation, body-size, owner, and public-read assertions. The Admin upload route should now reach the mocked `ImagesService` without an admission provider.

- [x] **Step 5: Run focused upload tests**

Run:

```powershell
npm test --workspace=backend -- --runInBand --runTestsByPath src/images/images.controller.spec.ts
npm run test:e2e --workspace=backend -- --runInBand --runTestsByPath test/images.e2e-spec.ts
```

Expected result: controller and image-route e2e contracts pass, with no upload rate-limit response generated by Admin routes.

### Task 4: Update the backend rate-limit documentation and verify the complete change

**Files:**
- Modify: `apps/backend/README.md:48-49`

- [x] **Step 1: Replace the stale rate-limit feature bullet**

Document the actual contract:

```md
- ✅ Public GET API reads and administrator routes bypass the global request throttler
- ✅ Public POST routes retain their explicit rate limits (album view: 30 requests/min/IP)
```

Do not describe the removed Admin upload admission limit as active. The 1 MiB JSON body-parser limit is unrelated and remains unchanged.

- [x] **Step 2: Run repository checks**

Run sequentially from the repository root:

```powershell
npm test --workspace=backend -- --runInBand --runTestsByPath src/throttling/api-throttler.guard.spec.ts src/auth/authorization-coverage.spec.ts src/images/images.controller.spec.ts
npm run test:e2e --workspace=backend -- --runInBand --runTestsByPath test/images.e2e-spec.ts
npm run build --workspace=backend
git diff --check
git status --short
```

Expected result: focused unit/e2e tests pass, backend build succeeds, `git diff --check` reports no whitespace errors, and only the plan plus the explicitly scoped implementation/test/doc files are changed. Do not create a branch, commit, push, or PR unless separately requested.

---

## Self-review

- Public `GET` reads are covered by `@Public()` metadata and skip only when the HTTP method is `GET`.
- Public `POST /albums/:slug/view` is not skipped and retains its explicit `30/min/IP` route override.
- Every route carrying `@Roles('admin')`, including Admin `GET`, `POST`, `PATCH`, and `DELETE`, skips the global guard before authentication/authorization execution.
- Admin image upload no longer calls the per-admin rate-limit service, while validation, ingress, authentication, authorization, and storage/business protections remain.
- No database migration or cleanup-service deletion is included.
- Browser, production, and deployed Cloudflare/Dokploy behavior remain unverified by source/tests alone; a later browser/API smoke check is required to claim that the live gallery no longer returns `429`.
