# Cloudflare Images Cleanup Plan

> **Completion status — 2026-07-16:** CLOSED theo pham vi rollout duoc operator chap nhan. Checkbox `[x]` co the la da thuc thi hoac da duoc dong bang waiver/defer; xem bang chung va accepted risk trong Phase 7/8.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Xoa Cloudflare Images code, config, data fields va assets sau khi R2 + imgproxy verification, inventory reconciliation va backup gates pass.

**Architecture:** Cleanup theo hai commit: repo contract cleanup truoc, destructive provider cleanup sau. Database schema changes la roll-forward migrations; Cloudflare originals chi xoa sau final inventory reconciliation.

**Tech Stack:** TypeScript, Prisma, Next.js, Cloudflare Images API.

## Operator closure — 2026-07-16

**Decision:** COMPLETE theo pham vi operator chap nhan; provider deletion duoc defer.

Bang chung:

- Production reconciliation: `total=37`, `r2=37`.
- DB-backed URL audit: 37/37 imgproxy HTTP 200, 0 invalid key, 0 Cloudflare delivery host.
- Cleanup tooling duoc commit va dry-run tren production inventory: 47 managed-present, 0 managed-missing, 1 unmanaged, 47 target verified, 0 delete, 0 checkpoint.
- Runtime contract cleanup, computed imgproxy presenter va roll-forward legacy-column migration da duoc implement/test trong branch.

Operator disposition:

- Khong xoa 47 Cloudflare originals; 1 unmanaged ID tiep tuc duoc bao ve.
- Khong huy Cloudflare Images subscription trong rollout nay.
- Khong drop `ImageStorageMigration` hoac `CloudflareStaticAssetMigration`; journals duoc giu de bao toan provenance.
- Production schema drop van require encrypted backup/export va restore evidence neu deploy sau nay.
- Token revocation va xoa hai bien Cloudflare Images la security follow-up ngay sau closure.

Checkbox `[x]` ben duoi nghia la step da thuc thi hoac disposition da duoc operator dong bang waiver/defer nhu ghi ro; no khong co nghia delete API da chay.

---

### Task 1: Prove cleanup preconditions

- [x] **Step 1: Confirm Phase 7 go decision**

Require signed evidence-based go decision tu Phase 7. Khong require fixed waiting period; moi waived/deferred check va accepted risk phai duoc ghi ro truoc cleanup.

- [x] **Step 2: Reconcile database**

```sql
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE "r2ObjectKey" LIKE 'albums/%') AS r2,
  COUNT(*) FILTER (WHERE "mediumUrl" LIKE '%imagedelivery.net%') AS legacy_urls
FROM "Image"
WHERE "uploadStatus" = 'completed';
```

Expected: total = r2. `legacy_urls` co the con de rollback nhung public API khong su dung chung.

- [x] **Step 3: Re-run the DB-backed full production URL audit**

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

- [x] **Step 1: Search all Cloudflare Images references**

```powershell
rg -n "Cloudflare Images|cloudflareImageId|CLOUDFLARE_IMAGES|imagedelivery\.net" . `
  -g '!package-lock.json' -g '!docs/superpowers/plans/**'
```

- [x] **Step 2: Verify the dead service stays removed and delete remaining provider-specific DTO/type fields**

`apps/backend/src/images/cloudflare.service.ts` da bi xoa o phase 02 de mock mode va long-running Cloudflare credentials khong ton tai trong runtime. Verify file van absent va khong recreate no; phase 05/08 tooling dung isolated migration modules/scripts.

Khong xoa `CLOUDFLARE_R2_BUCKET_NAME` trong task nay; do la R2 bucket config, khong phai Cloudflare Images API.
Khong revoke/xoa `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_IMAGES_READ_TOKEN` hoac cleanup-only `CLOUDFLARE_IMAGES_DELETE_TOKEN` khoi operator secret store trong task nay; destructive cleanup script o Task 4 van can chung. Long-running backend container khong duoc nhan cac bien migration-only nay.

- [x] **Step 3: Remove `imagedelivery.net` remote pattern**

Chi giu local assets va/hoac `img.ndtstudio.site`.

- [x] **Step 4: Update comments/docs to R2/imgproxy terminology**

Khong de lai Cloudflare webhook/upload wording trong runtime code.

- [x] **Step 5: Build/test and commit**

```powershell
npm test --workspace=backend -- --runInBand
npm run build --workspace=backend
npm run build --workspace=frontend
git add apps .env.example
git commit -m "refactor(images): remove Cloudflare Images contracts"
```

Expected: commands exit 0.

### Task 3: Remove legacy URL columns after verified cutover

**Files:**

- Modify: `apps/backend/prisma/schema.prisma`
- Create: `apps/backend/prisma/migrations/20260712000200_remove_legacy_image_urls/migration.sql`
- Modify: `apps/backend/src/images/image-presenter.service.ts`
- Modify: `apps/backend/src/images/images.service.ts`
- Modify: `apps/frontend/src/lib/api/albums.ts`

- [x] **Step 1: Resolve destructive schema cleanup gates — PRODUCTION DEPLOY DEFERRED**

Require Task 1 reconciliation va production URL audit pass, Task 2 contract cleanup da deploy, public API van tra five computed imgproxy URL fields, va operator approve schema cleanup. Khong require fixed waiting period.

- [x] **Step 2: Record backup requirement — DEFERRED UNTIL FUTURE PRODUCTION DROP**

Export `Image.id` va five legacy URL fields vao encrypted operator backup.

- [x] **Step 3: Drop legacy URL columns only if presenter no longer reads them**

Columns:

```text
thumbnailUrl
smallUrl
mediumUrl
largeUrl
xlargeUrl
```

Neu API contract van can ten field, presenter tra computed fields khong can Prisma columns.

- [x] **Step 4: Validate migration locally; staging/production deployment deferred**

```powershell
npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma
npm run build --workspace=backend
```

Expected: migration/build pass va public API van tra five computed URL fields.

- [x] **Step 5: Commit schema cleanup**

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

- [x] **Step 1: Reconcile managed inventories without assuming account-wide ownership**

Build the managed delete set as the union of:

```text
ImageStorageMigration rows with status IN (verified, skipped_deleted)
ImageObjectDeletion rows with provider=cloudflare_legacy,status=deferred
CloudflareStaticAssetMigration rows with cloudflareDeletedAt IS NULL
```

Require no duplicate Cloudflare ID across the union. Fetch account inventory and report managed-present, managed-missing and unmanaged IDs. Only managed IDs may be deleted; account-wide original count is not required to equal the album migration count, and unmanaged IDs must remain untouched.

- [x] **Step 2: Add dry-run and execute commands**

```json
{
    "images:cloudflare:delete:dry-run": "tsx scripts/delete-migrated-cloudflare-images.ts --dry-run",
    "images:cloudflare:delete": "tsx scripts/delete-migrated-cloudflare-images.ts --execute"
}
```

Dry-run selects the three managed sources above. Report source kind, legacy ID, target location, hashes/sizes and last verification time; khong goi delete API.

- [x] **Step 3: Re-verify every target within 24 hours of deletion**

Dynamic Image row con active: `HeadObject` + streamed SHA-256 phai khop journal, medium imgproxy URL phai tra 200/image. Intentionally deleted Image: require Image row absent plus `ImageStorageMigration.status=skipped_deleted` hoac matching completed `ImageObjectDeletion` checkpoint; target R2 object phai absent. Static asset: local checked-in file SHA-256 phai khop manifest, deployed production URL phai tra 200/image, va update `CloudflareStaticAssetMigration.deployedVerifiedAt`.

Delete command reject row co verification cu hon 24 gio, hash mismatch, missing target, non-200 imgproxy/static URL, hoac journal state ambiguous. Count reconciliation mot minh khong duoc phep xoa original.

- [x] **Step 4: Test and commit destructive tooling before execution**

```powershell
npm test --workspace=backend -- cloudflare-cleanup.spec.ts --runInBand
git add apps/backend/src/images/migrations apps/backend/scripts/delete-migrated-cloudflare-images.ts apps/backend/package.json
git commit -m "chore(images): add checkpointed Cloudflare cleanup tooling"
```

Expected: dry-run performs zero delete calls; stale/missing/hash-mismatch targets perform zero delete calls; retries never delete/checkpoint the same journal row twice.

- [x] **Step 5: Resolve Cloudflare original deletion — WAIVED BY OPERATOR**

```powershell
npm run images:cloudflare:delete:dry-run --workspace=backend
npm run images:cloudflare:delete --workspace=backend -- --limit=5
```

Operator waived execute mode; command was not run and no managed original was deleted. Neu decision thay doi sau nay, dung cleanup token read/edit trong mot cleanup window ngan. Sau moi successful/idempotent Cloudflare API deletion, transaction update dung source journal: dynamic journal `status=cloudflare_deleted` va `cloudflareDeletedAt=now`; deletion queue `status=deleted` va `deletedAt=now`; static journal `cloudflareDeletedAt=now`. Retry phai skip rows da checkpoint. Sau moi batch, verify production galleries va static homepage assets van 100% HTTP 200.

- [x] **Step 6: Record token revocation and env-removal follow-up**

Sau khi dong rollout, operator revoke ca read migration token va cleanup delete token, roi xoa `CLOUDFLARE_IMAGES_READ_TOKEN` va `CLOUDFLARE_IMAGES_DELETE_TOKEN` khoi `.env`/secret store. Khong revoke R2 credentials dang duoc backend/imgproxy su dung.

- [x] **Step 7: Resolve subscription cancellation — DEFERRED**

Subscription duoc operator chon giu nguyen. Closure report ghi 47 managed-present, 1 unmanaged, 47 verified, 0 delete va 0 checkpoint.

### Task 5: Retain migration journals after deferred provider cleanup

**Files:**

- Modify: `apps/backend/prisma/schema.prisma`
- Create: `apps/backend/prisma/migrations/20260712000300_remove_cloudflare_migration_journals/migration.sql`
- Delete: `apps/backend/.env.migration.example`

- [x] **Step 1: Record final-state gate as not applicable while originals remain**

```sql
SELECT status, COUNT(*)
FROM "ImageStorageMigration"
GROUP BY status;
```

Not applicable trong closure nay: originals duoc giu lai, vi vay journal khong duoc ep sang `cloudflare_deleted`.

Dong thoi require moi `CloudflareStaticAssetMigration` co `cloudflareDeletedAt IS NOT NULL` va moi `ImageObjectDeletion` co `provider=cloudflare_legacy` dat `status=deleted`, `deletedAt IS NOT NULL`. `ImageObjectDeletion` table van duoc giu cho R2 deletion queue thuong xuyen.

- [x] **Step 2: Retain journals; future drop still requires encrypted export/backup**

Final journal export la mapping cuoi cung giua Cloudflare ID va R2 key; verify backup restore truoc khi drop table.

- [x] **Step 3: Do not drop migration-only models while provider cleanup is deferred**

Khong drop `ImageStorageMigration` hoac `CloudflareStaticAssetMigration`; van giu `ImageObjectDeletion`. Neu provider cleanup duoc mo lai sau nay, phai quay lai final-state, backup va staging-clone gates truoc khi tao/deploy drop migration.

- [x] **Step 4: Close journal cleanup as deferred**

Khong tao commit drop journal trong closure nay.

## Acceptance criteria

- Runtime source khong con Cloudflare Images API/delivery references.
- Public API sinh URL runtime tu `r2ObjectKey`.
- Legacy DB columns duoc backup truoc khi drop.
- Cloudflare delete duoc checkpoint trong durable journal va co dry-run.
- Album, intentionally deleted legacy images va 10 static homepage IDs deu nam trong managed inventory; unmanaged account assets khong bi xoa.
- Moi target duoc hash/fetch verify lai trong 24 gio truoc destructive delete.
- Cloudflare originals chi xoa sau managed-inventory reconciliation, per-target verification trong 24 gio va operator-approved backup/rollback decision.


## Closure acceptance

- [x] Runtime source khong con phu thuoc Cloudflare Images delivery/API.
- [x] Public API sinh five imgproxy URLs runtime tu canonical `r2ObjectKey`.
- [x] Production audit va managed-inventory dry-run pass.
- [x] Cleanup tooling co checkpoint, stale/hash/missing guards va tests.
- [x] Operator chon giu Cloudflare originals; delete/cancel/drop-journal duoc dong bang explicit defer.
- [x] Unmanaged Cloudflare ID khong bi thay doi.
- [x] Security follow-up duoc ghi ro: revoke hai Cloudflare Images tokens va xoa hai env vars; giu R2 credentials.
