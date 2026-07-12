# Imgproxy + R2 Rollout Plan Set

Bo plan nay tach viec thay Cloudflare Images thanh R2 + imgproxy thanh cac chang co the trien khai va rollback doc lap.

## Thu tu bat buoc

1. [01-fix-imgproxy-url.md](./01-fix-imgproxy-url.md): Sua URL signing va them regression tests.
2. [02-runtime-infrastructure.md](./02-runtime-infrastructure.md): Validate env, DNS, TLS, Traefik va R2 CORS.
3. [03-prisma-migration.md](./03-prisma-migration.md): Dua migration vao dung Prisma tree, audit checksum va test production clone.
4. [04-upload-hardening.md](./04-upload-hardening.md): Persist upload session, verify R2 object va khoa endpoint admin.
5. [05-data-migration.md](./05-data-migration.md): Migrate anh cu theo batch, idempotent va giu rollback.
6. [06-api-frontend-cutover.md](./06-api-frontend-cutover.md): Dual-read, cutover API va bo anh tinh Cloudflare.
7. [07-production-verification.md](./07-production-verification.md): Smoke/E2E, rollout production va observation window.
8. [08-cloudflare-cleanup.md](./08-cloudflare-cleanup.md): Cleanup chi sau khi het thoi gian rollback.

## Nguyen tac rollout

- Khong migrate data truoc khi URL imgproxy va ha tang tra anh thanh cong.
- Khong xoa asset Cloudflare trong it nhat 7 ngay sau cutover.
- Khong luu signed URL imgproxy lam canonical data; `r2ObjectKey` la canonical source.
- Browser chi PUT vao temporary `uploads/{uploadId}/...`; backend conditional-copy object da verify sang immutable `albums/...` key. Presigned URL khong duoc target canonical key.
- Gioi han 50 anh/album duoc reserve trong serializable confirm transaction, khong chi check luc cap presigned URL.
- Album deletion dung persisted `deleteStatus=deleting` de khoa presign moi truoc khi check active sessions; 409/failure khong duoc tu dong mo lai upload.
- Khong sua noi dung migration da duoc ghi trong production `_prisma_migrations`.
- Khong duy tri `USE_MOCK_UPLOAD`; local, staging va production deu dung R2/imgproxy that voi bucket/prefix rieng.
- Production build/runtime dung Node 24 LTS; Node 26 chi la compatibility lane cho local/CI cho den khi tro thanh LTS. Docker khong duoc tiep tuc dung Node 20 da EOL.
- Backend dung R2 read/write credentials; imgproxy dung credentials read-only rieng. Khong share secret co quyen ghi/xoa cho imgproxy.
- Local, staging va production dung bucket rieng va CORS allowlist rieng; khong dung chung production bucket cho local smoke test.
- `img.ndtstudio.site` chay Cloudflare-proxied va phai co Cache Rule duoc smoke test bang `CF-Cache-Status: HIT`.
- Cold-cache resource gate phai sample memory lien tuc trong load window va verify OOM/restart state; snapshot truoc/sau khong du de chung minh peak memory.
- Production image audit phai query bang read-only DB role va reconcile moi `Image.uploadStatus=completed`, bao gom draft/unpublished records; public API pagination chi la UI smoke test.
- `IMAGE_DELIVERY_MODE` phai duoc khai bao explicit tren production; default an toan trong code la `legacy`.
- Legacy Cloudflare ID phai nam trong migration journal cho den khi observation va rollback window ket thuc.
- Moi phase phai build, test va commit rieng.
- Neu phase nao fail acceptance criteria, dung rollout va rollback phase do.

## Lenh baseline

```powershell
node --version
npm --version
npm run build --workspace=backend
npm test --workspace=backend -- --runInBand
npm run test:e2e --workspace=backend -- --runInBand
npm run build --workspace=frontend
docker build -f apps/backend/Dockerfile .
docker build -f apps/frontend/Dockerfile .
docker compose config --quiet
git status --short
```

Expected: production Docker image la Node 24 LTS, local Node 24/26 compatibility checks pass, npm version khop `packageManager`, builds/tests exit 0, Compose khong warning, worktree chi co thay doi du kien.

## Rollback tong

1. Dat `IMAGE_DELIVERY_MODE=legacy` cho cac record cu.
2. Tam khoa upload admin neu imgproxy/R2 dang co su co.
3. Redeploy backend/frontend version truoc phase dang loi.
4. Khong rollback schema bang cach drop column; giu du lieu va roll forward bang migration sua loi.
5. Chi resume upload sau khi smoke test imgproxy va R2 pass lai.

## Rollout blockers

- Khong deploy neu mutation endpoint nao thieu `@Roles('admin')` hoac non-admin E2E khong tra 403.
- Khong migrate data neu checksum Prisma chua duoc doi chieu voi `_prisma_migrations`.
- Khong cut over neu imgproxy cold-cache load test khong co continuous telemetry samples, bi OOM/restart hoac vuot 80% memory limit.
- Production rollout phai rollback va khong bat dau observation window neu DB-backed audit count khong bang total completed Image rows, co invalid `albums/` key, non-200, sai content type hoac Cloudflare delivery host.
- Khong xoa Cloudflare original neu object chua duoc verify lai trong 24 gio gan nhat hoac chua co durable inventory/checkpoint.
