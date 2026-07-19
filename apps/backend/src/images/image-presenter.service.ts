import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Image } from '@prisma/client';
import type { PublicImageResponse } from '@ndt/types';
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

  presentImage(image: Image): PublicImageResponse {
    const objectKey = image.r2ObjectKey;
    if (!objectKey && this.deliveryMode === 'imgproxy') {
      throw new Error(
        'imgproxy delivery requires an albums/ R2 object key',
      );
    }

    const variants =
      objectKey && this.shouldUseImgproxy(objectKey)
        ? this.imageUrl.getVariantUrls(objectKey)
        : {
            thumbnailUrl: image.thumbnailUrl,
            smallUrl: image.smallUrl,
            mediumUrl: image.mediumUrl,
            largeUrl: image.largeUrl,
            xlargeUrl: image.xlargeUrl,
          };

    return {
      id: image.id,
      filename: image.filename,
      width: image.width,
      height: image.height,
      altText: image.altText,
      ...variants,
      orderIndex: image.orderIndex,
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
