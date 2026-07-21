import type { StoredImageErrorCode } from './error-codes.js';
import type { ImageUploadPolicy } from './policy.js';

export type ImageInput = AsyncIterable<Uint8Array>;

export type ImageFacts = {
    mime: 'image/jpeg' | 'image/png' | 'image/webp';
    width: number;
    height: number;
    pagesOrFrames: 1;
    orientation: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | null;
    metadataBytes: number;
    iccSha256: string | null;
};

export type ImagePreflightResult =
    | {
          outcome: 'accepted';
          facts: {
              mime: ImageFacts['mime'];
              width: number;
              height: number;
              declaredAnimation: boolean;
              declaredPagesOrFrames: number | null;
          };
      }
    | { outcome: 'rejected'; code: StoredImageErrorCode };

export type ImageGrammarResult =
    | { outcome: 'allowed'; facts: ImageFacts }
    | { outcome: 'requiresNormalization'; facts: ImageFacts }
    | { outcome: 'rejected'; code: StoredImageErrorCode };

export type ImageGrammarMode = 'classify-source' | 'validate-stored';

export interface ImageByteReader {
    readonly bytesRead: number;
    readByte(): Promise<number | null>;
    readExact(length: number): Promise<Uint8Array>;
    unread(bytes: Uint8Array): void;
    skip(length: number, visit?: (chunk: Uint8Array) => void): Promise<void>;
    ensureEof(): Promise<boolean>;
}

export type ImageParser = (
    reader: ImageByteReader,
    policy: ImageUploadPolicy,
    mode: ImageGrammarMode,
) => Promise<ImageGrammarResult>;
