# Admin Delete Confirmation Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all browser-native Admin deletion prompts with the shared accessible `ConfirmDialog`.

**Architecture:** Keep `ConfirmDialog` as the single reusable primitive and let each owner keep its selected item and pending request state. `DeleteConfirmModal` stays specialised for category/tag dependency information but delegates its destructive bulk action to `ConfirmDialog`.

**Tech Stack:** Next.js client components, React state, Headless UI, TypeScript, Node `node:test`.

---

## File Structure

- Create: `apps/frontend/test/admin-delete-confirmation.contract.test.ts` — source-contract regression tests for every migrated prompt.
- Modify: `apps/frontend/src/app/admin/components/DeleteConfirmModal.tsx` — make bulk removal open the shared confirmation dialog.
- Modify: `apps/frontend/src/app/admin/staff/page.tsx` — select an employee first, then delete only after confirmation.
- Modify: `apps/frontend/src/app/admin/albums/page.tsx` — select an album from the list, then delete only after confirmation.
- Modify: `apps/frontend/src/app/admin/albums/[id]/edit/page.tsx` — confirm deletion of the loaded album before API invocation.
- Modify: `apps/frontend/src/app/admin/categories/page.tsx` — remove the native bulk-removal prompt and return success to the specialised modal.
- Modify: `apps/frontend/src/app/admin/tags/page.tsx` — remove the native bulk-removal prompt and return success to the specialised modal.

### Task 1: Add a failing regression contract

**Files:**
- Create: `apps/frontend/test/admin-delete-confirmation.contract.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const readSource = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8')

const staff = readSource('../src/app/admin/staff/page.tsx')
const albums = readSource('../src/app/admin/albums/page.tsx')
const albumEdit = readSource('../src/app/admin/albums/[id]/edit/page.tsx')
const categories = readSource('../src/app/admin/categories/page.tsx')
const tags = readSource('../src/app/admin/tags/page.tsx')
const deleteConfirmModal = readSource('../src/app/admin/components/DeleteConfirmModal.tsx')

test('admin deletion flows do not use the browser confirmation prompt', () => {
  for (const source of [staff, albums, albumEdit, categories, tags]) {
    assert.doesNotMatch(source, /\b(?:window\.)?confirm\s*\(/)
  }
})

test('simple Admin deletion flows use the reusable confirmation dialog', () => {
  for (const source of [staff, albums, albumEdit]) {
    assert.match(source, /import ConfirmDialog from ['"].*components\/ConfirmDialog['"]/)
    assert.match(source, /<ConfirmDialog[\s\S]*?isPending=/)
  }
})

test('category and tag bulk removal delegates to the reusable confirmation dialog', () => {
  assert.match(deleteConfirmModal, /import ConfirmDialog from ['"].\/ConfirmDialog['"]/)
  assert.match(deleteConfirmModal, /setBulkConfirmOpen\(true\)/)
  assert.match(deleteConfirmModal, /<ConfirmDialog[\s\S]*?onConfirm=\{handleConfirmBulkRemove\}/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:focused -- test/admin-delete-confirmation.contract.test.ts` from `apps/frontend`.

Expected: FAIL because staff, album list, album edit, category, and tag pages still contain `confirm()` or `window.confirm()`; the reusable dialog wiring is absent.

### Task 2: Confirm category/tag bulk removal through the shared primitive

**Files:**
- Modify: `apps/frontend/src/app/admin/components/DeleteConfirmModal.tsx`
- Modify: `apps/frontend/src/app/admin/categories/page.tsx`
- Modify: `apps/frontend/src/app/admin/tags/page.tsx`
- Test: `apps/frontend/test/admin-delete-confirmation.contract.test.ts`

- [ ] **Step 1: Refine the callback contract**

Change `DeleteConfirmModalProps.onBulkRemove` to return a success flag:

```ts
onBulkRemove?: () => Promise<boolean>
```

Keep `isLoading` as the source of truth for disabling the existing dependency modal and its close control.

- [ ] **Step 2: Add local bulk-confirmation state and handler**

Import `useState` and `ConfirmDialog`, then add the state and handler inside `DeleteConfirmModal`:

```ts
const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)

const handleConfirmBulkRemove = async () => {
  if (!onBulkRemove || isLoading) return

  const succeeded = await onBulkRemove()
  if (succeeded) {
    setBulkConfirmOpen(false)
  }
}
```

Replace the current direct bulk button call with:

```tsx
onClick={() => setBulkConfirmOpen(true)}
```

Render the shared dialog after the specialised dialog markup:

```tsx
<ConfirmDialog
  open={bulkConfirmOpen}
  title={`Xóa ${itemType === 'category' ? 'danh mục' : 'thẻ'} khỏi album?`}
  description={
    <>
      Xóa <strong>&quot;{itemName}&quot;</strong> khỏi{' '}
      <strong>{albumCount}</strong> album? Hành động này không thể hoàn tác.
    </>
  }
  confirmLabel="Xóa hàng loạt"
  isPending={isLoading}
  onClose={() => setBulkConfirmOpen(false)}
  onConfirm={handleConfirmBulkRemove}
/>
```

Guard the outer dialog close callback with `if (!isLoading) onClose()` so a pending bulk request cannot dismiss the underlying modal.

- [ ] **Step 3: Make category and tag bulk handlers report success**

In each page, remove the native `confirm(...)` guard. Preserve current success/error toasts and usage refresh, but return a boolean:

```ts
async function handleBulkRemove(): Promise<boolean> {
  if (!deletingCategory) return false

  setIsSubmitting(true)
  try {
    const result = await bulkRemoveCategoryFromAlbums(deletingCategory.category.id)
    toast.success(`Đã xóa category khỏi ${result.removed} album!`)
    const newUsage = await checkCategoryUsage(deletingCategory.category.id)
    setDeletingCategory({ ...deletingCategory, usage: newUsage })
    return true
  } catch (error: any) {
    console.error('Error:', error)
    toast.error(error.message || 'Không thể xóa hàng loạt')
    return false
  } finally {
    setIsSubmitting(false)
  }
}
```

In `tags/page.tsx`, use the tag-specific equivalent:

```ts
async function handleBulkRemove(): Promise<boolean> {
  if (!deletingTag) return false

  setIsSubmitting(true)
  try {
    const result = await bulkRemoveTagFromAlbums(deletingTag.tag.id)
    toast.success(`Đã xóa tag khỏi ${result.removed} album!`)
    const newUsage = await checkTagUsage(deletingTag.tag.id)
    setDeletingTag({ ...deletingTag, usage: newUsage })
    return true
  } catch (error: any) {
    console.error('Error:', error)
    toast.error(error.message || 'Không thể xóa hàng loạt')
    return false
  } finally {
    setIsSubmitting(false)
  }
}
```

- [ ] **Step 4: Run the focused test to verify this portion is green**

Run: `npm run test:focused -- test/admin-delete-confirmation.contract.test.ts` from `apps/frontend`.

Expected: category/tag native-confirm assertions and the specialised-modal delegation assertion pass; the remaining simple-flow assertions still fail until Task 3.

### Task 3: Migrate employee deletion

**Files:**
- Modify: `apps/frontend/src/app/admin/staff/page.tsx`
- Test: `apps/frontend/test/admin-delete-confirmation.contract.test.ts`

- [ ] **Step 1: Add the selected staff and pending state**

Import the shared dialog:

```ts
import ConfirmDialog from '../components/ConfirmDialog';
```

Replace `deletingId` with:

```ts
const [deleteCandidate, setDeleteCandidate] = useState<Staff | null>(null);
const [isDeletePending, setIsDeletePending] = useState(false);
```

- [ ] **Step 2: Split the request and confirmation handlers**

Use a click handler that only selects the record:

```ts
const requestDelete = (s: Staff) => {
  if (!isDeletePending) setDeleteCandidate(s);
};
```

Use a guarded confirm handler:

```ts
const handleConfirmDelete = async (): Promise<void> => {
  if (!deleteCandidate || isDeletePending) return;

  setIsDeletePending(true);
  try {
    await deleteStaff(deleteCandidate.id);
    toast.success('Đã xóa nhân viên');
    setDeleteCandidate(null);
    await loadStaff();
  } catch {
    toast.error('Xóa nhân viên thất bại');
  } finally {
    setIsDeletePending(false);
  }
};
```

- [ ] **Step 3: Wire the button and declarative dialog**

Change the trash button to `onClick={() => requestDelete(s)}` and disable it while `isDeletePending`.

Render once next to the existing create/edit dialog:

```tsx
<ConfirmDialog
  open={deleteCandidate !== null}
  title="Xóa nhân viên?"
  description={
    <>
      Xóa nhân viên <strong>&quot;{deleteCandidate?.fullName}&quot;</strong>? Hành động này không thể hoàn tác.
    </>
  }
  confirmLabel="Xóa nhân viên"
  isPending={isDeletePending}
  onClose={() => setDeleteCandidate(null)}
  onConfirm={handleConfirmDelete}
/>
```

- [ ] **Step 4: Run the focused test to verify staff is green**

Run: `npm run test:focused -- test/admin-delete-confirmation.contract.test.ts` from `apps/frontend`.

Expected: staff passes its no-native-prompt and reusable-dialog assertions; album assertions remain failing until Task 4.

### Task 4: Migrate album deletion from list and edit views

**Files:**
- Modify: `apps/frontend/src/app/admin/albums/page.tsx`
- Modify: `apps/frontend/src/app/admin/albums/[id]/edit/page.tsx`
- Test: `apps/frontend/test/admin-delete-confirmation.contract.test.ts`

- [ ] **Step 1: Update the album-list owner state and callback**

Import `ConfirmDialog`. Add:

```ts
const [deleteCandidate, setDeleteCandidate] = useState<Album | null>(null);
const [isDeletePending, setIsDeletePending] = useState(false);
```

Replace the current `handleDelete(id)` prompt with a request handler that accepts the full `Album` and a confirm handler that calls `deleteAlbum(deleteCandidate.id)`, filters the deleted candidate from state, clears it only after success, and preserves existing toasts/error logging. Propagate the callback through `AlbumsContent`, `AlbumsTable`, and `AlbumRow` so the trash button provides `album`, not only `album.id`.

Render:

```tsx
<ConfirmDialog
  open={deleteCandidate !== null}
  title="Xóa album?"
  description={
    <>
      Xóa album <strong>&quot;{deleteCandidate?.title}&quot;</strong>? Hành động này không thể hoàn tác.
    </>
  }
  confirmLabel="Xóa album"
  isPending={isDeletePending}
  onClose={() => setDeleteCandidate(null)}
  onConfirm={handleConfirmDelete}
/>
```

- [ ] **Step 2: Update the album-edit delete flow**

Import `ConfirmDialog` and add `deleteConfirmOpen` state. Change the existing delete button handler to open that state only. Move the current API call, toast, and redirect into a confirm handler guarded by `album`, `deleting`, and `deleteConfirmOpen`. Keep `deleting` true after successful redirect and reset it on failure.

Render:

```tsx
<ConfirmDialog
  open={deleteConfirmOpen}
  title="Xóa album?"
  description={
    <>
      Xóa album <strong>&quot;{album?.title}&quot;</strong>? Hành động này không thể hoàn tác.
    </>
  }
  confirmLabel="Xóa album"
  isPending={deleting}
  onClose={() => setDeleteConfirmOpen(false)}
  onConfirm={handleConfirmDeleteAlbum}
/>
```

- [ ] **Step 3: Run the contract test and frontend suite**

Run: `npm run test:focused -- test/admin-delete-confirmation.contract.test.ts` from `apps/frontend`.

Expected: PASS.

Run: `npm test` from `apps/frontend`.

Expected: PASS, including existing source-contract tests.

### Task 5: Format, type-check, and verify the complete migration

**Files:**
- Verify: files modified in Tasks 2–4.

- [ ] **Step 1: Verify no scoped native browser confirmation remains**

Run:

```powershell
rg -n --glob '*.tsx' "\b(?:window\.)?confirm\s*\(" apps/frontend/src/app/admin
```

Expected: no matches for native `confirm` invocations. The string `ConfirmDialog` itself is permitted because the expression only matches function calls named `confirm`.

- [ ] **Step 2: Run formatting and type checks**

Run: `npm run format:check` from `apps/frontend`.

Expected: PASS.

Run: `npm run check-types` from repository root.

Expected: PASS.

- [ ] **Step 3: Build the frontend**

Run: `npm run build` from `apps/frontend`.

Expected: PASS.

- [ ] **Step 4: Review the diff**

Run: `git diff --check` and `git diff -- apps/frontend/src/app/admin apps/frontend/test/admin-delete-confirmation.contract.test.ts`.

Expected: no whitespace errors, no unrelated changes, and all five native-confirmation sites migrated.
