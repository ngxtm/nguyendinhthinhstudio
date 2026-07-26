# Staff Table Balanced Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Admin staff table fill the existing content container with balanced column proportions while retaining horizontal scrolling on narrow screens.

**Architecture:** Keep the page inside the shared Admin `max-w-7xl` container. Change only the staff table wrapper, table sizing, and header column widths; preserve all staff CRUD and confirmation behavior.

**Tech Stack:** Next.js, React, Tailwind CSS, Node `node:test` source-contract tests.

---

## File Structure

- Modify: `apps/frontend/test/admin-staff-table-layout.test.ts` — specify the balanced full-width table contract.
- Modify: `apps/frontend/src/app/admin/staff/page.tsx` — apply the full-width wrapper, responsive table minimum, fixed layout, and column proportions.

### Task 1: Balance the staff table across the Admin content width

**Files:**
- Modify: `apps/frontend/test/admin-staff-table-layout.test.ts`
- Modify: `apps/frontend/src/app/admin/staff/page.tsx`

- [ ] **Step 1: Replace the current shrink-to-content assertion with the desired layout contract**

Use these assertions in the existing test:

```ts
test('staff table fills the content area with balanced responsive columns', () => {
  assert.match(
    source,
    /<div className="w-full overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">/
  )
  assert.match(
    source,
    /<table className="w-full min-w-\[48rem\] table-fixed divide-y divide-gray-200">/
  )
  assert.match(source, /<th className="w-\[26%\][^"]*">\s*Nhân viên\s*<\/th>/)
  assert.match(source, /<th className="w-\[26%\][^"]*">\s*Liên hệ\s*<\/th>/)
  assert.match(source, /<th className="w-\[18%\][^"]*">\s*Vai trò\s*<\/th>/)
  assert.match(source, /<th className="w-\[16%\][^"]*">\s*Trạng thái\s*<\/th>/)
  assert.match(source, /<th className="w-\[14%\][^"]*">\s*Thao tác\s*<\/th>/)
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run from `apps/frontend`:

```powershell
npm run test:focused -- test/admin-staff-table-layout.test.ts
```

Expected: FAIL because the wrapper still uses `w-fit max-w-full`, the table still uses intrinsic width, and the header columns do not have percentage widths.

- [ ] **Step 3: Implement the balanced layout**

Change the table wrapper and table:

```tsx
<div className="w-full overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
  <table className="w-full min-w-[48rem] table-fixed divide-y divide-gray-200">
```

Apply these width classes to the five header cells while keeping their existing padding, typography, and alignment classes:

```tsx
<th className="w-[26%] ...">Nhân viên</th>
<th className="w-[26%] ...">Liên hệ</th>
<th className="w-[18%] ...">Vai trò</th>
<th className="w-[16%] ...">Trạng thái</th>
<th className="w-[14%] ...">Thao tác</th>
```

Keep the employee/contact cell minimum widths, non-wrapping content, status badge, and right-aligned actions unchanged.

- [ ] **Step 4: Format and verify GREEN**

Run from `apps/frontend`:

```powershell
npx prettier --write src/app/admin/staff/page.tsx test/admin-staff-table-layout.test.ts
npm run test:focused -- test/admin-staff-table-layout.test.ts
npm run test:focused -- test/admin-delete-confirmation.contract.test.ts
```

Expected: both focused suites PASS.

- [ ] **Step 5: Run regression verification**

Run from `apps/frontend`:

```powershell
npm test
```

Expected: all frontend tests PASS.

Run from the repository root:

```powershell
git diff --check
```

Expected: no whitespace errors introduced by these two files.
