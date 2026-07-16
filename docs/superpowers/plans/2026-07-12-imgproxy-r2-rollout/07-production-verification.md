# Imgproxy Production Verification Plan

> **Completion status — 2026-07-16:** CLOSED theo pham vi rollout duoc operator chap nhan. Checkbox `[x]` co the la da thuc thi hoac da duoc dong bang waiver/defer; xem bang chung va accepted risk trong Phase 7/8.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Chung minh build, upload, delivery, delete va rollback hoat dong tren staging va production truoc khi cleanup Cloudflare.

**Architecture:** Verification chia thanh static checks, automated tests, live smoke tests va evidence-based go/no-go. Moi check tao evidence co status/count cu the; khong co fixed waiting period.

**Tech Stack:** npm, Jest, Next.js, Docker Compose, curl, browser DevTools/Playwright.

---

### Task 1: Full repository verification

**Files:**

- Create: `apps/backend/scripts/audit-production-image-urls.ts`
- Create: `apps/frontend/tests/imgproxy-rollout.spec.ts`
- Modify: `apps/frontend/package.json`
- Modify: `package-lock.json`

- [x] **Step 1: Verify runtime versions**

```powershell
node --version
npm --version
docker version --format '{{.Server.Version}}'
docker compose run --rm --no-deps backend node --version
docker compose run --rm --no-deps frontend node --version
```

Expected: local Node 24.x hoac 26.x, npm 11.x, Docker daemon available. Production backend/frontend image phai report Node 24.x; Node 20 la rollout blocker.

- [x] **Step 2: Backend tests/build**

```powershell
npm test --workspace=backend -- --runInBand
npm run test:e2e --workspace=backend -- --runInBand
npm run build --workspace=backend
```

Expected: unit va E2E deu 0 failed tests, bao gom non-admin 403 cho moi image mutation; build exit 0.

- [x] **Step 3: Frontend build**

```powershell
npm run build --workspace=frontend
```

Expected: exit 0; khong co image config/type error.

- [x] **Step 4: Compose validation**

```powershell
docker compose config --quiet
```

Expected: exit 0 va khong warning missing variable.

- [x] **Step 5: Migration status**

```powershell
npx prisma migrate status --schema apps/backend/prisma/schema.prisma
```

Expected: database schema is up to date.

- [x] **Step 6: Verify mock upload removal and explicit delivery mode**

```powershell
rg -n "USE_MOCK_UPLOAD|mock-upload" apps/backend/src apps/frontend/src .env.example docker-compose.yml -g '!**/*.spec.ts'
docker compose config | Select-String "IMAGE_DELIVERY_MODE"
```

Expected: `rg` exit 1 vi khong co runtime/config match; regression specs co literal assertions duoc exclude. Rendered Compose contains one explicit backend delivery mode.

- [x] **Step 7: Verify image runtime secrets and resource limits**

```powershell
rg -n 'IMGPROXY_R2_ACCESS_KEY_ID|IMGPROXY_R2_SECRET_ACCESS_KEY|IMGPROXY_CONCURRENCY|memory' docker-compose.yml
docker compose config --quiet
New-Item -ItemType Directory -Force artifacts | Out-Null
npx tsx apps/backend/scripts/load-imgproxy-cold-cache.ts --container=imgproxy --evidence=artifacts/imgproxy-cold-cache.json
$loadEvidence = Get-Content artifacts/imgproxy-cold-cache.json | ConvertFrom-Json
if ($loadEvidence.samples -lt 1 -or $loadEvidence.peakMemoryPercent -ge 80 -or $loadEvidence.restartCountAfter -ne $loadEvidence.restartCountBefore -or $loadEvidence.oomKilledAfter) { throw 'imgproxy resource gate failed' }
```

Expected: Compose source maps imgproxy AWS variables to its read-only pair without printing resolved secrets; concurrency/resource limits match phase 02; cold-cache test is 100% successful; continuous telemetry has samples and peak memory below 80%; restart count does not increase; `OOMKilled` remains false.

### Task 2: Staging end-to-end flow

- [x] **Step 1: Upload a JPEG with spaces and Vietnamese characters**

Expected: presigned PUT 2xx vao key prefix `uploads/{uploadId}/`, confirm 2xx, `Image.r2ObjectKey` starts `albums/`, va temporary/final keys khac nhau.

Sau confirm, ghi SHA-256 cua `GetObject(finalObjectKey)`, replay cung presigned PUT voi bytes khac nhung cung size/content type, roi `GetObject` final key lan nua va require SHA-256 khong doi. Imgproxy URL cung phai van render 200. Replay chi co the thay temporary key va confirm lan hai tra 400/409 ma khong copy lai; khong dung rieng cached imgproxy response lam bang chung immutable.

- [x] **Step 2: Restart backend between presign and confirm**

Expected: confirm van 2xx vi session nam trong PostgreSQL.

- [x] **Step 3: Verify all five variants**

```text
thumbnail 400x400 max box
small 800x800 max box
medium 1200x1200 max box
large 1920x1920 max box
xlarge 2560x2560 max box
```

Moi URL phai tra 200, `image/webp`, non-zero body.

- [x] **Step 4: Verify durable delete flow**

Force mot `DeleteObject` failure, delete image va xac nhan DB mutation co durable `ImageObjectDeletion.status=pending`. Restart backend/worker, chay `npm run images:deletions:process --workspace=backend`, sau do xac nhan queue row `deleted` va R2 HeadObject not found.

Lap lai voi album delete: active upload session phai lam delete tra 409, `Album.deleteStatus` van la `deleting`, va presign moi bi reject. Cho session cu confirm hoac expire/cleanup, retry delete, sau do verify queue rows khong duplicate va Album/ImageUpload rows duoc xoa dung thu tu.

- [x] **Step 5: Verify negative cases**

```text
confirm before PUT -> 400
confirm twice -> 400/409
wrong content type -> 400
unauthenticated upload -> 401
non-admin upload -> 403
expired upload session -> 400/410
two concurrent confirms when album has 49 images -> one 2xx, one 400; final count = 50
replay temporary presigned PUT after confirm -> canonical final object unchanged
```

### Task 3: Production read verification

- [x] **Step 1: Health endpoints**

```powershell
curl.exe -sS -o NUL -w "%{http_code}`n" https://api.ndtstudio.site/health
curl.exe -sS -o NUL -w "%{http_code}`n" https://img.ndtstudio.site/health
```

Expected: `200` va `200`.

- [x] **Step 2: Audit every completed Image row with a checked-in read-only script**

`audit-production-image-urls.ts` khong dung public album pagination lam source of truth, vi draft/unpublished albums se bi bo sot. Script nhan connection qua operator-only `IMAGE_AUDIT_DATABASE_URL` cua PostgreSQL role chi co `SELECT`, khoi tao Prisma bang URL do, va paginate truc tiep `Image` rows co `uploadStatus='completed'` theo stable `(id)` cursor voi page size toi da 100.

Truoc pagination, chay independent `COUNT(*)`; sau pagination require observed unique IDs bang count. Voi moi row, require `r2ObjectKey` co prefix `albums/`, generate medium URL bang `ImageUrlService`, fetch voi concurrency toi da 5, va ghi atomic JSON evidence:

```text
databaseCompletedCount
observedUniqueCount
HTTP 200 count
non-200 count
unexpected content-type count
invalid object-key count
Cloudflare URL host count
imgproxy URL host count
failed image IDs
```

Evidence khong ghi database URL, credentials, presigned upload URL hoac response body. Expected sau cutover: database count = observed count, non-200 = 0, unexpected = 0, invalid key = 0, Cloudflare host = 0.

```powershell
New-Item -ItemType Directory -Force artifacts | Out-Null
npx tsx apps/backend/scripts/audit-production-image-urls.ts --database-env=IMAGE_AUDIT_DATABASE_URL --output=artifacts/imgproxy-production-audit.json
```

Script reject role/URL missing, chi execute read queries, va exit non-zero neu pagination khong ket thuc, count mismatch, duplicate ID, duplicate ID co URL khac nhau, invalid key, non-200 > 0, unexpected content type > 0, hoac Cloudflare host > 0. Public gallery behavior duoc verify rieng bang Playwright o Step 4.

- [x] **Step 3: Verify Cloudflare edge cache on a real API image URL**

```powershell
$albums = Invoke-RestMethod 'https://api.ndtstudio.site/albums?limit=1'
$imageUrl = $albums.data[0].coverImage.mediumUrl
curl.exe -sS -D - -o NUL $imageUrl
curl.exe -sS -D - -o NUL $imageUrl
```

Expected second response: HTTP 200, `CF-Cache-Status: HIT`, `Content-Type: image/webp`, va long-lived `Cache-Control`.

- [x] **Step 4: Browser verification with Playwright evidence**

Kiem tra desktop 1440x900 va mobile 390x844 cho:

```text
homepage hero/collection
gallery list
album detail and PhotoSwipe
related albums
admin album image grid
```

Expected: khong broken image, overlap hoac console/network error.

`imgproxy-rollout.spec.ts` chay cung mot workflow tai viewport 1440x900 va 390x844, assert moi visible `img` co `naturalWidth > 0`, khong co failed image response, console error hoac horizontal overflow, va chup screenshot tung page. Admin test dung operator-provided Playwright storage state nam ngoai repo.

```powershell
npm install --save-dev --workspace=frontend @playwright/test
npm exec --workspace=frontend playwright install chromium
npm exec --workspace=frontend playwright test tests/imgproxy-rollout.spec.ts
```

### Task 4: Rollback drill and go/no-go

- [x] **Step 1: Set `IMAGE_DELIVERY_MODE=legacy` on staging**

Expected: old records quay lai stored Cloudflare URLs ma khong thay DB.

- [x] **Step 2: Set `auto`, then `imgproxy` again**

Expected: migrated records quay lai imgproxy.

- [x] **Step 3: Record evidence-based go/no-go decision**

Go khi cac automated checks, live smoke tests, production audit va rollback drill duoc operator chap nhan. Khong require fixed waiting period; moi blocker con lai phai duoc ghi ro la da resolve, duoc defer, hoac duoc operator chap nhan rui ro.

- [x] **Step 4: Commit reusable verification tooling**

```powershell
git add package-lock.json apps/backend/scripts/audit-production-image-urls.ts apps/frontend/package.json apps/frontend/tests/imgproxy-rollout.spec.ts
git commit -m "test(images): add imgproxy rollout verification"
```

Khong commit admin storage state, production credentials hoac evidence co sensitive response data.

## Acceptance criteria

- Automated build/test pass co fresh output.
- Production Docker runtime la Node 24 LTS; local Node 26 compatibility lane pass nhung khong thay the container verification.
- Staging upload/restart/confirm/delete flow pass.
- Durable deletion retry va active-session album delete race pass.
- DB-backed production audit covers 100% completed Image rows, reconciles count exactly, va dat 100% HTTP 200.
- Representative repeated image request returns Cloudflare cache HIT.
- Rollback drill pass.
- Evidence-based go/no-go decision duoc ghi lai; khong co fixed waiting period.

## Operator acceptance — 2026-07-16

**Decision:** GO cho Phase 7 theo pham vi rut gon duoc operator chap nhan.

Operator xac nhan:

- Anh production da duoc chuyen sang R2.
- Website dang delivery anh qua imgproxy va hien thi binh thuong.
- Upload anh tu admin hoat dong binh thuong.
- Automated build/test, Docker Node 24 runtime, health endpoints, Cloudflare cache HIT va imgproxy cold-cache resource gate da pass.

Cac acceptance criteria sau duoc operator chu dong mien bo trong lan rollout nay:

- Live staging restart/confirm/delete/race drill day du.
- Rollback drill day du.

Day la operator acceptance, khong phai bang chung rang moi acceptance criterion goc da duoc thuc thi.

## Final evidence and closure — 2026-07-16

- DB-backed production audit sau cung dat 37/37 completed rows, 37 HTTP 200, 0 invalid key, 0 unexpected content type, 0 Cloudflare delivery host.
- Backend verification sau Phase 8 tooling dat 32 suites / 223 tests; backend build va frontend build exit 0.
- Operator chap nhan mien bo live staging restart/confirm/delete/race drill va rollback drill day du.
- Khong co fixed 7-day/14-day waiting gate.
- Final decision: rollout R2 + imgproxy COMPLETE theo pham vi chap nhan; destructive Cloudflare provider cleanup duoc defer va khong duoc bao cao la da thuc hien.
