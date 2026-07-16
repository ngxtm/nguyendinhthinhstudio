#> **Completion status — 2026-07-16:** CLOSED theo pham vi rollout duoc operator chap nhan. Checkbox `[x]` co the la da thuc thi hoac da duoc dong bang waiver/defer; xem bang chung va accepted risk trong Phase 7/8.

 Prisma Image Storage Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Lam migration rename `cloudflareImageId` thanh `r2ObjectKey` duoc Prisma backend phat hien va tai lap tren moi database.

**Architecture:** Chi `apps/backend/prisma` la canonical Prisma tree. Migration da duoc Prisma apply khong bao gio bi sua noi dung vi checksum la immutable. Ket qua audit `_prisma_migrations` va column state quyet dinh `migrate deploy` hay `migrate resolve`.

**Tech Stack:** Prisma 6, PostgreSQL, Supabase, SQL.

---

### Task 1: Audit migration state truoc thay doi

- [x] **Step 1: Backup database production**

Tao Supabase backup/snapshot co timestamp va xac nhan co the restore vao staging.

- [x] **Step 2: Kiem tra column hien tai**

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'Image'
  AND column_name IN ('cloudflareImageId', 'r2ObjectKey');
```

Expected production hien tai: chi co `r2ObjectKey`.

- [x] **Step 3: Kiem tra Prisma migration history**

```sql
SELECT migration_name, checksum, finished_at, rolled_back_at
FROM "_prisma_migrations"
ORDER BY started_at;
```

Ghi lai migration `20260301000000_rename_cloudflare_to_r2` da/khong duoc track va checksum production neu co.

- [x] **Step 4: Tinh checksum file local va doi chieu**

```powershell
$migration = 'prisma/migrations/20260301000000_rename_cloudflare_to_r2/migration.sql'
(Get-FileHash -Algorithm SHA256 $migration).Hash.ToLowerInvariant()
```

Neu migration da tracked, local SHA-256 phai khop chinh xac `_prisma_migrations.checksum`. Neu khong khop, dung rollout va lay lai exact file tu deployment artifact/git commit da tao migration; khong `resolve`, khong sua checksum trong database.

### Task 2: Dua migration vao canonical tree ma khong doi checksum

**Files:**

- Move: `prisma/migrations/20260301000000_rename_cloudflare_to_r2/migration.sql`
- To: `apps/backend/prisma/migrations/20260301000000_rename_cloudflare_to_r2/migration.sql`
- Verify: `apps/backend/prisma/schema.prisma:95-109`

- [x] **Step 1: Move verified migration byte-for-byte**

```sql
ALTER TABLE "Image" RENAME COLUMN "cloudflareImageId" TO "r2ObjectKey";
```

Khong them guard/idempotent wrapper vao file co ten `20260301000000_rename_cloudflare_to_r2`. Neu production da track migration, file sau move phai giu dung bytes da khop checksum o Task 1; khong duoc mac dinh root file la ban production neu chua doi chieu.

- [x] **Step 2: Xoa duplicate migration tree tai root sau khi move**

Chi xoa file migration duplicate; khong xoa root schema/config trong phase nay neu con command khac tham chieu.

- [x] **Step 3: Validate Prisma schema**

```powershell
npx prisma validate --schema apps/backend/prisma/schema.prisma
npx prisma generate --schema apps/backend/prisma/schema.prisma
```

Expected: ca hai command exit 0.

### Task 3: Chon action theo migration history

Truoc moi branch, xac nhan khong co migration cu nao trong canonical tree dang untracked mot cach bat ngo. `migrate deploy` chi duoc chay khi tat ca migration truoc rename da tracked hoac da duoc baseline co chu dich sau khi schema clone duoc audit.

- [x] **Step 1: Neu migration da co trong `_prisma_migrations`**

Chay:

```powershell
npx prisma migrate status --schema apps/backend/prisma/schema.prisma
```

Expected: migration recognized as applied. Neu Prisma bao modified checksum, dung rollout va khoi phuc exact SQL da tao checksum trong production; khong chay `resolve` de che checksum mismatch.

- [x] **Step 2: Neu migration chua tracked nhung production da co `r2ObjectKey`**

Schema da duoc rename thu cong, nen khong execute ALTER TABLE lan hai. Sau khi backup va verify column/data:

```powershell
npx prisma migrate resolve --applied 20260301000000_rename_cloudflare_to_r2 --schema apps/backend/prisma/schema.prisma
npx prisma migrate status --schema apps/backend/prisma/schema.prisma
```

Expected: migration duoc record applied voi checksum cua original file va schema status up to date.

- [x] **Step 3: Neu migration chua tracked va van co `cloudflareImageId`**

```powershell
npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma
npx prisma migrate status --schema apps/backend/prisma/schema.prisma
```

Expected: ALTER TABLE chay mot lan, column/data duoc rename va migration duoc tracked.

### Task 4: Test tren pre-rename baseline va production clone

- [x] **Step 1: Restore mot pre-rename backup vao staging database**

Baseline phai co day du app tables, `Image.cloudflareImageId`, chua co `Image.r2ObjectKey`, va giu nguyen `_prisma_migrations` history cua thoi diem backup. Repo hien khong co initial schema migration, nen empty database verification nam ngoai scope cua migration rename nay.

Audit migration `20251023120000_multi_category_albums`: neu schema da co `AlbumCategory`/da drop `Album.categoryId` nhung history khong track migration nay, dung test va baseline no bang `prisma migrate resolve --applied` chi sau khi SQL/schema comparison chung minh thay doi da ton tai. Khong chay blind `migrate deploy` tren clone co history khong ro.

- [x] **Step 2: Chay untracked/old-column branch tren pre-rename baseline**

```powershell
npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma
npx prisma migrate status --schema apps/backend/prisma/schema.prisma
```

Expected: cac migration truoc rename da tracked/baselined dung state; column duoc rename mot lan, data duoc giu nguyen, status `Database schema is up to date`.

- [x] **Step 3: Restore production backup va chay dung tracked/untracked branch**

Expected: tracked migration duoc nhan dien ma khong doi checksum, hoac manual rename duoc ghi nhan bang `migrate resolve` ma khong execute ALTER TABLE.

- [x] **Step 4: Build backend voi generated client moi**

```powershell
npm run build --workspace=backend
npm test --workspace=backend -- --runInBand
```

Expected: build/test exit 0.

- [x] **Step 5: Commit phase**

```powershell
git add apps/backend/prisma prisma/migrations
git commit -m "fix(prisma): track R2 image column migration in backend"
```

## Acceptance criteria

- Backend `migrate:deploy` phat hien migration.
- Applied migration giu nguyen checksum.
- Local SHA-256 duoc doi chieu truc tiep voi `_prisma_migrations.checksum`; khong tin root file theo gia dinh.
- Pre-rename baseline va post-rename production clone deu migrate thanh cong.
- Khong mat gia tri legacy dang nam trong `r2ObjectKey`.
- Production backup da duoc tao va restore test truoc deploy.
