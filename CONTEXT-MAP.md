# Context Map

## Contexts

- [Staff Attendance](./CONTEXT.md) — defines shifts and employee attendance language for Staff Portal.
- [Public Gallery](./apps/frontend/CONTEXT.md) — presents published photography albums through indexable gallery and category pages.

## Relationships

- **Public Gallery → Albums API**: the public site reads published albums and gallery categories from the backend; Admin owns category structure and album assignments.
- **Staff Attendance ↔ Public Gallery**: the contexts share the monorepo and authentication infrastructure but do not share domain language.
