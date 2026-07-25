# Admin Delete Confirmation Dialog Design

**Date:** 2026-07-26

**Status:** Approved for specification review

## Goal

Replace every browser-native deletion confirmation in the Admin UI with the shared `ConfirmDialog` component. This includes employee deletion, album deletion from the list and edit views, and bulk removal of categories or tags from albums.

## Scope

The affected native confirmation calls are:

- `src/app/admin/staff/page.tsx`: delete an employee.
- `src/app/admin/albums/page.tsx`: delete an album from the list.
- `src/app/admin/albums/[id]/edit/page.tsx`: delete the open album.
- `src/app/admin/categories/page.tsx`: bulk-remove a category from its assigned albums.
- `src/app/admin/tags/page.tsx`: bulk-remove a tag from its assigned albums.

No backend API, data model, or deletion endpoint changes are required.

## Shared Dialog

Reuse `src/app/admin/components/ConfirmDialog.tsx` as the one shared simple destructive-confirmation primitive. Its existing API provides the required accessible Headless UI dialog, custom title and description, pending state, cancel action, and asynchronous confirmation action.

Do not create another general confirmation component. `DeleteConfirmModal.tsx` remains the specialised modal for category and tag dependency information, including the affected-album list. Its bulk-remove action will open the shared `ConfirmDialog` before the destructive request runs.

## Interaction Model

Each simple delete flow owns:

- A selected delete candidate, initially `null`.
- A pending flag for the outgoing deletion request.
- A request handler that only opens the dialog.
- A confirm handler that checks the candidate and pending state before calling the existing API.

Clicking a trash action opens the dialog and includes the affected name or album count in Vietnamese. Clicking **Hủy**, the close control, the overlay, or Escape closes the dialog when no request is pending. Clicking the destructive action calls the current API only after confirmation.

During a request, the confirm dialog disables dismissal and both action buttons. On success, the owner clears the candidate, closes the dialog, refreshes or updates the existing list, and shows the existing success toast. On failure, the owner shows the existing error toast and leaves the candidate/dialog available for a retry.

## Page-Specific Flows

### Employees

The staff page will store the selected `Staff` record when its trash button is clicked. The dialog title and description identify that employee and warn that the action cannot be undone. Confirmation calls `deleteStaff`, reloads the staff list, and then clears the selected record.

### Albums

The album-list page will retain the selected `Album`, rather than immediately deleting by ID. Confirmation deletes that candidate, removes it from local list state, and clears the candidate.

The album edit page will open a dialog for its loaded album. Confirmation retains the current redirect to `/admin/albums` after a successful deletion. A failed request restores the non-pending state and leaves the dialog open.

### Categories and Tags

`DeleteConfirmModal` remains the initial modal for an in-use category or tag. Pressing its bulk-remove button opens the shared `ConfirmDialog` with the category/tag name and affected album count.

The specialised modal will only execute the supplied bulk-remove handler after that second confirmation. It will keep the common confirmation open until the async operation resolves. On success it closes that confirmation and retains the specialised modal long enough for the page to refresh its usage data; on failure it keeps the confirmation available for retry and relies on the existing error toast. Its close behavior will also respect the pending state.

## Accessibility and UI

`ConfirmDialog` already supplies `Dialog.Title`, `Dialog.Description`, a labelled close button, semantic buttons, focus management, backdrop support, and motion-safe transitions. All new calls will supply clear Vietnamese labels such as **Xóa nhân viên**, **Xóa album**, and **Xóa hàng loạt**.

The browser-native `window.confirm` and global `confirm` calls in the scoped Admin files will be removed entirely.

## Testing

The frontend uses Node's built-in test runner with source-contract tests for this UI area. Add a focused test that verifies:

- Each scoped Admin flow imports and renders or invokes the reusable `ConfirmDialog`.
- The staff confirmation handler defers `deleteStaff` until a selected candidate is confirmed.
- The existing native `confirm`/ `window.confirm` calls are absent from all five scoped source files.
- The category/tag specialised bulk-delete modal delegates confirmation to `ConfirmDialog`.

Run the focused test, the full frontend test suite, formatting/type checks that apply, and a production frontend build if the environment allows it.
