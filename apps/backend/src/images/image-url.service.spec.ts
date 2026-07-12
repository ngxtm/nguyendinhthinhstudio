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
    get: (key: string) => values[key],
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
