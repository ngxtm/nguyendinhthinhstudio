# Admin Album Image Management Design

**Status:** Approved in conversation on 2026-07-24

## Context

The current admin album flow has five connected defects:

1. A successful current-policy confirmation returns a raw image row instead of the closed `consumed` response envelope expected by the frontend.
2. The full-card image action overlay receives pointer events on hover, so it blocks the underlying PhotoSwipe anchor.
3. The upload queue can stop tracking the wrong promise because it combines `Promise.race()` with `splice(0, 1)`, and the post-upload refresh replaces the whole page with a loading state.
4. The album edit page exposes no album deletion action even though the authenticated delete API already exists.
5. The pending-file upload icon is a decorative `div` with no handler, but it visually resembles a button beside the remove action.

## Goals

- A click on an album image opens the existing full-screen PhotoSwipe viewer with zoom and previous/next navigation.
- Cover and delete actions remain available without covering or blocking the image.
- A completed upload batch waits for every tracked job, then refreshes album data without blanking or unmounting the image section.
- The edit page allows an administrator to delete the current album with confirmation and clear feedback.
- The queued-file row contains no control-looking element that has no action.
- Preserve current authentication, upload policy, stored-image inspection, deletion, cover, and reorder behavior.

## Non-goals

- No dedicated image-detail route.
- No replacement of PhotoSwipe or the current uploader architecture.
- No optimistic image contract expansion from `void` to a returned image object.
- No backend deletion redesign or unrelated album form refactor.
- No rollout, Phase 9, cutover, or requalification work.

## Chosen Design

### 1. Confirm-upload response contract

After `settleCopyResponseAndCommit()` completes, `ImagesService.confirmUploadWithInspection()` must return the durable upload-session representation through `getUploadStatus()`. The success response therefore has `outcome: "consumed"`, the retained result image, and the existing result metadata instead of a raw database image row.

This keeps retries and concurrent winners aligned with the persisted session state and allows the frontend workflow to reach its success path.

### 2. Image viewer and actions

Keep the existing PhotoSwipe anchor and gallery initialization.

Remove the full-image action overlay. The image itself remains the primary click target and always opens PhotoSwipe. Keep the small `Cover` badge as read-only state.

Place one `MoreVertical` (`⋮`) button in the card footer beside the filename/order information. It opens a compact menu with:

- `Đặt làm ảnh bìa`, or a disabled `Đang là ảnh bìa` state for the current cover.
- `Xóa ảnh` in destructive styling, using the existing confirmation and delete flow.

The menu button and items stop propagation so they never open the lightbox. The menu exposes `aria-haspopup`, `aria-expanded`, and clear labels; it closes after an action, on Escape, and when focus/click moves outside. Existing drag-and-drop behavior remains in scope, but the menu must not initiate a drag.

### 3. Upload completion and background refresh

Replace the current promise-array bookkeeping with two fixed workers consuming the queued items. Each queued upload is awaited exactly once, regardless of completion order. The batch summary is emitted only after both workers finish.

Change `onUploadComplete` to allow a promise and await it after at least one successful upload. The album detail page performs a background reload that does not set the initial-page `loading` state, so the existing image grid stays mounted until fresh album data replaces it.

Initial page loading still shows the current loading screen. A failed background refresh keeps the existing album and images visible and shows an error toast.

### 4. Delete album from edit page

Add a destructive `Xóa album` action to the edit page using the existing authenticated `deleteAlbum(album.id)` API.

The action:

1. asks for explicit confirmation using the album title;
2. disables save and delete actions while deletion is running;
3. shows a success toast and uses `router.replace('/admin/albums')` after success;
4. restores controls and shows an error toast if deletion fails.

No backend changes are required for this UI action.

### 5. Queued-file status icon

Remove the decorative pending `Upload` icon beside the file removal button. The existing `Sẵn sàng` progress text and the main `Upload N ảnh` button already communicate the available action.

Keep the spinner, success, and error status icons because they represent real state rather than an action.

## Data Flow

1. The browser validates and normalizes the source, presigns, uploads to R2, and confirms.
2. The backend commits the promotion and returns the durable `consumed` envelope.
3. Each upload worker records success or failure and waits for its next queued item.
4. After all workers finish, the upload zone awaits one background album refresh.
5. The album detail page replaces its album state without unmounting the current grid.
6. Clicking an image opens PhotoSwipe; clicking `⋮` opens only the action menu.

## Error Handling

- Upload failures stay attached to their individual queued files and remain retryable.
- A background album refresh failure does not clear already displayed images.
- Cover and image deletion failures keep the menu/card state intact and show the existing Vietnamese error feedback.
- Album deletion failure keeps the user on the edit page.
- The confirm endpoint continues to use existing closed outcomes for failed, gone, deleted, unavailable, finalizing, and retryable sessions.

## Verification Design

Focused regression coverage will prove:

- current promotion confirmation returns `outcome: "consumed"`, not a raw image;
- image clicks are not intercepted by an action overlay and the PhotoSwipe data attributes remain present;
- the upload queue waits for out-of-order completions and calls completion refresh once;
- background refresh does not switch the detail page back to initial loading;
- the edit page contains a working, guarded delete flow;
- no pending-file icon is rendered as a false control;
- existing image-upload unit, admin workflow contract, build, cover, delete, and reorder behavior remain green.

## Expected Files

- `apps/backend/src/images/images.service.ts`
- `apps/backend/src/images/images.service.spec.ts`
- `apps/frontend/src/app/admin/components/ImageGrid.tsx`
- `apps/frontend/src/app/admin/components/ImageUploadZone.tsx`
- `apps/frontend/src/app/admin/albums/[id]/page.tsx`
- `apps/frontend/src/app/admin/albums/[id]/edit/page.tsx`
- focused frontend contract tests, with a small queue helper/test only if needed for deterministic concurrency coverage

## Acceptance Criteria

- Clicking any non-menu area of an image opens the PhotoSwipe lightbox.
- The card has no full-image action overlay; cover/delete are accessible through the footer `⋮` menu.
- Successful uploads appear after one non-blocking refresh without the image section disappearing.
- A batch does not finish while any tracked upload is still running.
- An administrator can delete the current album from the edit page and is redirected after success.
- The pending-file row has no inert upload glyph beside the remove button.
