# Cloudflare Images to R2 Data Migration Plan

> **Completion status — 2026-07-16:** CLOSED theo pham vi rollout duoc operator chap nhan. Checkbox `[x]` co the la da thuc thi hoac da duoc dong bang waiver/defer; xem bang chung va accepted risk trong Phase 7/8.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Copy toan bo legacy Cloudflare Images originals sang R2 mot cach idempotent, co report va khong mat kha nang rollback.

**Architecture:** Script doc records co `r2ObjectKey` dang legacy UUID, ghi legacy-to-R2 mapping vao migration journal, download original qua Cloudflare API, upload vao deterministic R2 key, verify bang HeadObject va imgproxy, roi moi update database. Legacy delivery URLs va journal duoc giu nguyen den khi Phase 8 reconciliation, backup va provider cleanup hoan tat.

**Tech Stack:** TypeScript/tsx, Prisma, AWS SDK S3, Cloudflare Images API, imgproxy.

---

### Task 1: Create a durable migration journal

**Files:**

- Modify: `apps/backend/prisma/schema.prisma`
- Create: `apps/backend/prisma/migrations/20260712000150_add_image_storage_migration/migration.sql`

- [x] **Step 1: Add journal model**

```prisma
model ImageStorageMigration {
  imageId                 String   @id
  legacyCloudflareImageId String   @unique
  targetR2ObjectKey       String   @unique
  status                  String   @default("pending")
  sourceSize              Int?
  targetSize              Int?
  sourceSha256            String?
  targetSha256            String?
  error                   String?
  verifiedAt              DateTime?
  cloudflareDeletedAt     DateTime?
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt

  @@index([status, updatedAt])
}
```

Khong tao foreign key cascade den `Image`: journal phai ton tai ngay ca khi user xoa Image record truoc provider cleanup, de Cloudflare original van co the duoc reconcile va cleanup.

- [x] **Step 2: Create migration SQL and deploy on staging clone**

Migration tao standalone journal table, primary/unique indexes va status index; khong tao foreign key den `Image`. Chay:

```powershell
npx prisma validate --schema apps/backend/prisma/schema.prisma
npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma
```

Expected: schema up to date va khong thay doi existing Image rows.

- [x] **Step 3: Test journal state transitions**

Allowed transitions:

```text
pending -> uploaded -> verified
pending/uploaded -> failed
failed -> uploaded -> verified
verified -> cloudflare_deleted
pending/uploaded/failed -> skipped_deleted
```

Moi retry phai doc journal truoc de resume dung step, khong parse legacy ID tu delivery URL.

### Task 2: Define migration contract

**Files:**

- Create: `apps/backend/scripts/migrate-cloudflare-images-to-r2.ts`
- Create: `apps/backend/src/images/migrations/cloudflare-r2-migration.ts`
- Create: `apps/backend/src/images/migrations/cloudflare-r2-migration.spec.ts`
- Create: `apps/backend/.env.migration.example`
- Modify: `apps/backend/package.json`

- [x] **Step 1: Them CLI scripts**

```json
{
    "images:migrate:dry-run": "tsx scripts/migrate-cloudflare-images-to-r2.ts --dry-run",
    "images:migrate": "tsx scripts/migrate-cloudflare-images-to-r2.ts --execute"
}
```

- [x] **Step 2: Parse options an toan**

Supported options:

```text
--dry-run
--execute
--limit=<positive integer>
--concurrency=<1..5>
--album-id=<uuid>
--resume-after=<image uuid>
```

Script phai reject neu co ca `--dry-run` va `--execute`, hoac khong co mode.

Migration-only environment contract:

```dotenv
CLOUDFLARE_ACCOUNT_ID=replace-with-account-id
CLOUDFLARE_IMAGES_READ_TOKEN=replace-with-read-only-images-token
```

Hai bien migration nam trong operator secret store va khong duoc pass vao long-running backend container. Phase 05 token chi co quyen read Cloudflare Images; delete token rieng chi duoc tao/cap cho phase 08 Task 4 va revoke ngay sau cleanup.

- [x] **Step 3: Viet unit tests cho selection va key generation**

```ts
expect(isLegacyObjectKey('09389f8a-bd47-409d-f057-c456f492da00')).toBe(true);
expect(isLegacyObjectKey('albums/a/image.jpg')).toBe(false);
expect(buildR2ObjectKey(image)).toBe(
    `albums/${image.albumId}/${image.id}-${sanitizeFilename(image.filename)}`,
);
```

Sanitizer phai giu extension, thay path separator/control character va khong tao key rong.

- [x] **Step 4: Chay test fail, implement helpers, chay test pass**

```powershell
npm test --workspace=backend -- cloudflare-r2-migration.spec.ts --runInBand
```

Expected sau implementation: PASS.

### Task 3: Implement one-image migration pipeline

- [x] **Step 1: Download original tu Cloudflare authenticated endpoint**

Request:

```text
GET https://api.cloudflare.com/client/v4/accounts/{accountId}/images/v1/{imageId}/blob
Authorization: Bearer {CLOUDFLARE_IMAGES_READ_TOKEN}
```

Khong log token, response body hoac presigned URL.

- [x] **Step 2: Stream source to a temporary file and calculate integrity metadata**

Download response duoc stream vao operator temp directory trong khi tinh SHA-256 va byte count; khong buffer nhieu anh trong memory. Temp filename khong chua token/presigned URL va duoc xoa trong `finally`.

- [x] **Step 3: Upload deterministic R2 object**

Dung `PutObjectCommand` voi ContentType, ContentLength va metadata `legacy-cloudflare-id`, `source-sha256`.

- [x] **Step 4: Verify R2 object bytes, not only metadata**

`HeadObject` phai match ContentLength/ContentType. Sau do `GetObject` stream R2 object qua SHA-256, require target byte count = source byte count va target SHA-256 = source SHA-256. Luu ca `sourceSha256` va `targetSha256` vao journal; metadata header mot minh khong duoc xem la integrity proof.

- [x] **Step 5: Verify one imgproxy variant**

Goi medium URL va require:

```text
status = 200
content-type starts with image/
content-length > 0
```

- [x] **Step 6: Update DB only after verification**

```ts
await prisma.$transaction(async (tx) => {
    await tx.imageStorageMigration.update({
        where: { imageId: image.id },
        data: {
            status: 'verified',
            targetSize,
            sourceSha256,
            targetSha256,
            verifiedAt: new Date(),
            error: null,
        },
    });
    const updated = await tx.image.updateMany({
        where: { id: image.id, r2ObjectKey: legacyCloudflareId },
        data: { r2ObjectKey: newObjectKey },
    });
    if (updated.count !== 1) throw new Error('Image changed during migration');
});
```

Journal row phai duoc tao voi legacy ID va deterministic target key truoc network I/O. Neu `updated.count !== 1`, re-read Image: chi mark `skipped_deleted` sau khi chung minh Image row khong con, va delete target R2 object; neu row van ton tai nhung key da thay doi, mark `failed`/conflict va dung batch de operator reconcile. `skipped_deleted` giu legacy ID cho phase 08 managed cleanup va khong retry nhu migration failure. Neu DB transaction fail vi transient error sau upload, journal giu `uploaded`/`failed` state de retry hoac cleanup dung object.

### Task 4: Dry-run and resumability

- [x] **Step 1: Dry-run khong goi PutObject va khong update DB**

Report JSON summary:

```json
{
    "eligible": 37,
    "migrated": 0,
    "skipped": 0,
    "failed": 0,
    "mode": "dry-run"
}
```

- [x] **Step 2: Execute theo batch nho**

```powershell
npm run images:migrate:dry-run --workspace=backend
npm run images:migrate --workspace=backend -- --limit=5 --concurrency=2
```

Expected: 5 records migrate, run lai skip 5 records da co key `albums/...`.

- [x] **Step 3: Chay full migration tren staging clone**

Kiem tra count truoc/sau va khong co failed item.

- [x] **Step 4: Commit script truoc production run**

```powershell
git add apps/backend/prisma apps/backend/scripts apps/backend/src/images/migrations apps/backend/.env.migration.example apps/backend/package.json
git commit -m "feat(images): add resumable Cloudflare to R2 migration"
```

### Task 5: Production migration runbook

- [x] **Step 1: Backup DB va inventory**

Export danh sach `id`, `albumId`, legacy ID, filename va URL hosts; khong export secrets.

- [x] **Step 2: Dry-run production**

Expected: eligible count bang legacy record count, hien tai du kien 37.

- [x] **Step 3: Execute batch 5**

Verify website va logs sau moi batch; dung ngay neu imgproxy 5xx/timeout tang.

- [x] **Step 4: Execute phan con lai**

Chi tiep tuc khi batch dau dat 100% verify.

- [x] **Step 5: Reconcile**

```sql
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE "r2ObjectKey" LIKE 'albums/%') AS migrated,
  COUNT(*) FILTER (WHERE "r2ObjectKey" IS NULL) AS missing,
  COUNT(*) FILTER (WHERE "r2ObjectKey" NOT LIKE 'albums/%') AS legacy
FROM "Image"
WHERE "uploadStatus" = 'completed';
```

Expected: migrated = total completed images, missing = 0, legacy = 0.

## Rollback

- Khong xoa Cloudflare originals.
- Legacy URLs trong DB van duoc giu cho delivery fallback.
- Neu record update sai, restore `r2ObjectKey` tu `ImageStorageMigration.legacyCloudflareImageId` va cleanup chinh `targetR2ObjectKey` trong journal.
- Khong xoa journal truoc phase 08 cleanup va final Cloudflare inventory match.

## Acceptance criteria

- Script idempotent va resumable.
- Moi migrated image co durable legacy-to-R2 journal row.
- Moi DB update co R2 + imgproxy verification truoc.
- Moi verified row co source/target SHA-256 bang nhau; size/MIME khong duoc dung lam integrity proof duy nhat.
- Image bi delete trong luc migrate duoc cleanup target object va checkpoint `skipped_deleted`, khong de journal/orphan bi ket.
- Production reconcile khong con legacy/missing record.
- Cloudflare assets van ton tai den khi Phase 8 reconciliation, target verification va backup gates pass.
