import type { Image } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { ImageUrlService } from './image-url.service';
import { ImagePresenterService } from './image-presenter.service';

const storedVariants = {
  thumbnailUrl: 'https://legacy.example.test/thumbnail',
  smallUrl: 'https://legacy.example.test/small',
  mediumUrl: 'https://legacy.example.test/medium',
  largeUrl: 'https://legacy.example.test/large',
  xlargeUrl: 'https://legacy.example.test/xlarge',
};

const generatedVariants = {
  thumbnailUrl: 'https://imgproxy.example.test/thumbnail',
  smallUrl: 'https://imgproxy.example.test/small',
  mediumUrl: 'https://imgproxy.example.test/medium',
  largeUrl: 'https://imgproxy.example.test/large',
  xlargeUrl: 'https://imgproxy.example.test/xlarge',
};

function createImage(overrides: Partial<Image> = {}): Image {
  return {
    id: 'image-1',
    albumId: 'album-1',
    filename: 'portrait.jpg',
    r2ObjectKey: 'albums/album-1/portrait.jpg',
    uploadStatus: 'completed',
    ...storedVariants,
    altText: 'Portrait',
    orderIndex: 1,
    width: 2400,
    height: 1600,
    fileSizeKb: 512,
    fileSizeBytes: null,
    createdAt: new Date('2026-07-12T12:00:00.000Z'),
    ...overrides,
  };
}

function createHarness(mode?: string) {
  const imageUrl = {
    getVariantUrls: jest.fn().mockReturnValue(generatedVariants),
  };
  const config = {
    get: jest.fn((key: string) =>
      key === 'IMAGE_DELIVERY_MODE' ? mode : undefined,
    ),
  };

  return {
    imageUrl,
    service: new ImagePresenterService(
      imageUrl as unknown as ImageUrlService,
      config as unknown as ConfigService,
    ),
  };
}

describe('ImagePresenterService', () => {
  it.each(['legacy', 'auto', 'imgproxy'])(
    'exposes exactly the PublicImageResponse allowlist in %s mode',
    (mode) => {
      const { service } = createHarness(mode);
      const result = service.presentImage(createImage());

      expect(Object.keys(result).sort()).toEqual(
        [
          'id',
          'filename',
          'width',
          'height',
          'altText',
          'thumbnailUrl',
          'smallUrl',
          'mediumUrl',
          'largeUrl',
          'xlargeUrl',
          'orderIndex',
        ].sort(),
      );
      expect(result).not.toHaveProperty('albumId');
      expect(result).not.toHaveProperty('r2ObjectKey');
      expect(result).not.toHaveProperty('uploadStatus');
      expect(result).not.toHaveProperty('fileSizeBytes');
    },
  );

  it('returns stored variants in legacy mode', () => {
    const { imageUrl, service } = createHarness('legacy');
    const image = createImage();

    const result = service.presentImage(image);

    expect(result).not.toBe(image);
    expect(result).toMatchObject(storedVariants);
    expect(imageUrl.getVariantUrls).not.toHaveBeenCalled();
  });

  it('returns stored variants for a legacy key in auto mode', () => {
    const { imageUrl, service } = createHarness('auto');
    const image = createImage({ r2ObjectKey: 'legacy-cloudflare-image-id' });

    const result = service.presentImage(image);

    expect(result).not.toBe(image);
    expect(result).toMatchObject(storedVariants);
    expect(imageUrl.getVariantUrls).not.toHaveBeenCalled();
  });

  it('generates variants for an R2 key in auto mode without mutating the image', () => {
    const { imageUrl, service } = createHarness('auto');
    const image = createImage();
    const snapshot = { ...image };

    const result = service.presentImage(image);

    expect(result).not.toBe(image);
    expect(result).toMatchObject(generatedVariants);
    expect(image).toEqual(snapshot);
    expect(imageUrl.getVariantUrls).toHaveBeenCalledWith(
      'albums/album-1/portrait.jpg',
    );
  });

  it('generates variants for an R2 key in imgproxy mode', () => {
    const { service } = createHarness('imgproxy');

    expect(service.presentImage(createImage())).toMatchObject(generatedVariants);
  });

  it.each([
    ['a legacy key', 'legacy-cloudflare-image-id'],
    ['a missing key', null],
  ])('rejects %s in imgproxy mode', (_label, r2ObjectKey) => {
    const { service } = createHarness('imgproxy');

    expect(() => service.presentImage(createImage({ r2ObjectKey }))).toThrow(
      'imgproxy delivery requires an albums/ R2 object key',
    );
  });

  it('rejects an invalid delivery mode', () => {
    expect(() => createHarness('unsupported')).toThrow(
      'Invalid IMAGE_DELIVERY_MODE',
    );
  });

  it('defaults a missing local delivery mode to legacy', () => {
    const { imageUrl, service } = createHarness();
    const image = createImage();

    expect(service.presentImage(image)).toMatchObject(storedVariants);
    expect(imageUrl.getVariantUrls).not.toHaveBeenCalled();
  });
});
