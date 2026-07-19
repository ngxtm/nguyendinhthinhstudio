import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import sharp from 'sharp';
import {
  validateStored,
  type ImageFacts,
  type ImageUploadPolicy,
  type StoredImageErrorCode,
} from '@ndt/image-upload-policy';

export type StoredImageInspection = {
  digestSha256: string;
  byteSize: number;
  facts: ImageFacts;
};

export class StoredImageInspectionError extends Error {
  constructor(readonly code: StoredImageErrorCode | 'image_bad_length') {
    super(code);
    this.name = 'StoredImageInspectionError';
  }
}

async function* bytesAsChunks(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  yield bytes;
}

@Injectable()
export class StoredImageInspectorService {
  async inspect(
    bytes: Uint8Array,
    policy: ImageUploadPolicy,
    expectedMime?: ImageFacts['mime'],
    signal?: AbortSignal,
  ): Promise<StoredImageInspection> {
    if (bytes.byteLength > policy.maxStoredBytes) {
      throw new StoredImageInspectionError('image_bad_length');
    }
    if (signal?.aborted) {
      throw Object.assign(new Error('Image inspection aborted'), {
        name: 'AbortError',
      });
    }

    const grammar = await validateStored(
      bytesAsChunks(bytes),
      policy,
      signal,
    );
    if (grammar.outcome === 'rejected') {
      throw new StoredImageInspectionError(grammar.code);
    }
    if (expectedMime && grammar.facts.mime !== expectedMime) {
      throw new StoredImageInspectionError('image_unsupported_format');
    }

    const digestSha256 = createHash('sha256').update(bytes).digest('hex');
    const decoded = await sharp(bytes, {
      failOn: 'error',
      pages: policy.maxPagesOrFrames,
      limitInputPixels: policy.maxDecodedPixels,
    })
      .rotate()
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (decoded.info.width > policy.maxWidth || decoded.info.height > policy.maxHeight) {
      throw new StoredImageInspectionError('image_invalid_dimensions');
    }

    return {
      digestSha256,
      byteSize: bytes.byteLength,
      facts: grammar.facts,
    };
  }
}
