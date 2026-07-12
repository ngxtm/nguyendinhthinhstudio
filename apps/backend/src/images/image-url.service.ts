import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

@Injectable()
export class ImageUrlService {
  private readonly keyBuffer: Buffer;
  private readonly saltBuffer: Buffer;
  private readonly imgproxyBaseUrl: string;
  private readonly r2BuckName: string;

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

  sign(path: string): string {
    const hmac = createHmac('sha256', this.keyBuffer)
      .update(this.saltBuffer)
      .update(path);
    return hmac.digest('base64url');
  }

  getSignedUrl(objectKey: string, width: number, height: number): string {
    const sourceUrl = `s3://${this.r2BuckName}/${objectKey}`;
    const encodedSource = Buffer.from(sourceUrl).toString('base64url');
    const path = `/rs:fit:${width}:${height}/q:80/f:webp/${encodedSource}`;
    const signature = this.sign(path);
    return `${this.imgproxyBaseUrl}/${signature}${path}`;
  }

  getVariantUrls(objectKey: string) {
    return {
      thumbnailUrl: this.getSignedUrl(objectKey, 400, 400),
      smallUrl: this.getSignedUrl(objectKey, 800, 800),
      mediumUrl: this.getSignedUrl(objectKey, 1200, 1200),
      largeUrl: this.getSignedUrl(objectKey, 1920, 1920),
      xlargeUrl: this.getSignedUrl(objectKey, 2560, 2560),
    };
  }
}
