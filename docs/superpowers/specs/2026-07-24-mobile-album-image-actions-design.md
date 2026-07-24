# Mobile Album Image Actions Design

**Status:** Approved in conversation on 2026-07-24

## Context

The merged album gallery already responds to phone widths and shows one large image per row on common mobile viewports. The remaining mobile usability problem is the footer `⋮` action menu: it is an anchored desktop popover with a small trigger and compact rows, so it is difficult to tap and can sit too close to or outside the phone viewport.

This change is limited to the image action interaction. It does not redesign the masonry gallery, PhotoSwipe viewer, uploader, album forms, backend APIs, or upload policy.

## Goals

- Keep one large image per row on phone layouts and preserve image taps as the PhotoSwipe entry point.
- Keep the current anchored popover on desktop.
- Present the same actions as a bottom action sheet on mobile.
- Make the `⋮` trigger and every action a reliable touch target.
- Preserve cover, delete, reorder, refresh, toast, and pending-state behavior.
- Separate reusable interaction primitives from image-specific behavior without creating a broad admin UI rewrite.

## Non-goals

- No masonry breakpoint redesign.
- No touch-based image reordering.
- No backend or API contract changes.
- No replacement of PhotoSwipe.
- No migration of every existing admin modal in this change.
- No rollout, Phase 9 audit, cutover smoke, or requalification work.

## Chosen Design

### Responsive behavior

At widths below the existing `md` breakpoint, activating `⋮` opens a fixed action sheet from the bottom of the viewport. It includes a dimmed backdrop, rounded top corners, viewport-safe horizontal spacing, and bottom padding that accounts for `env(safe-area-inset-bottom)`.

At `md` and wider, the same trigger keeps an anchored popover beside the image footer. Both presentations use the same image-specific action definitions and callbacks so their labels, disabled states, and pending behavior cannot drift.

The trigger is at least 44 by 44 CSS pixels. Each action row is at least 48 pixels high. The mobile sheet is constrained to the viewport and does not depend on the masonry card's stacking or overflow context.

### Image actions

The menu contains:

- `Đặt làm ảnh bìa` when the image is not the cover.
- Disabled `Đang là ảnh bìa` when the image is already the cover.
- `Xóa ảnh` using destructive red styling.

Selecting cover invokes the existing `onSetCover(image.id)` flow. During the request, repeated actions are disabled; success closes the menu and existing error handling remains visible.

Selecting delete closes the action surface and opens one explicit confirmation dialog containing the filename. Confirming invokes the existing delete API, removes the deleted image from local state, and performs the existing background refresh. Cancelling changes nothing.

The action surface closes on backdrop/outside activation, Escape, or a completed action. Focus moves into the mobile sheet when it opens and returns to the `⋮` trigger when it closes. Opening or using the action menu never opens PhotoSwipe or initiates a drag.

## Component Boundaries

Clean Architecture here means separating presentation mechanics from album-image use cases while avoiding generic abstractions that do not yet have a real consumer.

### `ResponsiveActionMenu`

A reusable UI primitive responsible only for:

- controlled open/close state;
- the `md` presentation switch;
- desktop popover positioning;
- mobile backdrop, bottom sheet, safe-area padding, and portal;
- Escape/outside closing and focus restoration;
- accessible menu/dialog semantics.

It knows nothing about images, covers, deletion, or APIs. Its public interface accepts a trigger, accessible label, and action content.

### `ImageActionMenu`

A domain UI component responsible for translating image state into actions:

- cover label and disabled state;
- destructive delete request;
- action-level pending state;
- icons and Vietnamese labels.

It receives callbacks and never imports the API client. It composes `ResponsiveActionMenu`.

### `ConfirmDialog`

A small reusable destructive-confirmation primitive accepting title, message/content, confirm label, pending state, and callbacks. It provides the shared modal mechanics and does not encode category, album, or image rules.

The existing category-specific `DeleteConfirmModal` remains unchanged in this scoped fix. Future callers can migrate separately when useful.

### `AlbumImageTile`

Extract the tile from `ImageGrid.tsx` so it owns image rendering, PhotoSwipe attributes, footer layout, drag bindings, and composition of `ImageActionMenu`. It receives data and callbacks; it does not call backend APIs.

### `ImageGrid`

Remain the orchestration boundary for this feature:

- gallery state and PhotoSwipe registration;
- image dimensions and ordering;
- cover callback coordination;
- the selected image awaiting deletion;
- one shared confirmation dialog;
- existing delete API call, local removal, toast, and refresh callback.

Only one delete confirmation exists for the whole grid, rather than rendering a modal for every tile.

## State and Data Flow

1. The tile asks `ImageActionMenu` to open for its image.
2. `ResponsiveActionMenu` chooses bottom sheet on mobile or popover on desktop.
3. A cover selection calls the supplied cover callback and reflects pending state locally.
4. A delete selection reports the image to `ImageGrid` and closes the action menu.
5. `ImageGrid` opens the shared `ConfirmDialog`.
6. Confirmation calls the existing deletion flow; success updates local images and refreshes album data.
7. Cancel or failure leaves the image visible; failure retains existing Vietnamese toast feedback.

## Accessibility and Interaction Rules

- The `⋮` control has an image-specific accessible name and a minimum 44px touch target.
- The action surface exposes its expanded state and correct menu/dialog relationship.
- Disabled cover state remains readable but cannot be activated.
- The destructive action is communicated with both text and color.
- Mobile focus is contained while the sheet is active, Escape closes it, and focus returns to the trigger.
- Background page scrolling is locked only while the mobile sheet is open.
- Reduced-motion preferences disable or shorten the sheet transition.
- The sheet and confirmation dialog render above gallery and PhotoSwipe-adjacent stacking contexts without changing PhotoSwipe itself.

## Focused Verification Design

Keep verification proportional to this small UI change:

- A focused component/contract test proves the mobile sheet and desktop popover share the same action labels and disabled cover semantics.
- A focused interaction test proves delete requires confirmation and cancel does not call deletion.
- A focused interaction test proves confirm calls deletion once and pending state prevents duplicate actions.
- Existing album image management contract coverage continues to prove the PhotoSwipe anchor, cover, delete, and reorder wiring remains present.
- A frontend type/build check catches component-boundary and Tailwind/JSX regressions.

No broad requalification or production rollout suite is part of this change.

## Expected Files

- `apps/frontend/src/app/admin/components/ImageGrid.tsx`
- `apps/frontend/src/app/admin/components/AlbumImageTile.tsx`
- `apps/frontend/src/app/admin/components/ImageActionMenu.tsx`
- `apps/frontend/src/app/admin/components/ResponsiveActionMenu.tsx`
- `apps/frontend/src/app/admin/components/ConfirmDialog.tsx`
- `apps/frontend/test/admin-album-image-management.contract.test.ts`
- a focused component interaction test only if the current test harness supports DOM interaction without adding a large dependency

## Acceptance Criteria

- On common phone widths, the gallery remains one large image per row.
- On mobile, `⋮` opens a bottom action sheet that fits within the viewport and safe area.
- On desktop, `⋮` opens the existing-style anchored popover.
- Trigger and action rows meet the mobile touch-target sizes.
- Cover state, cover mutation, delete confirmation, delete mutation, toasts, and refresh behavior remain correct.
- Image taps still open PhotoSwipe; menu interactions do not open PhotoSwipe or begin dragging.
- Presentation primitives contain no album-image API or business rules.
- `ImageGrid.tsx` is reduced to gallery orchestration rather than continuing to accumulate tile and responsive-overlay implementation details.
