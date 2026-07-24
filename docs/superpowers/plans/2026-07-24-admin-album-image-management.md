# Admin Album Image Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make current-policy upload completion return the correct contract, keep the album grid visible while it refreshes, open images in PhotoSwipe, move image actions into a footer menu, add album deletion to edit, and remove the inert queued-file upload glyph.

**Architecture:** Preserve the current backend session renderer and frontend PhotoSwipe/uploader surfaces. Isolate upload concurrency in a small pure worker-pool helper, keep album refresh server-authoritative but non-blocking, and change only the image-card action presentation rather than adding a new detail route or uploader framework.

**Tech Stack:** NestJS, Prisma, Next.js 16 client components, React 19, TypeScript, PhotoSwipe, Lucide React, Node test runner, Jest.

---

## File Structure

- Modify `apps/backend/src/images/images.service.ts`: return the durable session envelope after promotion commit.
- Modify `apps/backend/src/images/images.service.spec.ts`: retain the production regression for the consumed envelope.
- Create `apps/frontend/src/lib/image-upload/upload-queue.ts`: pure bounded worker-pool helper.
- Create `apps/frontend/test/image-upload-queue.test.ts`: deterministic out-of-order concurrency coverage.
- Modify `apps/frontend/src/app/admin/components/ImageUploadZone.tsx`: use the worker pool, await refresh, and remove the inert pending glyph.
- Modify `apps/frontend/src/app/admin/albums/[id]/page.tsx`: distinguish initial loading from background refresh.
- Modify `apps/frontend/src/app/admin/components/ImageGrid.tsx`: preserve PhotoSwipe clicks and move cover/delete into a footer menu.
- Modify `apps/frontend/src/app/admin/albums/[id]/edit/page.tsx`: add guarded album deletion.
- Create `apps/frontend/test/admin-album-image-management.contract.test.ts`: guard the agreed UI/data-flow contracts without adding a browser-test dependency.

### Task 1: Preserve the Confirm-Upload Contract Fix

**Files:**
- Modify: `apps/backend/src/images/images.service.ts:853-864`
- Test: `apps/backend/src/images/images.service.spec.ts:752-814`

- [ ] **Step 1: Confirm the regression assertion describes the production failure**

The test must emulate a durable promotion commit and assert the public response envelope:

```ts
await expect(
  harness
    .createCurrentService(promotions, semaphore, inspector)
    .confirmUpload({ uploadId: UPLOAD_ID } as any, ADMIN_ID),
).resolves.toEqual(
  expect.objectContaining({
    outcome: 'consumed',
    statusCode: 200,
    uploadId: UPLOAD_ID,
    image: expect.objectContaining({ id: expect.any(String) }),
    resultImageId: expect.any(String),
    resultDeletedAt: null,
    retentionExpiresAt: '2026-08-11T12:00:00.000Z',
  }),
);
```

- [ ] **Step 2: Verify the current implementation uses the durable renderer**

The line immediately after the existing `settleCopyResponseAndCommit(...)` call must remain:

```ts
return this.getUploadStatus(upload.id, upload.createdByAdminId);
```

Do not restore the old raw-image return:

```ts
return (this.prisma as any).image.findUnique({ where: { id: imageId } });
```

- [ ] **Step 3: Run the focused backend test**

Run from `apps/backend`:

```powershell
& ..\..\node_modules\.bin\jest.cmd --runInBand --runTestsByPath src/images/images.service.spec.ts
```

Expected: 38 tests pass, including `returns the consumed response envelope after current confirmation commits`.

### Task 2: Add a Deterministic Two-Worker Upload Queue

**Files:**
- Create: `apps/frontend/src/lib/image-upload/upload-queue.ts`
- Create: `apps/frontend/test/image-upload-queue.test.ts`
- Modify: `apps/frontend/src/app/admin/components/ImageUploadZone.tsx:18-290`

- [ ] **Step 1: Write the failing queue tests**

Create `apps/frontend/test/image-upload-queue.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { runUploadQueue } from '../src/lib/image-upload/upload-queue'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

test('waits for out-of-order jobs and never exceeds the worker limit', async () => {
  const gates = [deferred(), deferred(), deferred()]
  const started: number[] = []
  let active = 0
  let maxActive = 0
  let settled = false

  const resultPromise = runUploadQueue([0, 1, 2], 2, async (item) => {
    started.push(item)
    active++
    maxActive = Math.max(maxActive, active)
    await gates[item].promise
    active--
  }).finally(() => {
    settled = true
  })

  await flush()
  assert.deepEqual(started, [0, 1])

  gates[1].resolve()
  await flush()
  assert.deepEqual(started, [0, 1, 2])
  assert.equal(settled, false)

  gates[2].resolve()
  await flush()
  assert.equal(settled, false)

  gates[0].resolve()
  assert.deepEqual(await resultPromise, { completed: 3, failed: 0 })
  assert.equal(maxActive, 2)
})

test('counts failures without skipping the remaining jobs', async () => {
  const visited: number[] = []
  const result = await runUploadQueue([0, 1, 2], 2, async (item) => {
    visited.push(item)
    if (item === 1) throw new Error('failed')
  })

  assert.deepEqual([...visited].sort(), [0, 1, 2])
  assert.deepEqual(result, { completed: 2, failed: 1 })
})
```

- [ ] **Step 2: Run the queue test to verify RED**

Run:

```powershell
npm run test:focused --workspace=frontend -- test/image-upload-queue.test.ts
```

Expected: FAIL because `../src/lib/image-upload/upload-queue` does not exist.

- [ ] **Step 3: Implement the pure worker pool**

Create `apps/frontend/src/lib/image-upload/upload-queue.ts`:

```ts
export type UploadQueueResult = {
  completed: number
  failed: number
}

export async function runUploadQueue<T>(
  items: readonly T[],
  concurrency: number,
  run: (item: T) => Promise<void>,
): Promise<UploadQueueResult> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new RangeError('concurrency must be a positive safe integer')
  }

  let cursor = 0
  let completed = 0
  let failed = 0

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++
      if (index >= items.length) return

      try {
        await run(items[index])
        completed++
      } catch {
        failed++
      }
    }
  }

  const workerCount = Math.min(concurrency, items.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return { completed, failed }
}
```

- [ ] **Step 4: Run the queue test to verify GREEN**

Run:

```powershell
npm run test:focused --workspace=frontend -- test/image-upload-queue.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Integrate the helper and await refresh**

In `ImageUploadZone.tsx`, import the helper and widen the callback:

```ts
import { runUploadQueue } from '@/lib/image-upload/upload-queue'

interface Props {
  albumId: string
  onUploadComplete: () => void | Promise<void>
}
```

Replace the `activeUploads` / `Promise.race()` loop with:

```ts
const queue = files
  .map((file, index) => ({ file, index }))
  .filter(({ file }) => !file.error && file.status !== 'success')

const { completed, failed } = await runUploadQueue(
  queue,
  CONCURRENT_UPLOADS,
  async ({ file, index }) => {
    if (uploadControllerRef.current.cancel) {
      throw new Error('Upload cancelled')
    }
    await uploadSingleFile(file, index)
  },
)
```

After cleanup, await the background refresh:

```ts
if (completed > 0) {
  await onUploadComplete()
}
```

Apply the same rule to single-file retry:

```ts
setFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
await onUploadComplete()
```

Remove only the pending decorative icon:

```tsx
{/* No icon for pending: progress text and the batch button are the action cue. */}
{fileItem.status === 'uploading' && (
  <div className="text-blue-600">
    <Loader2 size={20} className="animate-spin" />
  </div>
)}
```

Keep success and error status icons unchanged.

- [ ] **Step 6: Run focused uploader tests**

Run:

```powershell
npm run test:focused --workspace=frontend -- test/image-upload-queue.test.ts test/image-upload-policy.test.ts test/admin-album-workflows.contract.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 7: Commit the queue change**

```powershell
git add -- apps/frontend/src/lib/image-upload/upload-queue.ts apps/frontend/test/image-upload-queue.test.ts apps/frontend/src/app/admin/components/ImageUploadZone.tsx
git commit -m "fix(admin): wait for every queued image upload"
```

### Task 3: Refresh Album Images Without Unmounting the Grid

**Files:**
- Modify: `apps/frontend/src/app/admin/albums/[id]/page.tsx:32-95`
- Test: `apps/frontend/test/admin-album-image-management.contract.test.ts`

- [ ] **Step 1: Write the failing background-refresh contract**

Create `apps/frontend/test/admin-album-image-management.contract.test.ts` with the initial test:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const detailSource = readFileSync(
  new URL('../src/app/admin/albums/[id]/page.tsx', import.meta.url),
  'utf8',
)

test('post-upload album refresh keeps the existing grid mounted', () => {
  assert.match(
    detailSource,
    /async function loadAlbum\(\{ showLoading = true \}[^)]*\)/,
  )
  assert.match(
    detailSource,
    /async function handleUploadComplete\(\)[\s\S]*await loadAlbum\(\{ showLoading: false \}\)/,
  )
})
```

- [ ] **Step 2: Run the contract test to verify RED**

Run:

```powershell
npm run test:focused --workspace=frontend -- test/admin-album-image-management.contract.test.ts
```

Expected: FAIL because `loadAlbum` has no `showLoading` option.

- [ ] **Step 3: Implement initial versus background loading**

In the album detail page, replace `loadAlbum` with:

```ts
async function loadAlbum(
  { showLoading = true }: { showLoading?: boolean } = {},
): Promise<void> {
  try {
    if (showLoading) setLoading(true)
    const data = await getAlbum(slug, true, true)
    setAlbum(data)
  } catch (error) {
    console.error('Failed to load album:', error)
    toast.error('Không thể tải album')
  } finally {
    if (showLoading) setLoading(false)
  }
}
```

Use an awaited background refresh after upload:

```ts
async function handleUploadComplete(): Promise<void> {
  await loadAlbum({ showLoading: false })
}
```

Initial `useEffect` continues to call `loadAlbum()` with the default loading screen.

- [ ] **Step 4: Run the contract test to verify GREEN**

Run:

```powershell
npm run test:focused --workspace=frontend -- test/admin-album-image-management.contract.test.ts
```

Expected: 1 test passes.

- [ ] **Step 5: Commit the background refresh**

```powershell
git add -- apps/frontend/src/app/admin/albums/[id]/page.tsx apps/frontend/test/admin-album-image-management.contract.test.ts
git commit -m "fix(admin): refresh album images without blanking grid"
```

### Task 4: Open PhotoSwipe and Move Actions Into a Footer Menu

**Files:**
- Modify: `apps/frontend/src/app/admin/components/ImageGrid.tsx:7-445`
- Test: `apps/frontend/test/admin-album-image-management.contract.test.ts`

- [ ] **Step 1: Extend the contract test for the agreed interaction**

Append:

```ts
const imageGridSource = readFileSync(
  new URL('../src/app/admin/components/ImageGrid.tsx', import.meta.url),
  'utf8',
)

test('album images keep PhotoSwipe clicks and expose actions through a footer menu', () => {
  assert.match(imageGridSource, /data-pswp-src=\{lightboxUrl\}/)
  assert.match(imageGridSource, /aria-haspopup="menu"/)
  assert.match(imageGridSource, /<MoreVertical/)
  assert.match(imageGridSource, /Đặt làm ảnh bìa/)
  assert.match(imageGridSource, /Xóa ảnh/)
  assert.doesNotMatch(imageGridSource, /absolute inset-0 z-20/)
})
```

- [ ] **Step 2: Run the contract test to verify RED**

Run:

```powershell
npm run test:focused --workspace=frontend -- test/admin-album-image-management.contract.test.ts
```

Expected: FAIL because `MoreVertical` and the menu do not exist and the full overlay remains.

- [ ] **Step 3: Remove overlay/swipe action state**

In `ImageGrid`:

- remove `activeSwipeId`;
- remove `showActions`, `onOpenSwipe`, and `onCloseSwipe` props;
- remove the touch-swipe handlers that only reveal the old overlay;
- import `MoreVertical` and keep `Star`, `Trash2`, and `GripVertical`.

The tile keeps `lightboxUrl`, the PhotoSwipe anchor, dimensions, cover/delete handlers, and reorder handlers.

- [ ] **Step 4: Add the accessible footer menu**

Inside `AlbumImageTile`, add:

```ts
const [menuOpen, setMenuOpen] = useState(false)
const menuRef = useRef<HTMLDivElement>(null)

useEffect(() => {
  if (!menuOpen) return

  const closeOnPointerDown = (event: PointerEvent) => {
    if (!menuRef.current?.contains(event.target as Node)) {
      setMenuOpen(false)
    }
  }
  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') setMenuOpen(false)
  }

  document.addEventListener('pointerdown', closeOnPointerDown)
  document.addEventListener('keydown', closeOnEscape)
  return () => {
    document.removeEventListener('pointerdown', closeOnPointerDown)
    document.removeEventListener('keydown', closeOnEscape)
  }
}, [menuOpen])
```

Keep the image anchor free of action overlays:

```tsx
<div
  className="relative cursor-move"
  draggable
  onDragStart={(event) => onDragStart(event, index)}
>
  <a
    href={lightboxUrl}
    data-pswp-src={lightboxUrl}
    data-pswp-width={dimensions.width}
    data-pswp-height={dimensions.height}
    className="block"
  >
    <div className="relative overflow-hidden rounded-md bg-gray-100 shadow-md transition-shadow hover:shadow-lg md:rounded-lg">
      <img
        src={image.largeUrl || image.mediumUrl || image.smallUrl || image.thumbnailUrl}
        alt={image.altText || image.filename}
        className="h-auto w-full object-cover"
        loading="lazy"
      />
      {image.id === coverImageId && (
        <div className="absolute left-2 top-2 z-10 rounded bg-yellow-500 px-2 py-1 text-xs font-medium text-white">
          Cover
        </div>
      )}
      <div className="pointer-events-none absolute right-2 top-2 z-10 rounded bg-black/60 p-1 opacity-0 transition-opacity group-hover:opacity-100">
        <GripVertical size={16} className="text-white" />
      </div>
    </div>
  </a>
</div>
```

Render the footer after the draggable image region:

```tsx
<div className="mt-2 flex items-start justify-between gap-2">
  <div className="min-w-0">
    <p className="truncate text-xs text-gray-500">{image.filename}</p>
    <p className="text-xs text-gray-400">Order: {image.orderIndex}</p>
  </div>

  <div ref={menuRef} className="relative shrink-0" data-image-actions>
    <button
      type="button"
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      aria-label={`Thao tác với ảnh ${image.filename}`}
      onClick={() => setMenuOpen((open) => !open)}
      className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
    >
      <MoreVertical size={18} />
    </button>

    {menuOpen && (
      <div
        role="menu"
        className="absolute bottom-full right-0 z-30 mb-1 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg"
      >
        <button
          type="button"
          role="menuitem"
          disabled={isActionPending || image.id === coverImageId}
          onClick={handleSetCover}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:text-gray-400"
        >
          <Star size={16} />
          {image.id === coverImageId ? 'Đang là ảnh bìa' : 'Đặt làm ảnh bìa'}
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={isActionPending}
          onClick={handleDeleteImage}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
        >
          <Trash2 size={16} />
          Xóa ảnh
        </button>
      </div>
    )}
  </div>
</div>
```

Update successful handlers to call `setMenuOpen(false)`. Keep `preventDefault()` and `stopPropagation()` inside both action handlers.

- [ ] **Step 5: Run the contract and existing admin workflow tests**

Run:

```powershell
npm run test:focused --workspace=frontend -- test/admin-album-image-management.contract.test.ts test/admin-album-workflows.contract.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 6: Commit the image card interaction**

```powershell
git add -- apps/frontend/src/app/admin/components/ImageGrid.tsx apps/frontend/test/admin-album-image-management.contract.test.ts
git commit -m "fix(admin): open album images without action overlay"
```

### Task 5: Add Album Deletion to Edit

**Files:**
- Modify: `apps/frontend/src/app/admin/albums/[id]/edit/page.tsx:8-455`
- Test: `apps/frontend/test/admin-album-image-management.contract.test.ts`

- [ ] **Step 1: Add a failing delete-flow contract**

Append:

```ts
const editSource = readFileSync(
  new URL('../src/app/admin/albums/[id]/edit/page.tsx', import.meta.url),
  'utf8',
)

test('album edit exposes a guarded destructive delete action', () => {
  assert.match(editSource, /deleteAlbum\(album\.id\)/)
  assert.match(editSource, /router\.replace\('\/admin\/albums'\)/)
  assert.match(editSource, /Xóa album/)
  assert.match(editSource, /disabled=\{loading \|\| deleting\}/)
})
```

- [ ] **Step 2: Run the contract test to verify RED**

Run:

```powershell
npm run test:focused --workspace=frontend -- test/admin-album-image-management.contract.test.ts
```

Expected: FAIL because the edit page has no delete action.

- [ ] **Step 3: Implement the guarded delete handler**

Import `Trash2` and `deleteAlbum`, then add:

```ts
const [deleting, setDeleting] = useState(false)

async function handleDeleteAlbum(): Promise<void> {
  if (
    !album ||
    deleting ||
    !window.confirm(
      `Bạn có chắc muốn xóa album "${album.title}"? Hành động này không thể hoàn tác.`,
    )
  ) {
    return
  }

  try {
    setDeleting(true)
    await deleteAlbum(album.id)
    toast.success('Đã xóa album!')
    router.replace('/admin/albums')
  } catch (error) {
    console.error('Failed to delete album:', error)
    toast.error('Không thể xóa album')
    setDeleting(false)
  }
}
```

Change the action footer to keep normal actions together and deletion separate:

```tsx
<div className="flex flex-wrap items-center justify-between gap-4 border-t pt-6">
  <div className="flex gap-4">
    <button
      type="submit"
      disabled={loading || deleting}
      className="px-6 py-3 bg-blue-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? 'Đang lưu...' : 'Lưu Thay Đổi'}
    </button>
    <Link
      href={`/admin/albums/${slug}`}
      className="px-6 py-3 border border-gray-300 rounded-lg"
    >
      Hủy
    </Link>
  </div>

  <button
    type="button"
    onClick={handleDeleteAlbum}
    disabled={loading || deleting}
    className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-3 font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
  >
    <Trash2 size={18} />
    {deleting ? 'Đang xóa...' : 'Xóa album'}
  </button>
</div>
```

- [ ] **Step 4: Run the contract test to verify GREEN**

Run:

```powershell
npm run test:focused --workspace=frontend -- test/admin-album-image-management.contract.test.ts
```

Expected: all contract tests pass.

- [ ] **Step 5: Commit the edit-page delete action**

```powershell
git add -- apps/frontend/src/app/admin/albums/[id]/edit/page.tsx apps/frontend/test/admin-album-image-management.contract.test.ts
git commit -m "feat(admin): delete albums from edit page"
```

### Task 6: Final Verification

**Files:**
- Verify all files listed above.
- Do not change unrelated missing public assets or reformat whole legacy files.

- [ ] **Step 1: Run backend build and image-upload unit tests**

Run:

```powershell
npm run build --workspace=backend
npm run test:image-upload:unit --workspace=backend
```

Expected: backend build exits 0; all image-upload unit suites pass.

- [ ] **Step 2: Run focused frontend tests**

Run:

```powershell
npm run test:focused --workspace=frontend -- test/image-upload-queue.test.ts test/admin-album-image-management.contract.test.ts test/admin-album-workflows.contract.test.ts test/image-upload-policy.test.ts test/image-upload-encoder.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 3: Verify the workflow contract**

Run:

```powershell
npm run verify:image-upload-workflow
```

Expected: `image-upload workflow contract: 3 required jobs verified`.

- [ ] **Step 4: Check the final diff**

Run:

```powershell
git diff --check
git status --short --branch
git diff origin/main --stat
```

Expected: no whitespace errors and only the approved backend, frontend, test, spec, and plan files differ from `origin/main`.

- [ ] **Step 5: Preserve the branch for user-selected integration**

Do not merge, push, create a PR, or remove the worktree until the user chooses the integration option.
