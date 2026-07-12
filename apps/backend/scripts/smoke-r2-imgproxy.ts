import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { ImageUrlService } from '../src/images/image-url.service';
import { validateEnv } from '../src/config/env.validation';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL6+wAAAABJRU5ErkJggg==',
  'base64',
);
const objectKey = 'smoke/imgproxy-r2-source.png';

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function createR2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: getRequiredEnv('R2_S3_ENDPOINT'),
    credentials: {
      accessKeyId: getRequiredEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: getRequiredEnv('R2_SECRET_ACCESS_KEY'),
    },
  });
}

async function fetchVariant(url: string): Promise<{
  status: number;
  contentType: string | null;
  cacheStatus: string | null;
  cacheControl: string | null;
  bodyLength: number;
}> {
  const response = await fetch(url);
  const body = await response.arrayBuffer();

  return {
    status: response.status,
    contentType: response.headers.get('content-type'),
    cacheStatus: response.headers.get('cf-cache-status'),
    cacheControl: response.headers.get('cache-control'),
    bodyLength: body.byteLength,
  };
}

function requireResponse(
  label: string,
  response: Awaited<ReturnType<typeof fetchVariant>>,
): void {
  if (response.status !== 200) {
    throw new Error(`${label} imgproxy request returned HTTP ${response.status}`);
  }
  if (response.contentType !== 'image/webp') {
    throw new Error(`${label} response content-type must be image/webp, got ${response.contentType}`);
  }
  if (response.bodyLength === 0) {
    throw new Error(`${label} response body is empty`);
  }
}

async function main(): Promise<void> {
  validateEnv(process.env);

  const bucket = getRequiredEnv('CLOUDFLARE_R2_BUCKET_NAME');
  const r2 = createR2Client();
  const imageUrl = new ImageUrlService(new ConfigService(process.env));

  try {
    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: ONE_PIXEL_PNG,
        ContentType: 'image/png',
      }),
    );

    const url = imageUrl.getSignedUrl(objectKey, 1, 1);
    const first = await fetchVariant(url);
    const second = await fetchVariant(url);
    requireResponse('First', first);
    requireResponse('Second', second);

    if (second.cacheStatus !== 'HIT') {
      throw new Error(`Second request must be a Cloudflare cache HIT, got ${second.cacheStatus}`);
    }
    if (!second.cacheControl?.includes('max-age=31536000')) {
      throw new Error(`Second response cache-control must include max-age=31536000, got ${second.cacheControl}`);
    }

    console.log(`First request: HTTP ${first.status}, ${first.bodyLength} bytes`);
    console.log(`Second request: HTTP ${second.status}, ${second.bodyLength} bytes, CF-Cache-Status: ${second.cacheStatus}`);
  } finally {
    await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
