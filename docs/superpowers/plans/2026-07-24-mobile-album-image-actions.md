# Mobile Album Image Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mobile image `⋮` popover with an accessible bottom action sheet while preserving the desktop popover and existing album-image workflows.

**Architecture:** Extract responsive presentation mechanics into `ResponsiveActionMenu`, image-specific action semantics into `ImageActionMenu`, reusable destructive confirmation into `ConfirmDialog`, and card rendering into `AlbumImageTile`. Keep API mutation, gallery state, PhotoSwipe registration, and reorder orchestration in `ImageGrid`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Headless UI Dialog, Lucide icons, Node test runner.

---

## File Structure

- Create `apps/frontend/src/app/admin/components/ResponsiveActionMenu.tsx`: controlled responsive action-surface primitive; desktop popover and mobile sheet.
- Create `apps/frontend/src/app/admin/components/ImageActionMenu.tsx`: image cover/delete action labels, icons, disabled and pending state.
- Create `apps/frontend/src/app/admin/components/ConfirmDialog.tsx`: reusable destructive confirmation dialog with pending guard.
- Create `apps/frontend/src/app/admin/components/AlbumImageTile.tsx`: PhotoSwipe tile, cover badge, drag binding, footer, and action-menu composition.
- Modify `apps/frontend/src/app/admin/components/ImageGrid.tsx`: retain gallery/data orchestration and own one shared delete-confirmation state.
- Modify `apps/frontend/test/admin-album-image-management.contract.test.ts`: focused structural regression coverage for the new boundaries and responsive behavior.

### Task 1: Lock the responsive and architecture contract

**Files:**
- Modify: `apps/frontend/test/admin-album-image-management.contract.test.ts`

- [ ] **Step 1: Replace the image-grid-only contract with focused source contracts**

Read the five component sources and assert:

```ts
const imageGridSource = readFileSync(
  new URL('../src/app/admin/components/ImageGrid.tsx', import.meta.url),
  'utf8'
)
const imageTileSource = readFileSync(
  new URL('../src/app/admin/components/AlbumImageTile.tsx', import.meta.url),
  'utf8'
)
const imageActionsSource = readFileSync(
  new URL('../src/app/admin/components/ImageActionMenu.tsx', import.meta.url),
  'utf8'
)
const responsiveMenuSource = readFileSync(
  new URL('../src/app/admin/components/ResponsiveActionMenu.tsx', import.meta.url),
  'utf8'
)
const confirmDialogSource = readFileSync(
  new URL('../src/app/admin/components/ConfirmDialog.tsx', import.meta.url),
  'utf8'
)

test('album images keep PhotoSwipe clicks while actions stay isolated', () => {
  assert.match(imageGridSource, /<AlbumImageTile/)
  assert.match(imageGridSource, /<ConfirmDialog/)
  assert.match(imageTileSource, /data-pswp-src=\{lightboxUrl\}/)
  assert.match(imageTileSource, /<ImageActionMenu/)
  assert.doesNotMatch(imageTileSource, /deleteImage\(/)
  assert.doesNotMatch(imageActionsSource, /@\/lib\/api/)
})

test('image actions adapt to a touch-safe mobile sheet and desktop popover', () => {
  assert.match(responsiveMenuSource, /matchMedia\('\(min-width: 768px\)'\)/)
  assert.match(responsiveMenuSource, /<Dialog/)
  assert.match(responsiveMenuSource, /env\(safe-area-inset-bottom\)/)
  assert.match(responsiveMenuSource, /h-11 w-11/)
  assert.match(responsiveMenuSource, /role="menu"/)
  assert.match(imageActionsSource, /Đặt làm ảnh bìa/)
  assert.match(imageActionsSource, /Đang là ảnh bìa/)
  assert.match(imageActionsSource, /Xóa ảnh/)
  assert.match(imageActionsSource, /text-red-600/)
})

test('image deletion is guarded by one reusable confirmation dialog', () => {
  assert.match(imageGridSource, /deleteCandidate/)
  assert.match(imageGridSource, /await deleteImage\(image\.id\)/)
  assert.match(confirmDialogSource, /<Dialog/)
  assert.match(confirmDialogSource, /isPending/)
  assert.match(confirmDialogSource, /Xác nhận xóa/)
  assert.doesNotMatch(imageGridSource, /\bconfirm\(/)
})
```

Keep the existing upload-refresh and album-delete tests unchanged.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npm test --workspace frontend -- --test-name-pattern="album images|image actions|image deletion"
```

Expected: FAIL because the four extracted component files do not exist yet.

- [ ] **Step 3: Commit the failing contract test**

```powershell
git add apps/frontend/test/admin-album-image-management.contract.test.ts
git commit -m "test(admin): define responsive image action contract"
```

### Task 2: Build reusable action and confirmation primitives

**Files:**
- Create: `apps/frontend/src/app/admin/components/ResponsiveActionMenu.tsx`
- Create: `apps/frontend/src/app/admin/components/ConfirmDialog.tsx`

- [ ] **Step 1: Create `ResponsiveActionMenu`**

Define this public contract:

```tsx
export type ActionMenuPresentation = 'mobile-sheet' | 'desktop-popover';

interface ResponsiveActionMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerLabel: string;
  title: string;
  children: (presentation: ActionMenuPresentation) => ReactNode;
}
```

Implementation requirements:

- use `window.matchMedia('(min-width: 768px)')` inside an effect and subscribe to `change`;
- render one 44px `MoreVertical` trigger with `aria-expanded` and presentation-correct `aria-haspopup`;
- desktop: render an anchored `role="menu"` popover and close on outside pointer or Escape;
- mobile: render a Headless UI `Dialog` bottom sheet with backdrop, `Dialog.Title`, viewport width, reduced-motion-aware transitions, and `pb-[max(1rem,env(safe-area-inset-bottom))]`;
- call `onOpenChange(false)` for every close path and restore focus to the trigger;
- keep the primitive free of image types, labels, and API imports.

- [ ] **Step 2: Create `ConfirmDialog`**

Define the reusable props:

```tsx
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  isPending?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}
```

Use Headless UI `Dialog` and `Transition`. Guard backdrop, Escape, close, cancel, and confirm from repeated actions while `isPending` is true. Render full-width mobile actions, a destructive red confirm button, and centered desktop actions. Default `confirmLabel` to `Xác nhận xóa`.

- [ ] **Step 3: Run the focused contract test**

Run:

```powershell
npm test --workspace frontend -- --test-name-pattern="image actions|image deletion"
```

Expected: the responsive primitive assertions pass; image-grid and tile assertions still fail until Task 3.

- [ ] **Step 4: Commit the primitives**

```powershell
git add apps/frontend/src/app/admin/components/ResponsiveActionMenu.tsx apps/frontend/src/app/admin/components/ConfirmDialog.tsx
git commit -m "feat(admin): add responsive action primitives"
```

### Task 3: Extract the tile and image-specific action menu

**Files:**
- Create: `apps/frontend/src/app/admin/components/ImageActionMenu.tsx`
- Create: `apps/frontend/src/app/admin/components/AlbumImageTile.tsx`
- Modify: `apps/frontend/src/app/admin/components/ImageGrid.tsx`

- [ ] **Step 1: Create `ImageActionMenu`**

Expose callbacks rather than APIs:

```tsx
interface ImageActionMenuProps {
  filename: string;
  isCover: boolean;
  onSetCover: () => Promise<boolean>;
  onDeleteRequest: () => void;
}
```

Compose `ResponsiveActionMenu`. Keep local `open` and `isActionPending` state. The cover button awaits `onSetCover`, closes only on success, and is disabled for the current cover. The delete button closes the menu and calls `onDeleteRequest`; it does not delete directly. Use `role="menuitem"` only for `desktop-popover`.

- [ ] **Step 2: Create `AlbumImageTile`**

Move the existing tile markup into a named default component with this callback boundary:

```tsx
interface AlbumImageTileProps {
  image: Image;
  index: number;
  dimensions: { width: number; height: number };
  coverImageId?: string;
  onSetCover: (id: string) => Promise<boolean>;
  onDeleteRequest: (image: Image) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, index: number) => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>, index: number) => void;
}
```

Preserve the existing PhotoSwipe URL fallback, dimensions, cover badge, animation, image loading, drag/drop wiring, filename, and order. Replace the inline menu with:

```tsx
<ImageActionMenu
  filename={image.filename}
  isCover={image.id === coverImageId}
  onSetCover={() => onSetCover(image.id)}
  onDeleteRequest={() => onDeleteRequest(image)}
/>
```

- [ ] **Step 3: Reduce `ImageGrid` to orchestration**

Remove tile-only icon imports, `useRef`, and the inline `AlbumImageTile`. Import the extracted tile and `ConfirmDialog`.

Add:

```tsx
const [deleteCandidate, setDeleteCandidate] = useState<Image | null>(null);
const [isDeletePending, setIsDeletePending] = useState(false);
```

Replace browser `confirm()` with a guarded mutation:

```tsx
async function handleConfirmDelete(): Promise<void> {
  if (!deleteCandidate || isDeletePending) return;

  const image = deleteCandidate;
  setIsDeletePending(true);
  try {
    await deleteImage(image.id);
    setLocalImages((current) => current.filter((item) => item.id !== image.id));
    setDeleteCandidate(null);
    toast.success('Đã xóa ảnh!');
    await onDelete();
  } catch (error) {
    console.error('Failed to delete image:', error);
    toast.error('Không thể xóa ảnh');
  } finally {
    setIsDeletePending(false);
  }
}
```

Pass `onDeleteRequest={setDeleteCandidate}` to each tile and render one shared dialog:

```tsx
<ConfirmDialog
  open={deleteCandidate !== null}
  title="Xóa ảnh?"
  description={
    <>
      Bạn có chắc chắn muốn xóa ảnh{' '}
      <strong className="font-semibold text-gray-900">
        “{deleteCandidate?.filename}”
      </strong>
      ? Hành động này không thể hoàn tác.
    </>
  }
  isPending={isDeletePending}
  onClose={() => setDeleteCandidate(null)}
  onConfirm={handleConfirmDelete}
/>
```

- [ ] **Step 4: Run the focused contract file**

Run:

```powershell
npm test --workspace frontend -- test/admin-album-image-management.contract.test.ts
```

Expected: PASS for the responsive menu, PhotoSwipe boundary, confirmation guard, background refresh, and album-delete contracts.

- [ ] **Step 5: Commit the feature integration**

```powershell
git add apps/frontend/src/app/admin/components/ImageActionMenu.tsx apps/frontend/src/app/admin/components/AlbumImageTile.tsx apps/frontend/src/app/admin/components/ImageGrid.tsx
git commit -m "feat(admin): adapt image actions for mobile"
```

### Task 4: Focused regression and build verification

**Files:**
- Modify only files required to correct failures introduced by Tasks 1–3.

- [ ] **Step 1: Run all frontend tests**

```powershell
npm test --workspace frontend
```

Expected: all frontend Node tests pass.

- [ ] **Step 2: Run frontend formatting check**

```powershell
npm run format:check --workspace frontend -- src/app/admin/components/ResponsiveActionMenu.tsx src/app/admin/components/ConfirmDialog.tsx src/app/admin/components/ImageActionMenu.tsx src/app/admin/components/AlbumImageTile.tsx src/app/admin/components/ImageGrid.tsx test/admin-album-image-management.contract.test.ts
```

Expected: all listed files satisfy Prettier. If not, run the same command with `format` and re-run the check.

- [ ] **Step 3: Run the production frontend build**

```powershell
npm run build --workspace frontend
```

Expected: Next.js production build exits successfully with no TypeScript error.

- [ ] **Step 4: Inspect the final diff**

```powershell
git diff origin/main...HEAD --check
git diff origin/main...HEAD --stat
git status --short
```

Expected: no whitespace errors, only the approved spec/plan, focused tests, and five frontend component files are changed, and the worktree is clean after commits.

- [ ] **Step 5: Commit verification-only corrections if required**

```powershell
git add apps/frontend/src/app/admin/components apps/frontend/test/admin-album-image-management.contract.test.ts
git commit -m "style(admin): finalize mobile image actions"
```

Skip this commit when no correction was necessary.
