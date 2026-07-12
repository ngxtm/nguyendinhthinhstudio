import { ConfigService } from '@nestjs/config';
import { ImageUrlService } from '../src/images/image-url.service';

const values: Record<string, string> = {
  IMGPROXY_KEY: '11'.repeat(32),
  IMGPROXY_SALT: '22'.repeat(32),
  IMGPROXY_BASE_URL: 'http://localhost:18080',
  CLOUDFLARE_R2_BUCKET_NAME: 'unused-for-http-smoke',
};
const sourceUrl =
  process.env.IMGPROXY_SMOKE_SOURCE_URL ??
  'http://ndt-imgproxy-smoke-source/imgproxy-smoke.svg';

async function main(): Promise<void> {
  const service = new ImageUrlService({
    getOrThrow: (key: string) => values[key],
  } as ConfigService);
  const source = Buffer.from(sourceUrl).toString('base64url');
  const path = `/rs:fit:50:50/q:80/f:webp/${source}`;
  const response = await fetch(
    `http://localhost:18080/${service.sign(path)}${path}`,
  );

  if (
    response.status !== 200 ||
    response.headers.get('content-type') !== 'image/webp'
  ) {
    throw new Error(
      `imgproxy smoke failed: ${response.status} ${response.headers.get('content-type')}`,
    );
  }

  console.log(`HTTP ${response.status}`);
  console.log(`Content-Type: ${response.headers.get('content-type')}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
