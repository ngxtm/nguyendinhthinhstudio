# Imgproxy URL Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sinh URL imgproxy hop le, ky dung va an toan voi moi R2 object key.

**Architecture:** `ImageUrlService` tao source `s3://bucket/objectKey`, encode source bang Base64URL, ghep processing path, sau do ky HMAC-SHA256 tren chinh path se gui den imgproxy. Variant URLs duoc sinh runtime tu canonical `r2ObjectKey`.

**Tech Stack:** NestJS, TypeScript, Node `crypto`, Jest, imgproxy v3.30.1, Docker.

---

### Task 1: Them regression tests cho URL format

**Files:**

- Create: `apps/backend/src/images/image-url.service.spec.ts`
- Create: `apps/backend/scripts/smoke-imgproxy-url.ts`
- Modify: `apps/backend/src/images/image-url.service.ts:1-45`

- [ ] **Step 1: Viet test fail cho source encoding va signing**

```ts
import { ConfigService } from '@nestjs/config';
import { ImageUrlService } from './image-url.service';

describe('ImageUrlService', () => {
    const values: Record<string, string> = {
        IMGPROXY_KEY: '11'.repeat(32),
        IMGPROXY_SALT: '22'.repeat(32),
        IMGPROXY_BASE_URL: 'https://img.ndtstudio.site/',
        CLOUDFLARE_R2_BUCKET_NAME: 'ndt-studio-images',
    };

    const service = new ImageUrlService({
        getOrThrow: (key: string) => values[key],
    } as ConfigService);

    it('encodes the complete S3 source as base64url', () => {
        const objectKey = 'albums/a/uuid-anh cuoi #1.jpg';
        const source = `s3://ndt-studio-images/${objectKey}`;
        const encodedSource = Buffer.from(source).toString('base64url');
        expect(service.getSignedUrl(objectKey, 400, 400)).toContain(
            `/rs:fit:400:400/q:80/f:webp/${encodedSource}`,
        );
    });

    it('removes a trailing slash from the base URL', () => {
        expect(service.getSignedUrl('albums/a/image.jpg', 400, 400)).toMatch(
            /^https:\/\/img\.ndtstudio\.site\/[^/]+\/rs:/,
        );
    });

    it('generates all five variants', () => {
        expect(Object.keys(service.getVariantUrls('albums/a/image.jpg'))).toEqual([
            'thumbnailUrl',
            'smallUrl',
            'mediumUrl',
            'largeUrl',
            'xlargeUrl',
        ]);
    });
});
```

- [ ] **Step 2: Chay test de xac nhan no fail voi implementation hien tai**

```powershell
npm test --workspace=backend -- image-url.service.spec.ts --runInBand
```

Expected: FAIL vi source `s3://...` dang duoc chen raw va base URL tao double slash.

- [ ] **Step 3: Encode source va chuan hoa base URL**

```ts
constructor(private readonly config: ConfigService) {
  const imgproxyKey = this.config.getOrThrow<string>('IMGPROXY_KEY');
  const imgproxySalt = this.config.getOrThrow<string>('IMGPROXY_SALT');

  this.keyBuffer = Buffer.from(imgproxyKey, 'hex');
  this.saltBuffer = Buffer.from(imgproxySalt, 'hex');
  this.imgproxyBaseUrl = this.config
    .getOrThrow<string>('IMGPROXY_BASE_URL')
    .replace(/\/$/, '');
  this.r2BuckName = this.config.getOrThrow<string>(
    'CLOUDFLARE_R2_BUCKET_NAME',
  );
}

getSignedUrl(objectKey: string, width: number, height: number): string {
  const sourceUrl = `s3://${this.r2BuckName}/${objectKey}`;
  const encodedSource = Buffer.from(sourceUrl).toString('base64url');
  const path = `/rs:fit:${width}:${height}/q:80/f:webp/${encodedSource}`;
  const signature = this.sign(path);
  return `${this.imgproxyBaseUrl}/${signature}${path}`;
}
```

- [ ] **Step 4: Chay unit tests va backend build**

```powershell
npm test --workspace=backend -- image-url.service.spec.ts --runInBand
npm run build --workspace=backend
```

Expected: test suite PASS va Nest build exit 0.

### Task 2: Kiem chung bang imgproxy that

- [ ] **Step 1: Start imgproxy v3.30.1 voi test key/salt**

```powershell
$keyHex = '11' * 32
$saltHex = '22' * 32
docker run --rm -d --name ndt-imgproxy-test -p 18080:8080 `
  -e "IMGPROXY_KEY=$keyHex" `
  -e "IMGPROXY_SALT=$saltHex" `
  darthsim/imgproxy:v3.30.1
```

- [ ] **Step 2: Tao smoke helper dung cung signing implementation**

```ts
import { ConfigService } from '@nestjs/config';
import { ImageUrlService } from '../src/images/image-url.service';

const values: Record<string, string> = {
    IMGPROXY_KEY: '11'.repeat(32),
    IMGPROXY_SALT: '22'.repeat(32),
    IMGPROXY_BASE_URL: 'http://localhost:18080',
    CLOUDFLARE_R2_BUCKET_NAME: 'unused-for-http-smoke',
};
const service = new ImageUrlService({
    getOrThrow: (key: string) => values[key],
} as ConfigService);
const source = Buffer.from('https://httpbin.org/image/png').toString('base64url');
const path = `/rs:fit:50:50/q:80/f:webp/${source}`;
const response = await fetch(`http://localhost:18080/${service.sign(path)}${path}`);
if (response.status !== 200 || response.headers.get('content-type') !== 'image/webp') {
    throw new Error(
        `imgproxy smoke failed: ${response.status} ${response.headers.get('content-type')}`,
    );
}
console.log(`HTTP ${response.status}`);
console.log(`Content-Type: ${response.headers.get('content-type')}`);
```

- [ ] **Step 3: Run smoke helper**

```powershell
npx tsx apps/backend/scripts/smoke-imgproxy-url.ts
```

Expected:

```text
HTTP 200
Content-Type: image/webp
```

- [ ] **Step 4: Stop test container**

```powershell
docker stop ndt-imgproxy-test
```

- [ ] **Step 5: Commit phase**

```powershell
git add apps/backend/src/images/image-url.service.ts apps/backend/src/images/image-url.service.spec.ts apps/backend/scripts/smoke-imgproxy-url.ts
git commit -m "fix(images): generate valid signed imgproxy URLs"
```

## Acceptance criteria

- Current `Unknown processing option https` regression co test bao ve.
- Filename co space, Unicode va reserved characters khong lam sai signature.
- Khong co double slash sau domain.
- Backend build va image URL smoke test deu pass.
