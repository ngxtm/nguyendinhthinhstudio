# Staff Table Balanced Layout Design

**Date:** 2026-07-26

**Status:** Approved for specification review

## Goal

Make the Admin staff table visually balanced across the available content width without restoring a large unused trailing area or shrinking the table to its minimum content width.

## Layout

The staff page continues to use the Admin layout's existing `max-w-7xl` content container. The page header and staff table both occupy the full width of that container so their left and right edges align.

The table wrapper uses `w-full` with horizontal overflow. The table uses `w-full`, a practical minimum width for smaller screens, and fixed table layout so surplus width is distributed through intentional columns rather than appearing as an empty block after the actions column.

Column proportions are:

- Employee: 26%
- Contact: 26%
- Role: 18%
- Status: 16%
- Actions: 14%

Employee and contact cells retain their existing minimum widths and non-wrapping behavior. Actions remain right-aligned.

## Responsive Behavior

On desktop, the table fills the available Admin content area and aligns with the “Thêm nhân viên” button. On narrow screens, the minimum table width triggers horizontal scrolling inside the bordered table wrapper.

No changes are required to staff data, API calls, dialogs, or deletion behavior.

## Testing

Update the existing staff table source-contract test to verify the full-width wrapper, full-width fixed table, minimum responsive width, and explicit column proportions. Run the focused staff layout test and the full frontend test suite.
