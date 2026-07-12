# Cloudflare Images Cleanup Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xoa Cloudflare Images code, config, data fields va assets chi sau khi R2 + imgproxy da on dinh va rollback window ket thuc.

**Architecture:** Cleanup theo hai commit: repo contract cleanup truoc, destructive provider cleanup sau. Database schema changes la roll-forward migrations; Cloudflare originals chi xoa sau final inventory reconciliation.

**Tech Stack:** TypeScript, Prisma, Next.js, Cloudflare Images API.

---

### Task 1: Prove cleanup preconditions

- [ ] **Step 1: Confirm production observation complete**

Require signed go decision tu phase 07 va it nhat 7 ngay production stable.

- [ ] **Step 2: Reconcile database**

```sql
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE "r2ObjectKey" LIKE 'albums/%') AS r2,
  COUNT(*) FILTER (WHERE "mediumUrl" LIKE '%imagedelivery.net%') AS legacy_urls
FROM "Image"
WHERE "uploadStatus" = 'completed';
```

Expected: total = r2. `legacy_urls` co the con de rollback nhung public API khong su dung chung.

- [ ] **Step 3: Re-run the DB-backed full production URL audit**

Dung `audit-production-image-urls.ts` va operator-only read-only `IMAGE_AUDIT_DATABASE_URL` tu phase 07, khong thay bang public album pagination. Expected: observed unique count bang independent completed-row count, 100% imgproxy host, 0 invalid key va 0 non-200.

### Task 2: Remove provider-specific code and contracts

**Files:**

- Verify absent: `apps/backend/src/images/cloudflare.service.ts` (deleted in phase 02)
- Modify: `apps/backend/src/images/dto/upload-confirm.dto.ts`
- Modify: `apps/frontend/src/lib/api/albums.ts`
- Modify: `apps/frontend/src/lib/api/images.ts`
- Modify: `apps/frontend/src/config/images.ts`
- Modify: `apps/frontend/next.config.mjs`
- Modify: `.env.example`
- Modify: comments in backend Prisma/image services/controllers

- [ ] **Step 1: Search all Cloudflare Images references**

```powershell
rg -n "Cloudflare Images|cloudflareImageId|CLOUDFLARE_IMAGES|imagedelivery\.net" . `
  -g '!package-lock.json' -g '!docs/superpowers/plans/**'
```

- [ ] **Step 2: Verify the dead service stays removed and delete remaining provider-specific DTO/type fields**

`apps/backend/src/images/cloudflare.service.ts` da bi xoa o phase 02 de mock mode va long-running Cloudflare credentials khong ton tai trong runtime. Verify file van absent va khong recreate no; phase 05/08 tooling dung isolated migration modules/scripts.

Khong xoa `CLOUDFLARE_R2_BUCKET_NAME` trong task nay; do la R2 bucket config, khong phai Cloudflare Images API.
Khong revoke/xoa `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_IMAGES_READ_TOKEN` hoac cleanup-only `CLOUDFLARE_IMAGES_DELETE_TOKEN` khoi operator secret store trong task nay; destructive cleanup script o Task 4 van can chung. Long-running backend container khong duoc nhan cac bien migration-only nay.

- [ ] **Step 3: Remove `imagedelivery.net` remote pattern**

Chi giu local assets va/hoac `img.ndtstudio.site`.

- [ ] **Step 4: Update comments/docs to R2/imgproxy terminology**

Khong de lai Cloudflare webhook/upload wording trong runtime code.

- [ ] **Step 5: Build/test and commit**

```powershell
npm test --workspace=backend -- --runInBand
npm run build --workspace=backend
npm run build --workspace=frontend
git add apps .env.example
git commit -m "refactor(images): remove Cloudflare Images contracts"
```

Expected: commands exit 0.

### Task 3: Remove legacy URL columns after extended stability

**Files:**

- Modify: `apps/backend/prisma/schema.prisma`
- Create: `apps/backend/prisma/migrations/20260712000200_remove_legacy_image_urls/migration.sql`
- Modify: `apps/backend/src/images/image-presenter.service.ts`
- Modify: `apps/backend/src/images/images.service.ts`
- Modify: `apps/frontend/src/lib/api/albums.ts`

- [ ] **Step 1: Extend observation before destructive schema change**

Wait them 7 ngay sau code cleanup, tong cong toi thieu 14 ngay sau cutover.

- [ ] **Step 2: Backup DB and export legacy URL mapping**

Export `Image.id` va five legacy URL fields vao encrypted operator backup.

- [ ] **Step 3: Drop legacy URL columns only if presenter no longer reads them**

Columns:

```text
thumbnailUrl
smallUrl
mediumUrl
largeUrl
xlargeUrl
```

Neu API contract van can ten field, presenter tra computed fields khong can Prisma columns.

- [ ] **Step 4: Deploy migration on staging clone then production**

```powershell
npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma
npm run build --workspace=backend
```

Expected: migration/build pass va public API van tra five computed URL fields.

- [ ] **Step 5: Commit schema cleanup**

```powershell
git add apps/backend/prisma apps/backend/src
git commit -m "refactor(images): remove legacy stored delivery URLs"
```

### Task 4: Delete Cloudflare originals and cancel service

**Files:**

- Create: `apps/backend/src/images/migrations/cloudflare-cleanup.ts`
- Create: `apps/backend/src/images/migrations/cloudflare-cleanup.spec.ts`
- Create: `apps/backend/scripts/delete-migrated-cloudflare-images.ts`
- Modify: `apps/backend/package.json`

- [ ] **Step 1: Reconcile managed inventories without assuming account-wide ownership**

Build the managed delete set as the union of:

```text
ImageStorageMigration rows with status IN (verified, skipped_deleted)
ImageObjectDeletion rows with provider=cloudflare_legacy,status=deferred
CloudflareStaticAssetMigration rows with cloudflareDeletedAt IS NULL
```

Require no duplicate Cloudflare ID across the union. Fetch account inventory and report managed-present, managed-missing and unmanaged IDs. Only managed IDs may be deleted; account-wide original count is not required to equal the album migration count, and unmanaged IDs must remain untouched.

- [ ] **Step 2: Add dry-run and execute commands**

```json
{
    "images:cloudflare:delete:dry-run": "tsx scripts/delete-migrated-cloudflare-images.ts --dry-run",
    "images:cloudflare:delete": "tsx scripts/delete-migrated-cloudflare-images.ts --execute"
}
```

Dry-run selects the three managed sources above. Report source kind, legacy ID, target location, hashes/sizes and last verification time; khong goi delete API.

- [ ] **Step 3: Re-verify every target within 24 hours of deletion**

Dynamic Image row con active: `HeadObject` + streamed SHA-256 phai khop journal, medium imgproxy URL phai tra 200/image. Intentionally deleted Image: require Image row absent plus `ImageStorageMigration.status=skipped_deleted` hoac matching completed `ImageObjectDeletion` checkpoint; target R2 object phai absent. Static asset: local checked-in file SHA-256 phai khop manifest, deployed production URL phai tra 200/image, va update `CloudflareStaticAssetMigration.deployedVerifiedAt`.

Delete command reject row co verification cu hon 24 gio, hash mismatch, missing target, non-200 imgproxy/static URL, hoac journal state ambiguous. Count reconciliation mot minh khong duoc phep xoa original.

- [ ] **Step 4: Test and commit destructive tooling before execution**

```powershell
npm test --workspace=backend -- cloudflare-cleanup.spec.ts --runInBand
git add apps/backend/src/images/migrations apps/backend/scripts/delete-migrated-cloudflare-images.ts apps/backend/package.json
git commit -m "chore(images): add checkpointed Cloudflare cleanup tooling"
```

Expected: dry-run performs zero delete calls; stale/missing/hash-mismatch targets perform zero delete calls; retries never delete/checkpoint the same journal row twice.

- [ ] **Step 5: Delete Cloudflare originals in small batches**

```powershell
npm run images:cloudflare:delete:dry-run --workspace=backend
npm run images:cloudflare:delete --workspace=backend -- --limit=5
```

Dung `CLOUDFLARE_IMAGES_DELETE_TOKEN` rieng, chi cap read/delete trong cleanup window. Sau moi successful/idempotent Cloudflare API deletion, transaction update dung source journal: dynamic journal `status=cloudflare_deleted` va `cloudflareDeletedAt=now`; deletion queue `status=deleted` va `deletedAt=now`; static journal `cloudflareDeletedAt=now`. Retry phai skip rows da checkpoint. Sau moi batch, verify production galleries va static homepage assets van 100% HTTP 200.

- [ ] **Step 6: Revoke Cloudflare Images API tokens**

Revoke ca read migration token va cleanup delete token. Khong revoke R2 credentials dang duoc backend/imgproxy su dung.

- [ ] **Step 7: Cancel Cloudflare Images subscription and archive report**

Ghi timestamp, counts va nguoi thuc hien vao deployment/change log.

### Task 5: Remove migration journal after provider cleanup

**Files:**

- Modify: `apps/backend/prisma/schema.prisma`
- Create: `apps/backend/prisma/migrations/20260712000300_remove_cloudflare_migration_journals/migration.sql`
- Delete: `apps/backend/.env.migration.example`

- [ ] **Step 1: Verify every journal row reached final state**

```sql
SELECT status, COUNT(*)
FROM "ImageStorageMigration"
GROUP BY status;
```

Expected: tat ca rows co `status = cloudflare_deleted` va `cloudflareDeletedAt IS NOT NULL`.

Dong thoi require moi `CloudflareStaticAssetMigration` co `cloudflareDeletedAt IS NOT NULL` va moi `ImageObjectDeletion` co `provider=cloudflare_legacy` dat `status=deleted`, `deletedAt IS NOT NULL`. `ImageObjectDeletion` table van duoc giu cho R2 deletion queue thuong xuyen.

- [ ] **Step 2: Export encrypted final journal and backup DB**

Final journal export la mapping cuoi cung giua Cloudflare ID va R2 key; verify backup restore truoc khi drop table.

- [ ] **Step 3: Drop completed migration-only models through a roll-forward migration**

Drop `ImageStorageMigration` va `CloudflareStaticAssetMigration`; khong drop `ImageObjectDeletion`. Deploy tren staging clone, run backend build/tests, sau do moi deploy production.

- [ ] **Step 4: Commit journal cleanup**

```powershell
git add apps/backend/prisma apps/backend/.env.migration.example
git commit -m "chore(images): remove completed storage migration journal"
```

## Acceptance criteria

- Runtime source khong con Cloudflare Images API/delivery references.
- Public API sinh URL runtime tu `r2ObjectKey`.
- Legacy DB columns duoc backup truoc khi drop.
- Cloudflare delete duoc checkpoint trong durable journal va co dry-run.
- Album, intentionally deleted legacy images va 10 static homepage IDs deu nam trong managed inventory; unmanaged account assets khong bi xoa.
- Moi target duoc hash/fetch verify lai trong 24 gio truoc destructive delete.
- Cloudflare originals chi xoa sau managed-inventory reconciliation va extended observation.
