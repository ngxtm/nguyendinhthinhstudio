# Upload Concurrency Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Phase 4 upload, cleanup, deletion, and PostgreSQL-concurrency correctness gaps.

**Architecture:** A reusable helper retries only Prisma `P2034` Serializable conflicts. `ImagesService` uses it for reservation and consumption, reclaims stale ETag-matching leases, cleanup distinguishes expiry grace from finalization leases, and album deletion reads images only inside its post-lock transaction. Testcontainers supplies a disposable migrated PostgreSQL database for concurrency assertions.

**Tech Stack:** NestJS, Prisma 6, PostgreSQL, Jest, Testcontainers, AWS S3 SDK

---

## File Structure

- Create `apps/backend/src/prisma/serializable-retry.ts`: generic three-attempt P2034 retry helper.
- Create `apps/backend/src/prisma/serializable-retry.spec.ts`: deterministic retry behavior tests.
- Modify `apps/backend/src/images/images.service.ts`: use retry helper and reclaim stale finalizing sessions.
- Modify `apps/backend/src/images/images.service.spec.ts`: lease and confirm retry tests.
- Modify `apps/backend/src/images/upload-cleanup.service.ts`: grace-period and finalizing lease queries.
- Modify `apps/backend/src/images/upload-cleanup.service.spec.ts`: cleanup safety coverage.
- Modify `apps/backend/src/albums/albums.service.ts`: obtain the deletion image snapshot transactionally after locking.
- Modify `apps/backend/src/albums/albums.service.spec.ts`: deletion race regression test.
- Modify `apps/backend/package.json` and `package-lock.json`: Testcontainers dependency and integration command.
- Create `apps/backend/test/jest-integration.json`: isolated integration Jest config.
- Create `apps/backend/test/image-concurrency.integration-spec.ts`: real PostgreSQL capacity and ordering tests.

### Task 1: Add a reusable Serializable retry helper

**Files:**
- Create: `apps/backend/src/prisma/serializable-retry.ts`
- Create: `apps/backend/src/prisma/serializable-retry.spec.ts`

- [ ] **Step 1: Write failing retry tests**

```ts
import { runSerializableWithRetry } from './serializable-retry';

const p2034 = Object.assign(new Error('write conflict'), { code: 'P2034' });

it('retries P2034 twice then returns the third attempt result', async () => {
  const operation = jest
    .fn()
    .mockRejectedValueOnce(p2034)
    .mockRejectedValueOnce(p2034)
    .mockResolvedValueOnce('ok');

  await expect(runSerializableWithRetry(operation)).resolves.toBe('ok');
  expect(operation).toHaveBeenCalledTimes(3);
});

it('rethrows the third P2034 and never retries another error', async () => {
  const conflicts = jest.fn().mockRejectedValue(p2034);
  await expect(runSerializableWithRetry(conflicts)).rejects.toBe(p2034);
  expect(conflicts).toHaveBeenCalledTimes(3);

  const other = new Error('validation failed');
  const nonConflict = jest.fn().mockRejectedValue(other);
  await expect(runSerializableWithRetry(nonConflict)).rejects.toBe(other);
  expect(nonConflict).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the focused test and observe module-not-found failure**

```powershell
npm test --workspace=backend -- serializable-retry.spec.ts --runInBand
```

Expected: FAIL because `serializable-retry.ts` does not exist.

- [ ] **Step 3: Implement the helper**

```ts
export const SERIALIZABLE_MAX_ATTEMPTS = 3;

function isP2034(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    'code' in error && (error as { code?: unknown }).code === 'P2034';
}

export async function runSerializableWithRetry<T>(
  operation: () => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= SERIALIZABLE_MAX_ATTEMPTS; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isP2034(error) || attempt === SERIALIZABLE_MAX_ATTEMPTS) throw error;
    }
  }
  throw new Error('Serializable retry exhausted');
}
```

- [ ] **Step 4: Run the retry tests**

```powershell
npm test --workspace=backend -- serializable-retry.spec.ts --runInBand
```

Expected: PASS with 2 tests.

- [ ] **Step 5: Commit the helper**

```powershell
git add apps/backend/src/prisma/serializable-retry.ts apps/backend/src/prisma/serializable-retry.spec.ts
git commit -m "fix(prisma): retry serializable transaction conflicts"
```

### Task 2: Reclaim stale confirmation leases and retry confirm transactions

**Files:**
- Modify: `apps/backend/src/images/images.service.ts:1-205`
- Modify: `apps/backend/src/images/images.service.spec.ts:1-470`
- Modify: `apps/backend/src/albums/albums.service.ts:1-520`

- [ ] **Step 1: Add failing stale-lease tests**

Add tests using an `ImageUpload` with `status: 'finalizing'`, a stored ETag, and
`finalizationStartedAt` either eleven minutes or one minute before `NOW`:

```ts
it('reclaims a stale finalizing session only after its current ETag matches', async () => {
  const session = activeUpload({
    status: 'finalizing',
    sourceEtag: '"source-etag"',
    finalizationStartedAt: new Date(NOW.getTime() - 11 * 60_000),
  });
  const harness = createHarness(session);

  await harness.createService().confirmUpload({ uploadId: UPLOAD_ID } as any);

  expect(harness.prisma.imageUpload.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ status: 'finalizing', sourceEtag: '"source-etag"' }),
      data: { status: 'pending', sourceEtag: null, finalizationStartedAt: null },
    }),
  );
});
```

Also assert a fresh lease rejects with `ConflictException`, and an ETag mismatch
marks the finalizing session failed without calling `promoteObject`.

- [ ] **Step 2: Add `runSerializableWithRetry` around both image transactions**

Import the helper and replace each direct `this.prisma.$transaction(...,
{ isolationLevel: 'Serializable' as any })` with:

```ts
await runSerializableWithRetry(() =>
  this.prisma.$transaction(work, { isolationLevel: 'Serializable' as any }),
);
```

Keep promotion outside the final database transaction. A retry of the final
transaction is safe because an aborted transaction did not create the image or
consume the session.

- [ ] **Step 3: Implement stale lease reclaim before reservation**

Add a private method that:

```ts
const leaseCutoff = new Date(Date.now() - 10 * 60_000);
if (!session.finalizationStartedAt || session.finalizationStartedAt > leaseCutoff) {
  throw new ConflictException('Upload session is already being finalized');
}
const currentEtag = await this.storage.verifyObject(session.uploadObjectKey, expected);
if (!session.sourceEtag || currentEtag !== session.sourceEtag) {
  await imageUpload.updateMany({
    where: { id: session.id, status: 'finalizing', sourceEtag: session.sourceEtag },
    data: { status: 'failed' },
  });
  throw new BadRequestException('Upload object changed while finalization was incomplete');
}
const reclaimed = await imageUpload.updateMany({
  where: {
    id: session.id,
    status: 'finalizing',
    sourceEtag: currentEtag,
    finalizationStartedAt: { lte: leaseCutoff },
  },
  data: { status: 'pending', sourceEtag: null, finalizationStartedAt: null },
});
if (reclaimed.count !== 1) throw new ConflictException('Upload session is already being finalized');
```

Reload the session after a successful reclaim, then run normal pending
verification and reservation. Retain the existing expiry, consumed, and failed
rejections.

- [ ] **Step 4: Reuse the helper for album-delete Serializable work**

Wrap the transaction that queues image deletions and deletes the album in
`runSerializableWithRetry`, keeping `deleteStatus=deleting` persisted outside
the retry loop.

- [ ] **Step 5: Run focused tests and build**

```powershell
npm test --workspace=backend -- serializable-retry.spec.ts images.service.spec.ts albums.service.spec.ts --runInBand
npm run build --workspace=backend
```

Expected: all pass.

- [ ] **Step 6: Commit confirmation hardening**

```powershell
git add apps/backend/src/images/images.service.ts apps/backend/src/images/images.service.spec.ts apps/backend/src/albums/albums.service.ts apps/backend/src/albums/albums.service.spec.ts
git commit -m "fix(images): recover stale upload finalization"
```

### Task 3: Apply cleanup grace periods and a fresh album-deletion snapshot

**Files:**
- Modify: `apps/backend/src/images/upload-cleanup.service.ts:1-75`
- Modify: `apps/backend/src/images/upload-cleanup.service.spec.ts:1-80`
- Modify: `apps/backend/src/albums/albums.service.ts:459-525`
- Modify: `apps/backend/src/albums/albums.service.spec.ts:1-120`

- [ ] **Step 1: Write failing cleanup and deletion-race tests**

Add unit tests that assert:

```text
pending session expired 30 minutes ago is not selected
failed session expired 61 minutes ago is selected
finalizing session started 30 minutes ago is not selected even if expiresAt is old
finalizing session started 61 minutes ago is selected
rerunning a deleted session performs no extra storage delete
album deletion queues images returned by tx.album.findUnique, not images from the pre-lock read
```

- [ ] **Step 2: Split cleanup queries by status and eligibility time**

Use a one-hour cutoff and separate queries:

```ts
const graceCutoff = new Date(now.getTime() - 60 * 60_000);
const expired = await imageUpload.findMany({
  where: { ...scope, status: { in: ['pending', 'failed'] }, expiresAt: { lt: graceCutoff } },
  take: 100,
});
const staleFinalizing = await imageUpload.findMany({
  where: { ...scope, status: 'finalizing', finalizationStartedAt: { lt: graceCutoff } },
  take: 100,
});
```

Process `expired` and `staleFinalizing` with the existing unreferenced-final-key
guard. Keep consumed cleanup separate and delete only `uploadObjectKey`.

- [ ] **Step 3: Read images and sessions inside album deletion transaction**

After persisting `deleting` and calling scoped cleanup, replace use of the
pre-lock `album.images` snapshot with:

```ts
const deleted = await runSerializableWithRetry(() =>
  this.prisma.$transaction(async (tx: any) => {
    const current = await tx.album.findUnique({
      where: { id },
      include: { images: { where: { r2ObjectKey: { not: null } } } },
    });
    if (!current) throw new NotFoundException('Album not found');
    const activeUploads = await tx.imageUpload.count({
      where: { albumId: id, status: { in: ['pending', 'finalizing'] }, expiresAt: { gt: new Date() } },
    });
    if (activeUploads > 0) throw new ConflictException('Album is locked for deletion; retry after active uploads finish or expire');
    // upsert every current.images object key, delete eligible upload rows, then delete current album
    return current.images.length;
  }, { isolationLevel: 'Serializable' as any }),
);
```

Return `deleted` as `imagesDeleted` and remove the initial image include from
the pre-lock `findUnique` query.

- [ ] **Step 4: Run focused tests and build**

```powershell
npm test --workspace=backend -- upload-cleanup.service.spec.ts albums.service.spec.ts --runInBand
npm run build --workspace=backend
```

Expected: all pass.

- [ ] **Step 5: Commit cleanup and deletion race fixes**

```powershell
git add apps/backend/src/images/upload-cleanup.service.ts apps/backend/src/images/upload-cleanup.service.spec.ts apps/backend/src/albums/albums.service.ts apps/backend/src/albums/albums.service.spec.ts
git commit -m "fix(images): preserve upload cleanup and deletion invariants"
```

### Task 4: Add PostgreSQL Testcontainers concurrency coverage

**Files:**
- Modify: `apps/backend/package.json`
- Modify: `package-lock.json`
- Create: `apps/backend/test/jest-integration.json`
- Create: `apps/backend/test/image-concurrency.integration-spec.ts`

- [ ] **Step 1: Install the Testcontainers dependency and add the test command**

Run:

```powershell
npm install -D @testcontainers/postgresql --workspace=backend
```

Add:

```json
"test:integration": "jest --config ./test/jest-integration.json --runInBand"
```

Use a config with `rootDir: "."`, `testEnvironment: "node"`, `testRegex` set
to `".integration-spec.ts$"`, and the same TypeScript transform/module mapper
as `jest-e2e.json`.

- [ ] **Step 2: Write an integration suite that migrates a disposable database**

Start one `PostgreSqlContainer`, set both `DATABASE_URL` and `DIRECT_URL` to
`container.getConnectionUri()`, and execute Prisma's installed CLI with Node's
standard `execFile` API (do not add an `execa` dependency):

```ts
const execFileAsync = promisify(execFile);
await execFileAsync(process.execPath, [
  require.resolve('prisma/build/index.js'),
  'migrate',
  'deploy',
  '--schema',
  schemaPath,
], { cwd: repoRoot, env: process.env });
```

Create a real `PrismaClient` with the same URI, an `ImagesService` using mocked
storage (`verifyObject` returns each session ETag; `promoteObject` resolves),
and an `ImageUrlService` substitute returning fixed compatibility URLs.

Create an album plus sessions with real Prisma rows. The first test inserts 49
images and asserts two concurrent confirms yield exactly one fulfilled result,
one rejection, and exactly 50 persisted images. The second starts from zero and
asserts two fulfilled confirms persist two different `orderIndex` values.

- [ ] **Step 3: Run the integration suite**

```powershell
npm run test:integration --workspace=backend
```

Expected: Docker downloads/starts PostgreSQL once; both tests pass; container is
stopped in `afterAll` even if a test fails.

- [ ] **Step 4: Commit PostgreSQL concurrency tests**

```powershell
git add apps/backend/package.json package-lock.json apps/backend/test/jest-integration.json apps/backend/test/image-concurrency.integration-spec.ts
git commit -m "test(images): verify upload concurrency on PostgreSQL"
```

### Task 5: Final Phase 4 verification

**Files:**
- Verify: `apps/backend/src/images/images.service.ts`
- Verify: `apps/backend/src/images/upload-cleanup.service.ts`
- Verify: `apps/backend/src/albums/albums.service.ts`
- Verify: `apps/backend/test/image-concurrency.integration-spec.ts`

- [ ] **Step 1: Run all backend verification commands**

```powershell
npm test --workspace=backend -- --runInBand
npm run test:e2e --workspace=backend -- --runInBand
npm run test:integration --workspace=backend
npm run build --workspace=backend
$env:DATABASE_URL='postgresql://user:password@localhost:5432/database'
$env:DIRECT_URL='postgresql://user:password@localhost:5432/database'
npx prisma validate --schema apps/backend/prisma/schema.prisma
git diff --check
git status --short --branch
```

Expected: all test suites, build, and schema validation exit `0`; the worktree
contains only committed expected changes.
