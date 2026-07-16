#> **Completion status — 2026-07-16:** CLOSED theo pham vi rollout duoc operator chap nhan. Checkbox `[x]` co the la da thuc thi hoac da duoc dong bang waiver/defer; xem bang chung va accepted risk trong Phase 7/8.

 R2 Upload Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Bien upload flow thanh quy trinh authenticated, restart-safe va chi confirm khi object thuc su ton tai tren R2.

**Architecture:** Thay in-memory `Map` bang model `ImageUpload` trong PostgreSQL. Presigned PUT chi ghi vao temporary key `uploads/{uploadId}/...`; confirm verify temporary object, reserve mot album slot trong serializable transaction, conditional-copy dung ETag sang immutable final key `albums/...`, verify final object, roi transaction tao `Image` va consume session. URL da presign khong bao gio tro truc tiep vao canonical key.

**Tech Stack:** NestJS, Prisma, PostgreSQL, AWS SDK S3, Jest.

---

### Task 1: Persist upload sessions

**Files:**

- Modify: `apps/backend/prisma/schema.prisma`
- Create: `apps/backend/prisma/migrations/20260712000100_add_image_upload_session/migration.sql`
- Modify: `apps/backend/src/images/images.service.ts:16-126`

- [x] **Step 1: Them Prisma model**

```prisma
model ImageUpload {
  id                    String   @id @default(uuid())
  albumId               String
  uploadObjectKey       String   @unique
  finalObjectKey        String   @unique
  filename              String
  contentType           String
  fileSize              Int
  status                String   @default("pending") // pending | finalizing | consumed | failed
  sourceEtag            String?
  finalizationStartedAt DateTime?
  expiresAt             DateTime
  consumedAt            DateTime?
  createdAt             DateTime @default(now())

  album Album @relation(fields: [albumId], references: [id], onDelete: Restrict)

  @@index([albumId, status])
  @@index([expiresAt, status])
}
```

Them `imageUploads ImageUpload[]` vao model `Album`.

- [x] **Step 2: Tao migration SQL va validate**

```sql
CREATE TABLE "ImageUpload" (
  "id" TEXT NOT NULL,
  "albumId" TEXT NOT NULL,
  "uploadObjectKey" TEXT NOT NULL,
  "finalObjectKey" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "sourceEtag" TEXT,
  "finalizationStartedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImageUpload_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ImageUpload_albumId_fkey"
    FOREIGN KEY ("albumId") REFERENCES "Album"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ImageUpload_uploadObjectKey_key" ON "ImageUpload"("uploadObjectKey");
CREATE UNIQUE INDEX "ImageUpload_finalObjectKey_key" ON "ImageUpload"("finalObjectKey");
CREATE INDEX "ImageUpload_albumId_status_idx" ON "ImageUpload"("albumId", "status");
CREATE INDEX "ImageUpload_expiresAt_status_idx"
  ON "ImageUpload"("expiresAt", "status");
```

```powershell
npx prisma validate --schema apps/backend/prisma/schema.prisma
npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma
```

Expected tren staging clone: migration chi tao table/index/foreign key moi va status up to date.

- [x] **Step 3: Viet failing service tests**

**Create:** `apps/backend/src/images/images.service.spec.ts`

Test phai bao gom:

```text
getUploadUrl persists distinct temporary and final object keys
confirmUpload survives a new ImagesService instance
confirmUpload rejects an expired session
confirmUpload rejects an already consumed session
confirmUpload rejects a missing R2 temporary object
confirmUpload rejects mismatched size/content type
confirmation copies with the verified source ETag and persists only finalObjectKey
replaying the presigned PUT after confirmation cannot change the final object
confirmUpload creates one image and increments imageCount once
two concurrent confirms at 49 images produce one success and one capacity error
concurrent successful confirms assign distinct orderIndex values
album deletion cannot cascade away an active upload session
```

Use explicit fixtures for an active session, expired session, consumed session, missing HeadObject response, metadata mismatch and two real concurrent transactions. Moi test phai assert exact Prisma/S3 calls va final rows, khong chi assert HTTP status.

- [x] **Step 4: Chay test fail**

```powershell
npm test --workspace=backend -- images.service.spec.ts --runInBand
```

Expected: FAIL vi service van doc `uploadRequests` Map.

### Task 2: Verify object metadata through StorageService

**Files:**

- Modify: `apps/backend/src/images/storage.service.ts`
- Modify: `apps/backend/src/images/storage.service.spec.ts`

- [x] **Step 1: Them `HeadObjectCommand` test**

```ts
await expect(
    storage.verifyObject(objectKey, {
        contentType: 'image/jpeg',
        fileSize: 1024,
    }),
).resolves.toBe('"source-etag"');
```

Test command mismatch va missing object phai reject.

- [x] **Step 2: Implement metadata verification**

```ts
async verifyObject(
  objectKey: string,
  expected: { contentType: string; fileSize: number },
): Promise<string> {
  const result = await this.s3.send(new HeadObjectCommand({
    Bucket: this.bucketname,
    Key: objectKey,
  }));

  if (result.ContentLength !== expected.fileSize) {
    throw new BadRequestException('Uploaded object size does not match');
  }
  if (result.ContentType !== expected.contentType) {
    throw new BadRequestException('Uploaded object content type does not match');
  }
  if (!result.ETag) {
    throw new BadRequestException('Uploaded object ETag is missing');
  }
  return result.ETag;
}
```

- [x] **Step 3: Add conditional temporary-to-final promotion**

Import `CopyObjectCommand` and add:

```ts
async promoteObject(
  uploadObjectKey: string,
  finalObjectKey: string,
  sourceEtag: string,
  expected: { contentType: string; fileSize: number },
): Promise<void> {
  const encodedSource = encodeURIComponent(
    `${this.bucketname}/${uploadObjectKey}`,
  ).replace(/%2F/g, '/');

  await this.s3.send(new CopyObjectCommand({
    Bucket: this.bucketname,
    Key: finalObjectKey,
    CopySource: encodedSource,
    CopySourceIfMatch: sourceEtag,
    MetadataDirective: 'COPY',
  }));
  await this.verifyObject(finalObjectKey, expected);
}
```

`verifyObject` return normalized non-empty `ETag` cua temporary object de session claim bind vao dung object version. Tests phai assert `CopySourceIfMatch`; neu temporary key bi overwrite sau `HeadObject`, copy fail va khong co `Image` row.

- [x] **Step 4: Chay StorageService tests**

```powershell
npm test --workspace=backend -- storage.service.spec.ts --runInBand
```

Expected: PASS.

### Task 3: Implement transactional confirmation

**Files:**

- Modify: `apps/backend/src/images/images.service.ts`
- Modify: `apps/backend/src/images/dto/upload-confirm.dto.ts`

- [x] **Step 1: Rut gon confirm DTO**

```ts
export class UploadConfirmDto {
    @IsUUID()
    uploadId!: string;
}
```

- [x] **Step 2: Persist session trong `getUploadUrl`**

Refactor `StorageService` de tach temporary/final key creation khoi presigning:

```ts
createUploadObjectKey(uploadId: string, filename: string): string;
createFinalObjectKey(albumId: string, filename: string): string;
getPresignedUploadUrl(
  uploadObjectKey: string,
  contentType: string,
  fileSize: number,
): Promise<string>;
```

Ca hai helper chi dung basename da sanitize, khong cho control character hoac path separator tu filename tao nested key. Temporary key bat buoc co prefix `uploads/{uploadId}/`; final key bat buoc co prefix `albums/{albumId}/` va mot UUID moi. `ImagesService` tao ca hai key, luu `ImageUpload` `status=pending` voi `expiresAt = now + 1 hour`, sau do chi presign `uploadObjectKey`. Neu presign fail, xoa session vua tao. `finalObjectKey` khong bao gio duoc tra cho browser truoc confirm.

- [x] **Step 3: Confirm theo transaction**

Thu tu bat buoc:

```text
1. Load pending or reclaimable stale-finalizing session; reject consumed/failed/expired sessions.
2. HeadObject temporary key, verify size/content type, and capture non-empty ETag.
3. In a Serializable transaction, reserve one album slot and claim the session as finalizing with that ETag.
4. Copy temporary -> final with CopySourceIfMatch, then HeadObject/verify final key.
5. Generate variants from finalObjectKey.
6. In a Serializable transaction: create Image with r2ObjectKey=finalObjectKey and compatibility variant URL columns, increment Album.imageCount, and mark session consumed.
7. Best-effort delete only the temporary key; durable session cleanup retries it.
8. Return the created Image with runtime variant URLs.
```

Reservation transaction phai count completed `Image` rows cong voi `ImageUpload.status=finalizing` reservations khac cua album. Neu tong `>= 50`, tra 400 va giu session `pending` de cleanup; khong copy final object. Claim dung conditional `updateMany` tu `pending -> finalizing`, set `sourceEtag`/`finalizationStartedAt`, va require `count === 1`. Retry Prisma `P2034` toi da 3 lan; hai confirms bat dau khi album co 49 images phai cho dung mot reservation thanh cong.

Mot `finalizing` claim cu hon 10 phut co the duoc reclaim chi khi temporary `HeadObject.ETag` van khop stored `sourceEtag`; claim dang con lease tra 409. Sau copy, toan bo conditional consume, doc max `orderIndex`, create Image va tang `imageCount` nam trong interactive transaction `Serializable`. Confirm lai session `consumed` khong bao gio copy lan nua. Vi browser chi co URL cua temporary key, replay PUT sau confirm chi thay temporary object va khong the thay canonical final object.

Neu conditional copy/verification fail do ETag mismatch hoac metadata sai, set session `failed`, khong create Image, va de cleanup xoa ca temporary/final key neu final key da duoc tao. Loi network transient giu `finalizing` de retry/reclaim theo lease.

- [x] **Step 4: Xoa `uploadRequests` Map va timeout cleanup**

Khong de lai in-memory state trong `ImagesService`.

- [x] **Step 5: Chay service tests/build**

```powershell
npm test --workspace=backend -- images.service.spec.ts --runInBand
npm run build --workspace=backend
```

Expected: PASS.

### Task 4: Require admin authentication

**Files:**

- Modify: `apps/backend/src/images/images.controller.ts`
- Modify: `apps/frontend/src/lib/api/images.ts`
- Create: `apps/backend/test/images.e2e-spec.ts`

- [x] **Step 1: Rename confirm route**

```ts
@Post('confirm-upload')
@Roles('admin')
confirmUpload(@Body() uploadConfirmDto: UploadConfirmDto) {
  return this.imagesService.confirmUpload(uploadConfirmDto);
}
```

- [x] **Step 2: Remove `@Public()`**

Remove khoi `upload-url`, `confirm-upload`, update, delete va reorder. Giu `findByAlbum` public. Them `@Roles('admin')` rieng tren moi mutation; chi bo `@Public()` khong du de admin-only vi `RolesGuard` cho qua khi route khong khai bao role.

```ts
@Post('upload-url')
@Roles('admin')

@Post('confirm-upload')
@Roles('admin')

@Patch(':id')
@Roles('admin')

@Delete(':id')
@Roles('admin')

@Patch('album/:albumId/reorder')
@Roles('admin')
```

- [x] **Step 3: Update frontend request**

```ts
await apiClient('/images/confirm-upload', {
    method: 'POST',
    body: JSON.stringify({ uploadId }),
});
```

- [x] **Step 4: E2E auth tests**

Expected:

```text
POST /images/upload-url without JWT -> 401
POST /images/confirm-upload without JWT -> 401
POST /images/upload-url with non-admin JWT -> 403
POST /images/confirm-upload with non-admin JWT -> 403
PATCH /images/:id with non-admin JWT -> 403
DELETE /images/:id with non-admin JWT -> 403
PATCH /images/album/:albumId/reorder with non-admin JWT -> 403
GET /images/album/:albumId without JWT -> 200
```

Run the E2E suite explicitly because backend `npm test` only discovers specs under `src`:

```powershell
npm run test:e2e --workspace=backend -- --runInBand
```

Expected: every mutation returns 401 without JWT, 403 for a valid non-admin JWT, and reaches its handler for an admin JWT.

- [x] **Step 5: Commit phase**

```powershell
git add apps/backend/prisma apps/backend/src/images apps/backend/test apps/frontend/src/lib/api/images.ts
git commit -m "feat(images): persist and verify R2 upload sessions"
```

### Task 5: Make image and album deletion durable

**Files:**

- Modify: `apps/backend/prisma/schema.prisma`
- Create: `apps/backend/prisma/migrations/20260712000110_add_image_object_deletion/migration.sql`
- Modify: `apps/backend/src/images/images.service.ts`
- Modify: `apps/backend/src/albums/albums.service.ts`
- Create: `apps/backend/src/images/image-deletion.service.ts`
- Create: `apps/backend/src/images/image-deletion.service.spec.ts`
- Create: `apps/backend/scripts/process-image-deletions.ts`
- Modify: `apps/backend/package.json`

- [x] **Step 1: Add a standalone deletion queue and explicit Album deletion state**

Them vao `Album`:

```prisma
deleteStatus    String    @default("active") // active | deleting
deleteStartedAt DateTime?

@@index([deleteStatus])
```

Migration `20260712000110_add_image_object_deletion` phai gom ca state columns/index, khong de service tham chieu field chua co trong schema:

```sql
ALTER TABLE "Album"
  ADD COLUMN "deleteStatus" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN "deleteStartedAt" TIMESTAMP(3);
CREATE INDEX "Album_deleteStatus_idx" ON "Album"("deleteStatus");
```

Them deletion queue:

```prisma
model ImageObjectDeletion {
  id          String   @id @default(uuid())
  imageId     String?
  provider    String
  objectKey   String
  status      String   @default("pending")
  attempts    Int      @default(0)
  lastError   String?
  deletedAt   DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([provider, objectKey])
  @@index([status, createdAt])
}
```

Khong tao foreign key den `Image`; queue phai con ton tai sau khi Image/Album row bi xoa. `provider` chi nhan `r2` hoac `cloudflare_legacy` va duoc service validate. Migration SQL phai tao day du table, unique/index cua model tren cung voi `Album` columns; Prisma schema, migration SQL va service property names phai dung chinh xac `deleteStatus`/`deleteStartedAt`.

- [x] **Step 2: Queue before deleting database rows**

Individual image delete phai trong mot transaction: upsert queue row, clear `Album.coverImageId` neu can, delete Image, decrement `Album.imageCount`. Album delete phai transactionally queue tat ca image keys truoc khi cascade DB rows. R2 keys `albums/...` vao `pending`; legacy UUID vao `deferred` de phase 08 xoa Cloudflare original sau rollback window.

Khong con pattern catch `DeleteObject` roi van xoa DB ma khong checkpoint.

- [x] **Step 3: Protect album deletion from live presigned uploads**

Album deletion la state machine retryable:

```text
active --admin delete--> deleting --queue rows + DB delete--> row removed
deleting --retry while upload session active--> deleting + HTTP 409
deleting --transaction/network failure--> deleting + retry later
```

Request delete dau tien dung conditional update `deleteStatus: active -> deleting`, set `deleteStartedAt`, roi moi kiem tra sessions. `getUploadUrl` chi cap presign khi `deleteStatus=active`; do do sau khi state da commit se khong co session moi chen vao race window. Confirm cua session da cap truoc do van duoc phep finish; delete tra 409 va **giu** state `deleting` khi con `pending`/`finalizing` session chua het han. Response 409 phai noi ro album da khoa upload va operator can retry delete sau khi uploads finish/expire.

Moi retry tren album `deleting` chay expired/failed-session cleanup, sau do trong mot transaction: upsert queue cho tat ca Image keys, xoa consumed session rows da cleanup temporary key, va delete Album. Neu transaction fail, state van `deleting` de retry idempotent; khong co path tu dong reset ve `active` lam mo lai presign race. `ImageUpload.onDelete: Restrict` la final database guard.

Tests phai prove: state duoc persist truoc 409; presign moi bi reject trong khi deleting; session cu co the confirm; retry sau khi session consumed/expired queue tat ca objects va xoa album; retry sau transaction failure khong duplicate queue rows.

- [x] **Step 4: Process R2 deletions idempotently**

`process-image-deletions.ts` select toi da 100 `provider=r2,status=pending` rows. Moi successful/idempotent `DeleteObject` update `status=deleted`, `deletedAt=now`; failure increment `attempts`, persist sanitized `lastError`, va giu `pending` cho retry. `cloudflare_legacy` rows khong duoc worker nay goi Cloudflare API.

```json
{
    "images:deletions:process": "tsx scripts/process-image-deletions.ts"
}
```

- [x] **Step 5: Test deletion failure, retries and session races**

```text
DeleteObject failure leaves a durable pending row
retry marks exactly one row deleted
rerun performs no second delete for completed row
album delete with active upload session returns 409 and keeps the session
new presign is rejected after album deletion state begins
legacy UUID is deferred and never sent to R2 DeleteObject
```

```powershell
npm test --workspace=backend -- image-deletion.service.spec.ts images.service.spec.ts --runInBand
npm run test:e2e --workspace=backend -- --runInBand
```

Expected: failure/restart khong lam mat object key; queue drain xong thi R2 HeadObject tra not found.

- [x] **Step 6: Commit durable deletion support**

```powershell
git add apps/backend/prisma apps/backend/src/images apps/backend/src/albums/albums.service.ts apps/backend/scripts/process-image-deletions.ts apps/backend/package.json
git commit -m "feat(images): make object deletion durable"
```

### Task 6: Cleanup expired sessions and orphan objects

**Files:**

- Create: `apps/backend/src/images/upload-cleanup.service.ts`
- Create: `apps/backend/src/images/upload-cleanup.service.spec.ts`
- Create: `apps/backend/scripts/cleanup-expired-image-uploads.ts`
- Modify: `apps/backend/src/images/images.module.ts`
- Modify: `apps/backend/package.json`

- [x] **Step 1: Write cleanup tests**

```text
expired pending/failed session deletes temporary and any unreferenced final key, then its DB row
stale finalizing session without an Image deletes temporary/final keys and releases its album reservation
missing R2 object is treated as already cleaned
active pending/finalizing session is untouched
consumed session cleanup deletes only uploadObjectKey and the session row, never finalObjectKey
rerunning cleanup produces zero additional deletions
```

- [x] **Step 2: Implement idempotent cleanup service**

Process `pending`/`failed` sessions co `expiresAt < now - 1 hour` va `finalizing` lease cu hon 1 gio theo batch 100; grace period tranh cleanup object khi request con dang ket thuc. Neu khong co `Image.r2ObjectKey = finalObjectKey`, delete ca `uploadObjectKey` va `finalObjectKey`, sau do conditional `deleteMany` theo session ID/status. Process consumed sessions co `consumedAt < now - 7 days` bang cach idempotent delete **chi** `uploadObjectKey`, roi xoa session row; canonical `finalObjectKey` khong bao gio bi upload cleanup delete. Job overlap duoc phep goi S3 delete lap lai nhung conditional DB delete phai ngan mat session dang duoc confirm.

- [x] **Step 3: Add operator command**

```json
{
    "images:uploads:cleanup": "tsx scripts/cleanup-expired-image-uploads.ts"
}
```

Command chi log aggregate counts `scanned`, `objectsDeleted`, `sessionsDeleted`, `failed`; khong log credentials/presigned URLs.

- [x] **Step 4: Schedule daily cleanup in Dokploy**

```powershell
npm run images:uploads:cleanup --workspace=backend
```

Expected: exit 0. Job overlap phai an toan nho conditional deletes va idempotent S3 DeleteObject.

- [x] **Step 5: Run cleanup and concurrency verification**

```powershell
npm test --workspace=backend -- upload-cleanup.service.spec.ts images.service.spec.ts --runInBand
npm run build --workspace=backend
```

Expected: cleanup tests PASS; normal concurrent confirms tao `orderIndex` khac nhau; boundary test tai 49 images cho mot success va mot capacity error.

- [x] **Step 6: Commit cleanup support**

```powershell
git add apps/backend/src/images apps/backend/scripts/cleanup-expired-image-uploads.ts apps/backend/package.json
git commit -m "feat(images): clean expired R2 upload sessions"
```

## Acceptance criteria

- Backend restart khong lam mat upload session.
- Presigned PUT chi target temporary key; replay sau confirm khong the overwrite canonical final object.
- Object thieu/sai metadata hoac ETag thay doi khong tao Image record.
- Confirm trung khong tang counter hai lan.
- Capacity 50 images duoc enforce trong serializable reservation; hai confirms tai moc 49 chi mot request thanh cong.
- Concurrent confirms khong tao trung `orderIndex`.
- Expired/unconfirmed uploads khong de lai session hoac R2 object vo han.
- Image/album deletion failure khong lam mat object key; moi R2 deletion duoc durable checkpoint va retry.
- Album co explicit `deleteStatus` migration; active session khong bi cascade xoa, state `deleting` survive 409/failure, va presign moi bi khoa ngay khi delete bat dau.
- Anh upload giua phase 04 va phase 06 van doc duoc tu stored compatibility URLs.
- Tat ca mutation endpoints can JWT admin; valid non-admin JWT tra 403.
- Public gallery read van hoat dong.
