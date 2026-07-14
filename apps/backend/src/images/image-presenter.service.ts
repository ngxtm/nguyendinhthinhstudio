import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Image } from '@prisma/client';
import { ImageUrlService } from './image-url.service';

export type ImageDeliveryMode = 'legacy' | 'imgproxy' | 'auto';

const IMAGE_DELIVERY_MODES: readonly ImageDeliveryMode[] = [
  'legacy',
  'imgproxy',
  'auto',
];

@Injectable()
export class ImagePresenterService {
  private readonly deliveryMode: ImageDeliveryMode;

  constructor(
    private readonly imageUrl: ImageUrlService,
    config: ConfigService,
  ) {
    const configuredMode =
      config.get<string>('IMAGE_DELIVERY_MODE') ?? 'legacy';

    if (!this.isDeliveryMode(configuredMode)) {
      throw new Error(
        `Invalid IMAGE_DELIVERY_MODE: ${String(configuredMode)}`,
      );
    }

    this.deliveryMode = configuredMode;
  }

  presentImage<T extends Image>(image: T): T {
    const objectKey = image.r2ObjectKey;

    if (!objectKey) {
      if (this.deliveryMode === 'imgproxy') {
        throw new Error(
          'imgproxy delivery requires an albums/ R2 object key',
        );
      }

      return image;
    }

    if (!this.shouldUseImgproxy(objectKey)) {
      return image;
    }

    return {
      ...image,
      ...this.imageUrl.getVariantUrls(objectKey),
    };
  }

  private shouldUseImgproxy(objectKey: string): boolean {
    if (this.deliveryMode === 'legacy') {
      return false;
    }

    const isR2Key = objectKey.startsWith('albums/');

    if (this.deliveryMode === 'imgproxy' && !isR2Key) {
      throw new Error(
        'imgproxy delivery requires an albums/ R2 object key',
      );
    }

    return isR2Key;
  }

  private isDeliveryMode(value: string): value is ImageDeliveryMode {
    return IMAGE_DELIVERY_MODES.includes(value as ImageDeliveryMode);
  }
}
