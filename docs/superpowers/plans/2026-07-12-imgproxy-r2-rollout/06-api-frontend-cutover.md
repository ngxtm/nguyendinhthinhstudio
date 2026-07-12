# Image Delivery API and Frontend Cutover Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyen API va frontend sang imgproxy URLs ma van co legacy fallback cho records cu.

**Architecture:** Database luu canonical `r2ObjectKey` va tam giu Cloudflare variant URLs. Backend presenter sinh imgproxy variants runtime theo `IMAGE_DELIVERY_MODE`; frontend chi consume generic image fields va khong biet provider.

**Tech Stack:** NestJS, Prisma, Next.js 16, React 19, Jest.

---

### Task 1: Add provider-neutral image presenter

**Files:**

- Create: `apps/backend/src/images/image-presenter.service.ts`
- Create: `apps/backend/src/images/image-presenter.service.spec.ts`
- Modify: `apps/backend/src/images/images.module.ts`
- Modify: `apps/backend/src/images/images.service.ts`
- Modify: `apps/backend/src/albums/albums.service.ts`
- Modify: `apps/backend/src/albums/recommendation.service.ts`
- Create: `apps/backend/src/albums/recommendation.service.spec.ts`
- Modify: `apps/backend/src/tags/tags.service.ts`
- Modify: `apps/backend/src/config/env.validation.ts`
- Modify: `apps/backend/src/config/env.validation.spec.ts`
- Modify: `.env.example`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Define delivery modes**

```ts
type ImageDeliveryMode = 'legacy' | 'imgproxy' | 'auto';
```

Wire deployment config:

```dotenv
IMAGE_DELIVERY_MODE=legacy
```

`docker-compose.yml` phai pass `IMAGE_DELIVERY_MODE=${IMAGE_DELIVERY_MODE}` cho backend. `validateEnv` reject value ngoai enum; production reject missing value. Presenter dung `legacy` lam code default chi de unit/local safety, khong thay the production explicit config.

Behavior:

```text
legacy: return stored variant URLs
imgproxy: require r2ObjectKey with albums/ prefix and return generated URLs
auto: generated URLs for R2 keys, stored URLs for legacy records
```

- [ ] **Step 2: Write presenter tests**

Test nested cover image, album images, legacy key, R2 key, object khong co image relation, invalid mode, local missing mode -> legacy, va production missing mode -> validation error.

- [ ] **Step 3: Implement presenter without mutating Prisma objects**

```ts
import type { Image } from '@prisma/client';

presentImage<T extends Image>(image: T): T {
  const objectKey = image.r2ObjectKey;
  if (!objectKey || !this.shouldUseImgproxy(objectKey)) return image;
  return { ...image, ...this.imageUrl.getVariantUrls(objectKey) };
}
```

- [ ] **Step 4: Apply presenter to every concrete read path**

`AlbumsService.presentAlbum` phai map ca `coverImage` va moi item trong `images` qua `ImagePresenterService` truoc khi return. Goi/verify presenter tai:

```text
ImagesService.findByAlbum -> every returned image
AlbumsService.create -> coverImage
AlbumsService.findAll -> every coverImage
AlbumsService.findBySlug -> coverImage and images
AlbumsService.update -> coverImage
AlbumsService.setCover -> coverImage and images
AlbumsService.toggleFeatured -> coverImage
TagsService.getAlbumsBySlug -> through AlbumsService.presentAlbum
RecommendationService.getRelatedAlbums -> every coverImage before caching and on cache hit
```

Them regression tests cho tung shape tren. Test recommendation phai goi hai lan de chung minh cached response cung da duoc present, khong chi fresh query.

- [ ] **Step 5: Run backend tests/build**

```powershell
npm test --workspace=backend -- image-presenter.service.spec.ts --runInBand
npm test --workspace=backend -- recommendation.service.spec.ts --runInBand
npm run build --workspace=backend
```

Expected: PASS.

### Task 2: Make frontend contracts provider-neutral

**Files:**

- Modify: `apps/frontend/src/lib/api/albums.ts:33-47`
- Modify: `apps/frontend/src/lib/api/images.ts:1-80`
- Modify: comments/labels in admin image components

- [ ] **Step 1: Replace provider-specific field**

```ts
export interface Image {
    id: string;
    albumId?: string;
    filename: string;
    r2ObjectKey?: string;
    thumbnailUrl: string;
    smallUrl: string;
    mediumUrl: string;
    largeUrl: string;
    xlargeUrl: string;
    altText?: string;
    orderIndex: number;
    width?: number;
    height?: number;
}
```

- [ ] **Step 2: Remove fake `cloudflareImageId` confirm payload**

Frontend chi gui `{ uploadId }` den `/images/confirm-upload`.

- [ ] **Step 3: Build frontend**

```powershell
npm run build --workspace=frontend
```

Expected: exit 0.

### Task 3: Migrate static homepage assets

**Files:**

- Modify: `apps/frontend/src/config/images.ts`
- Modify: `apps/frontend/next.config.mjs`
- Create: `apps/backend/scripts/download-static-cloudflare-images.ts`
- Create: `apps/backend/data/cloudflare-static-image-inventory.json`
- Modify: `apps/backend/prisma/schema.prisma`
- Create: `apps/backend/prisma/migrations/20260712000160_add_cloudflare_static_asset_migration/migration.sql`
- Modify: `apps/backend/package.json`
- Modify: `package-lock.json`
- Create: `apps/frontend/public/images/home/hero-01.webp`
- Create: `apps/frontend/public/images/home/hero-02.webp`
- Create: `apps/frontend/public/images/home/hero-03.webp`
- Create: `apps/frontend/public/images/home/hero-04.webp`
- Create: `apps/frontend/public/images/home/collection-01.webp`
- Create: `apps/frontend/public/images/home/collection-02.webp`
- Create: `apps/frontend/public/images/home/collection-03.webp`
- Create: `apps/frontend/public/images/home/collection-04.webp`
- Create: `apps/frontend/public/images/home/collection-05.webp`
- Create: `apps/frontend/public/images/home/collection-06.webp`

- [ ] **Step 1: Generate a durable inventory for all 10 hard-coded IDs**

`download-static-cloudflare-images.ts` dung `CLOUDFLARE_IMAGES_READ_TOKEN`, download dung 10 IDs hien co trong `images.ts`, stream SHA-256 source, optimize WebP bang `sharp`, stream SHA-256 target va ghi manifest. ID-to-path mapping bat buoc:

```text
09389f8a-bd47-409d-f057-c456f492da00 -> public/images/home/hero-01.webp
be5b07b5-3a85-48f7-af0c-8e8a778b7f00 -> public/images/home/hero-02.webp
444f1148-63fd-43f6-111f-7503dfc40700 -> public/images/home/hero-03.webp
1d54a960-726a-41af-a31a-778f8ff87900 -> public/images/home/hero-04.webp
b1799cea-19c8-478a-fd08-cbb64b633f00 -> public/images/home/collection-01.webp
b33f71fd-e65c-42dc-f50b-ceb2dfc51400 -> public/images/home/collection-02.webp
4b41393a-7fbe-4c33-2cfe-4aea40447500 -> public/images/home/collection-03.webp
a9b39412-e44b-4bf9-f101-8838a8096000 -> public/images/home/collection-04.webp
098f40e8-2e7a-4bac-a4e9-1c75dcdbfe00 -> public/images/home/collection-05.webp
9d7c5ca4-9072-4a45-3d46-c907d4b74b00 -> public/images/home/collection-06.webp
```

Moi manifest row gom `legacyCloudflareImageId`, `localPath`, `sourceSha256`, `targetSha256`, `targetBytes`, `downloadedAt`. Script validate dung 10 unique IDs/paths va atomic-write manifest chi sau khi ca 10 file thanh cong. Day la durable inventory de phase 08 cleanup; khong suy ra ID tu URL sau nay.

```powershell
npm install --save-dev --workspace=backend sharp
npx tsx apps/backend/scripts/download-static-cloudflare-images.ts
```

Expected: 10 WebP non-empty, 10 manifest rows, moi hash la 64 lowercase hex, va rerun tao cung target hash voi cung source.

- [ ] **Step 2: Import static inventory into a durable cleanup journal**

```prisma
model CloudflareStaticAssetMigration {
  legacyCloudflareImageId String   @id
  localPath               String   @unique
  sourceSha256            String
  targetSha256            String
  targetBytes             Int
  deployedVerifiedAt      DateTime?
  cloudflareDeletedAt     DateTime?
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
}
```

Download script upsert manifest rows vao table sau khi migration deploy. Model khong co FK den Image. Manifest la reproducible checked-in inventory; PostgreSQL row la durable production verification/deletion checkpoint.

```powershell
npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma
npx tsx apps/backend/scripts/download-static-cloudflare-images.ts --import-manifest
```

Expected: migration deploy pass va table co dung 10 rows khop manifest; rerun chi update cung rows, khong duplicate.

- [ ] **Step 3: Replace provider-specific naming**

```ts
interface SiteImage {
    src: string;
    alt: string;
    priority?: boolean;
}
```

- [ ] **Step 4: Replace `imagedelivery.net` URLs**

```ts
const heroImagePaths = [
    '/images/home/hero-01.webp',
    '/images/home/hero-02.webp',
    '/images/home/hero-03.webp',
    '/images/home/hero-04.webp',
];

const collectionImagePaths = [
    '/images/home/collection-01.webp',
    '/images/home/collection-02.webp',
    '/images/home/collection-03.webp',
    '/images/home/collection-04.webp',
    '/images/home/collection-05.webp',
    '/images/home/collection-06.webp',
];
```

- [ ] **Step 5: Giu remote pattern trong observation window**

Khong can remote pattern cho local homepage assets. Giu `imagedelivery.net` tam thoi cho rollback va xoa o phase cleanup.

- [ ] **Step 6: Build va inspect homepage HTML**

```powershell
npm run build --workspace=frontend
```

Expected: homepage image sources khong con phat sinh moi tu Cloudflare config.

### Task 4: Controlled cutover

- [ ] **Step 1: Deploy voi `IMAGE_DELIVERY_MODE=auto`**

Legacy records van Cloudflare; migrated R2 records dung imgproxy.

- [ ] **Step 2: Verify staging, sau do production**

Kiem tra gallery list/detail, metadata, PhotoSwipe, related albums va admin grid.

- [ ] **Step 3: Switch sang `imgproxy` khi reconcile legacy = 0**

Neu co broken image, rollback `IMAGE_DELIVERY_MODE=auto` hoac `legacy` cho old records.

- [ ] **Step 4: Commit phase**

```powershell
git add package-lock.json .env.example docker-compose.yml apps/backend/package.json apps/backend/prisma apps/backend/scripts/download-static-cloudflare-images.ts apps/backend/data/cloudflare-static-image-inventory.json apps/backend/src apps/frontend/src apps/frontend/public/images/home apps/frontend/next.config.mjs
git commit -m "feat(images): cut over API and frontend to imgproxy"
```

## Acceptance criteria

- Signed URLs duoc sinh runtime tu `r2ObjectKey`.
- Frontend types/comments khong con contract Cloudflare.
- Homepage static assets khong con phu thuoc Cloudflare Images.
- Muoi static Cloudflare IDs co checked-in manifest voi source/target SHA-256 va local path de cleanup co the reconcile theo managed ID.
- Delivery mode cho phep rollback old records ma khong sua DB.
- Production delivery mode duoc validate va khai bao explicit trong deployment config.
