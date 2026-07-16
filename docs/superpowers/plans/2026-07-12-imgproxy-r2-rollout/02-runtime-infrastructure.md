#> **Completion status — 2026-07-16:** CLOSED theo pham vi rollout duoc operator chap nhan. Checkbox `[x]` co the la da thuc thi hoac da duoc dong bang waiver/defer; xem bang chung va accepted risk trong Phase 7/8.

 Imgproxy Runtime Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Lam backend/imgproxy fail-fast khi thieu config va dua `img.ndtstudio.site` vao trang thai san sang phuc vu R2 images.

**Architecture:** Mock upload bi loai bo; local, staging va production dung bucket/CORS allowlist tach biet. Backend validate env ngay khi bootstrap va dung R2 read/write credentials; imgproxy dung credentials read-only rieng. Production build/runtime dung Node 24 LTS. Traefik terminate TLS; Cloudflare proxy/cache dung truoc imgproxy; cold-cache load test gate resource sizing truoc cutover.

**Tech Stack:** NestJS ConfigModule, Docker Compose, Traefik, Cloudflare DNS/R2, PowerShell/curl.

---

### Task 1: Align supported Node and npm runtimes

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `apps/backend/package.json`
- Modify: `apps/frontend/package.json`
- Modify: `apps/backend/Dockerfile:1-2`
- Modify: `apps/frontend/Dockerfile:1-2`

- [x] **Step 1: Declare the supported matrix**

Set production to Node 24 LTS and keep Node 26 as a local/CI compatibility lane until it becomes LTS:

```json
{
    "engines": {
        "node": ">=24 <27",
        "npm": ">=11 <12"
    },
    "packageManager": "npm@11.16.0"
}
```

Node 20 is rejected because it is EOL at rollout time.

- [x] **Step 2: Pin both Dockerfiles to Node 24 LTS**

```dockerfile
FROM node:24-alpine AS base
```

Align TypeScript runtime declarations with production:

```powershell
npm install --save-dev --workspace=backend @types/node@^24
npm install --save-dev --workspace=frontend @types/node@^24
```

- [x] **Step 3: Verify local and container versions**

```powershell
node --version
npm --version
docker build -t ndt-backend:node24 -f apps/backend/Dockerfile .
docker run --rm ndt-backend:node24 node --version
docker build -t ndt-frontend:node24 -f apps/frontend/Dockerfile .
```

Expected: local Node is 24.x or 26.x, npm is 11.x, backend container prints 24.x, and both images build from the committed lockfile.

### Task 2: Remove mock upload mode

**Files:**

- Modify: `apps/backend/src/images/storage.service.ts`
- Create: `apps/backend/src/images/storage.service.spec.ts`
- Modify: `apps/backend/src/images/images.controller.ts`
- Create: `apps/backend/src/images/images.controller.spec.ts`
- Delete: `apps/backend/src/images/cloudflare.service.ts`
- Modify: `apps/frontend/src/lib/api/client.ts`
- Modify: `apps/backend/Dockerfile`
- Modify: `.env.example`

- [x] **Step 1: Viet failing tests khong chap nhan mock URL**

StorageService test mock `@aws-sdk/s3-request-presigner.getSignedUrl`, call `getPresignedUploadUrl`, assert returned URL la presigned value va `ConfigService.get` khong bao gio duoc goi voi `USE_MOCK_UPLOAD`. Controller test assert:

```ts
expect('mockUpload' in ImagesController.prototype).toBe(false);
expect(config.get).not.toHaveBeenCalledWith('USE_MOCK_UPLOAD');
expect(getSignedUrl).toHaveBeenCalledTimes(1);
```

Frontend khong co unit-test runner tai phase nay, nen Step 5 build frontend va static search la gate cho `uploadFile`: `rg -n "isMockUpload|FormData|mock-upload" apps/frontend/src/lib/api/client.ts` phai khong co match; implementation exact nam o Step 3.

- [x] **Step 2: Remove backend mock branches and the dead Cloudflare service**

Xoa `isMockUpload`, mock URL branch va `USE_MOCK_UPLOAD` lookup trong `StorageService`. Xoa hai route `PUT/POST images/mock-upload/:uploadId`, Multer imports va disk storage config trong controller.

Xoa `apps/backend/src/images/cloudflare.service.ts` trong phase nay. Service khong con duoc `ImagesModule` provide/import va legacy rollback chi doc stored variant URLs, nen giu file den phase 08 chi de lai mock branches va Cloudflare credentials/logging khong duoc su dung. Truoc khi xoa, chay:

```powershell
rg -n "CloudflareService|cloudflare\.service" apps/backend/src -g '!**/cloudflare.service.ts'
```

Expected: khong co consumer.

- [x] **Step 3: Remove frontend mock branch**

Rut gon `uploadFile` thanh:

```ts
xhr.open('PUT', url);
xhr.setRequestHeader('Content-Type', file.type);
xhr.send(file);
```

- [x] **Step 4: Remove local upload directory setup**

Xoa `uploads` directory creation khoi backend Dockerfile va xoa `USE_MOCK_UPLOAD` khoi `.env.example`/operator env.

- [x] **Step 5: Run focused tests/build**

```powershell
npm test --workspace=backend -- storage.service.spec.ts images.controller.spec.ts --runInBand
npm run build --workspace=backend
npm run build --workspace=frontend
rg -n "USE_MOCK_UPLOAD|mock-upload" apps/backend/src apps/frontend/src .env.example docker-compose.yml -g '!**/*.spec.ts'
```

Expected: build/test commands exit 0. Lenh `rg` exit 1 vi runtime source/config khong con match; regression specs duoc exclude vi co chuoi literal de assert mock mode khong duoc doc.

### Task 3: Them fail-fast environment validation

**Files:**

- Create: `apps/backend/src/config/env.validation.ts`
- Create: `apps/backend/src/config/env.validation.spec.ts`
- Modify: `apps/backend/src/app.module.ts:15-19`
- Modify: `.env.example:15-37`

- [x] **Step 1: Viet validation tests**

Test cac truong hop: thieu base URL, key khong phai hex, salt rong, endpoint khong phai HTTPS, va config R2/imgproxy hop le. Khong co mock-mode exception.

```ts
expect(() => validateEnv({ ...validEnv, IMGPROXY_BASE_URL: '' })).toThrow('IMGPROXY_BASE_URL');
expect(() => validateEnv({ ...validEnv, IMGPROXY_KEY: 'not-hex' })).toThrow('IMGPROXY_KEY');
expect(validateEnv(validEnv)).toMatchObject(validEnv);
```

- [x] **Step 2: Chay test fail**

```powershell
npm test --workspace=backend -- env.validation.spec.ts --runInBand
```

Expected: FAIL vi `validateEnv` chua ton tai.

- [x] **Step 3: Implement validation khong them dependency moi**

`validateEnv` phai kiem tra cac bien:

```text
CLOUDFLARE_R2_BUCKET_NAME
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_S3_ENDPOINT
IMGPROXY_KEY
IMGPROXY_SALT
IMGPROXY_BASE_URL
```

Key/salt phai la even-length hex; endpoint/base URL phai la HTTPS trong production. Imgproxy read-only credentials khong duoc dua vao backend process; chung chi duoc Compose validate va pass cho imgproxy container.

- [x] **Step 4: Wire validation vao ConfigModule**

```ts
ConfigModule.forRoot({
  isGlobal: true,
  validate: validateEnv,
}),
```

- [x] **Step 5: Chay tests/build**

```powershell
npm test --workspace=backend -- env.validation.spec.ts --runInBand
npm run build --workspace=backend
```

Expected: PASS va build exit 0.

### Task 4: Hoan thien deployment variables va least-privilege credentials

**Files:**

- Modify: `.env.example`
- Modify: `docker-compose.yml:28-90`

- [x] **Step 1: Dam bao `.env.example` co gia tri mau day du**

```dotenv
CLOUDFLARE_R2_BUCKET_NAME=ndt-studio-images
R2_ACCESS_KEY_ID=replace-with-r2-access-key-id
R2_SECRET_ACCESS_KEY=replace-with-r2-secret-access-key
R2_S3_ENDPOINT=https://account-id.r2.cloudflarestorage.com
IMGPROXY_R2_ACCESS_KEY_ID=replace-with-r2-read-only-access-key-id
IMGPROXY_R2_SECRET_ACCESS_KEY=replace-with-r2-read-only-secret-access-key
IMGPROXY_KEY=replace-with-64-character-hex-value
IMGPROXY_SALT=replace-with-64-character-hex-value
IMGPROXY_BASE_URL=https://img.ndtstudio.site
```

`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` co quyen Object Read & Write cho bucket cua environment. `IMGPROXY_R2_ACCESS_KEY_ID`/`IMGPROXY_R2_SECRET_ACCESS_KEY` chi co Object Read cho dung bucket; token nay khong duoc co quyen Put/Delete hoac truy cap bucket cua environment khac.

Generate production values ngoai repo:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- [x] **Step 2: Set production secrets trong Dokploy/host secret store**

Khong ghi production values vao `.env`, Compose YAML, log hoac plan.

- [x] **Step 3: Validate Compose interpolation**

Compose imgproxy phai dung read-only pair:

```yaml
AWS_ACCESS_KEY_ID: ${IMGPROXY_R2_ACCESS_KEY_ID:?IMGPROXY_R2_ACCESS_KEY_ID is required}
AWS_SECRET_ACCESS_KEY: ${IMGPROXY_R2_SECRET_ACCESS_KEY:?IMGPROXY_R2_SECRET_ACCESS_KEY is required}
```

Backend tiep tuc dung `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`. Dung `${VAR:?message}` cho tat ca production-required variables de missing secret lam `docker compose config` fail thay vi default thanh chuoi rong.

```powershell
docker compose config --quiet
```

Expected: exit 0 va khong con warning `IMGPROXY_BASE_URL variable is not set`.

### Task 5: Cloudflare-proxied DNS, TLS, cache va environment-specific R2 CORS

- [x] **Step 1: Tao DNS record**

Tao `img.ndtstudio.site` tro den cung ingress/Traefik dang phuc vu `api.ndtstudio.site` va bat Cloudflare proxy (orange-cloud), khong dung DNS-only.

- [x] **Step 2: Verify DNS va TLS**

Cloudflare SSL/TLS mode phai la `Full (strict)` va origin certificate cho `img.ndtstudio.site` phai valid; khong dung Flexible mode.

```powershell
Resolve-DnsName img.ndtstudio.site
curl.exe -sS -o NUL -w "%{http_code}`n" https://img.ndtstudio.site/health
```

Expected: DNS co A/AAAA/CNAME hop le va health tra HTTP 200.

- [x] **Step 3: Cau hinh R2 CORS rieng cho tung bucket**

Production bucket:

```json
[
    {
        "AllowedOrigins": ["https://ndtstudio.site", "https://www.ndtstudio.site"],
        "AllowedMethods": ["PUT", "HEAD"],
        "AllowedHeaders": ["Content-Type"],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": 3600
    }
]
```

Staging bucket chi allow staging frontend origin. Local-development bucket chi allow cac local origins dang dung, vi du:

```json
[
    {
        "AllowedOrigins": ["http://localhost:3000", "http://localhost:3001"],
        "AllowedMethods": ["PUT", "HEAD"],
        "AllowedHeaders": ["Content-Type"],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": 3600
    }
]
```

Khong them wildcard origin va khong cho local/staging credentials truy cap production bucket.

- [x] **Step 4: Chay browser preflight smoke test cho ca ba environment**

Expected: OPTIONS/PUT tu origin duoc allow cua local, staging va production khong bi CORS block; mot origin ngoai allowlist bi reject.

- [x] **Step 5: Tao Cloudflare Cache Rule**

```text
When hostname equals img.ndtstudio.site
And URI path does not equal /health
Cache eligibility: Eligible for cache
Edge TTL: Respect origin Cache-Control
Browser TTL: Respect origin
Cache key: Full URI
```

- [x] **Step 6: Enable the rule and gate completion on Task 6**

Khong danh dau Cache Rule hoan thanh chi vi dashboard da save. Functional HIT verification duoc thuc hien boi real R2 smoke script trong Task 6.

### Task 6: Verify the real S3/R2 source path and resource budget

**Files:**

- Create: `apps/backend/scripts/smoke-r2-imgproxy.ts`
- Create: `apps/backend/scripts/load-imgproxy-cold-cache.ts`
- Modify: `docker-compose.yml`

- [x] **Step 1: Upload a deterministic 1x1 PNG test object**

Script upload `smoke/imgproxy-r2-source.png` bang `PutObjectCommand` vao configured R2 bucket voi `Content-Type: image/png`.

- [x] **Step 2: Generate URL through ImageUrlService and fetch it twice**

Script phai goi URL duoc sinh tu configured bucket va object key `smoke/imgproxy-r2-source.png` hai lan, sau do require:

```text
first status = 200
second status = 200
content-type = image/webp
body length > 0
second CF-Cache-Status = HIT
cache-control contains max-age=31536000
```

- [x] **Step 3: Delete smoke object in a finally block**

Script phai cleanup object ngay ca khi fetch/imgproxy verification fail.

- [x] **Step 4: Run smoke script against staging and production infrastructure**

```powershell
npx tsx apps/backend/scripts/smoke-r2-imgproxy.ts
```

Expected: exit 0; imgproxy logs cho thay source scheme `s3`; Cloudflare response lan hai la cache HIT.

- [x] **Step 5: Set conservative initial imgproxy resources**

```yaml
environment:
    IMGPROXY_CONCURRENCY: 2
    IMGPROXY_MAX_SRC_RESOLUTION: 50
deploy:
    resources:
        limits:
            cpus: '2.0'
            memory: 1G
```

Day la baseline ban dau, khong phai con so duoc chap nhan vo dieu kien. Chi tang concurrency sau khi load test cho thay memory headroom.

- [x] **Step 6: Run a representative cold-cache load test**

`load-imgproxy-cold-cache.ts` upload toi thieu 10 object key rieng biet, bao gom anh co resolution lon nhat duoc phep, fetch medium/large variants voi concurrency 2, va report p50/p95, HTTP status va body size.

Script phai tu capture container telemetry trong toan bo load window:

1. Doc `docker inspect imgproxy --format '{{json .State}}'` va `{{.RestartCount}}` truoc test.
2. Spawn `docker stats imgproxy --format '{{json .}}'` o streaming mode, parse moi sample `MemPerc`/`MemUsage`, va giu maximum quan sat duoc. Sampling phai bat dau truoc request dau tien va chi dung sau request cuoi cung.
3. Doc lai state/restart count sau test; require `OOMKilled=false`, container van running va restart count khong tang.
4. Atomic-write evidence JSON gom `startedAt`, `finishedAt`, request counts, p50/p95, `samples`, `peakMemoryPercent`, `peakMemoryUsage`, `memoryLimit`, restart counts va OOM state. Script exit non-zero neu khong thu duoc sample telemetry.

```powershell
New-Item -ItemType Directory -Force artifacts | Out-Null
npx tsx apps/backend/scripts/load-imgproxy-cold-cache.ts --container=imgproxy --evidence=artifacts/imgproxy-cold-cache.json
Get-Content artifacts/imgproxy-cold-cache.json
```

Expected: 100% HTTP 200, `samples > 0`, khong OOM/restart, `peakMemoryPercent < 80`, va p95 nam trong SLO duoc ghi vao deployment evidence. Snapshot truoc/sau khong duoc dung thay peak sampling. Script stop telemetry process va cleanup moi test object trong `finally`.

- [x] **Step 7: Commit repo-side config and smoke scripts**

```powershell
git add package.json package-lock.json .env.example docker-compose.yml apps/backend/package.json apps/frontend/package.json apps/backend/Dockerfile apps/frontend/Dockerfile apps/backend/src apps/backend/scripts/smoke-r2-imgproxy.ts apps/backend/scripts/load-imgproxy-cold-cache.ts apps/frontend/src/lib/api/client.ts
git commit -m "build(images): validate and smoke test imgproxy R2 runtime"
```

## Acceptance criteria

- Backend fail startup voi message ro rang neu thieu env.
- Production containers dung Node 24 LTS; Node 20 khong con trong Dockerfiles.
- Compose khong warning.
- DNS/TLS health tra 200.
- Browser co the PUT mot test object vao R2.
- Imgproxy doc test object tu R2 va tra image/webp.
- Imgproxy dung read-only R2 credentials va cold-cache load test khong OOM/restart.
- Local, staging va production upload duoc voi bucket/CORS allowlist rieng; origin ngoai allowlist bi reject.
- Cloudflare proxy tra `CF-Cache-Status: HIT` cho request lap lai.
- Runtime source khong con mock upload mode.
