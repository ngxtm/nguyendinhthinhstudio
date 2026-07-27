import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { canonicalizeEtag, toHttpEtag } from './canonical-etag';
import {
  type ImageUploadDeadlineOptions,
  withImageUploadDeadline,
} from './image-upload-deadline';
import {
  assertPresignedUrlMatchesExpiry,
  remainingPresignSeconds,
  truncateToWholeSecond,
} from './image-upload-presign-expiry';

export type StorageOperationDeadline = Omit<
  ImageUploadDeadlineOptions,
  'operationTimeoutMs'
> & {
  operationTimeoutMs?: number;
};

export type ImageUploadPromotionCopyFacts = {
  promotionId: string;
  inspectedByteSize: number;
  destinationObjectKey: string;
  sourceObjectKey: string;
  sourceEtag: string;
  canonicalMime: string;
  inspectedSha256: string;
  inspectedWidth: number;
  inspectedHeight: number;
};

export type R2ObjectIdentity = Readonly<{
  etag: string;
  contentLength: number | undefined;
  contentType: string | undefined;
  metadata: Readonly<Record<string, string>>;
}>;

const DEFAULT_R2_OPERATION_TIMEOUT_MS = 30_000;

export const r2CopyDestinationCreateOnlyMiddleware =
  (next: (args: any) => Promise<any>) => async (args: any) => {
    const request = args.request as { headers: Record<string, string> };
    request.headers['cf-copy-destination-if-none-match'] = '*';
    return next(args);
  };

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  private readonly bucketname: string;

  constructor(private readonly config: ConfigService) {
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: config.get<string>('R2_S3_ENDPOINT'),
      credentials: {
        accessKeyId: config.get<string>('R2_ACCESS_KEY_ID'),
        secretAccessKey: config.get<string>('R2_SECRET_ACCESS_KEY'),
      },
    });

    this.bucketname = config.get<string>('CLOUDFLARE_R2_BUCKET_NAME');
  }

  private safeFilename(filename: string): string {
    const basename = filename.replace(/\\/g, '/').split('/').pop() ?? '';
    const sanitized = basename.replace(/[\x00-\x1F\x7F]/g, '').trim();
    if (!sanitized || sanitized.includes('/')) {
      throw new BadRequestException('Invalid filename');
    }
    return sanitized;
  }

  createUploadObjectKey(uploadId: string, filename: string): string {
    return `uploads/${uploadId}/${this.safeFilename(filename)}`;
  }

  createFinalObjectKey(albumId: string, filename: string): string {
    return `albums/${albumId}/${randomUUID()}-${this.safeFilename(filename)}`;
  }

  async getPresignedUploadUrl(
    objectKey: string,
    contentType: string,
    filesize: number,
  ): Promise<string> {
    const putObjectCommand = new PutObjectCommand({
      Bucket: this.bucketname,
      Key: objectKey,
      ContentType: contentType,
      ContentLength: filesize,
    });

    const uploadUrl = await getSignedUrl(this.s3, putObjectCommand, {
      expiresIn: 3600,
    });
    return uploadUrl;
  }

  async signFixedExpiryPut(
    objectKey: string,
    contentType: string,
    fileSize: number,
    persistedExpiry: Date,
    now: Date = new Date(),
  ): Promise<string> {
    const signingDate = truncateToWholeSecond(now);
    const expiresIn = remainingPresignSeconds(signingDate, persistedExpiry);
    const command = new PutObjectCommand({
      Bucket: this.bucketname,
      Key: objectKey,
      ContentType: contentType,
      ContentLength: fileSize,
    });
    const signedUrl = await getSignedUrl(this.s3, command, {
      expiresIn,
      signingDate,
    });
    assertPresignedUrlMatchesExpiry(signedUrl, persistedExpiry);
    return signedUrl;
  }

  private runR2<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    deadline: StorageOperationDeadline = {},
  ): Promise<T> {
    return withImageUploadDeadline(operation, {
      ...deadline,
      operationTimeoutMs:
        deadline.operationTimeoutMs ?? DEFAULT_R2_OPERATION_TIMEOUT_MS,
    });
  }

  async deleteObject(
    objectKey: string,
    deadline: StorageOperationDeadline = {},
  ): Promise<void> {
    const objectKeyHash = createHash('sha256')
      .update(objectKey)
      .digest('hex')
      .slice(0, 12);
    const deleteObjectCommand = new DeleteObjectCommand({
      Bucket: this.bucketname,
      Key: objectKey,
    });

    try {
      await this.runR2(
        (signal) =>
          this.s3.send(deleteObjectCommand, { abortSignal: signal }),
        deadline,
      );
      this.logger.log(`Object deleted: keyHash=${objectKeyHash}`);
    } catch (error) {
      this.logger.error(`Object deletion failed: keyHash=${objectKeyHash}`);
      throw error;
    }
  }

  async headObjectIdentity(
    objectKey: string,
    deadline: StorageOperationDeadline = {},
  ): Promise<R2ObjectIdentity | null> {
    try {
      const result = await this.runR2(
        (signal) =>
          this.s3.send(
            new HeadObjectCommand({ Bucket: this.bucketname, Key: objectKey }),
            { abortSignal: signal },
          ),
        deadline,
      );
      if (!result.ETag?.trim()) {
        throw new Error('R2 object ETag is missing');
      }
      return Object.freeze({
        etag: canonicalizeEtag(result.ETag),
        contentLength: result.ContentLength,
        contentType: result.ContentType,
        metadata: Object.freeze({ ...(result.Metadata ?? {}) }),
      });
    } catch (error) {
      const providerError = error as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      if (providerError.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async verifyObject(
    objectKey: string,
    expected: { contentType: string; fileSize: number },
    deadline: StorageOperationDeadline = {},
  ): Promise<string> {
    const result = await this.runR2(
      (signal) =>
        this.s3.send(
          new HeadObjectCommand({ Bucket: this.bucketname, Key: objectKey }),
          { abortSignal: signal },
        ),
      deadline,
    );
    if (result.ContentLength !== expected.fileSize) {
      throw new BadRequestException('Uploaded object size does not match');
    }
    if (result.ContentType !== expected.contentType) {
      throw new BadRequestException(
        'Uploaded object content type does not match',
      );
    }
    if (!result.ETag?.trim()) {
      throw new BadRequestException('Uploaded object ETag is missing');
    }
    return canonicalizeEtag(result.ETag);
  }

  async readObjectBytes(
    objectKey: string,
    deadline: StorageOperationDeadline = {},
    ifMatch?: string,
  ): Promise<Uint8Array> {
    return this.runR2(async (signal) => {
      const result = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.bucketname,
          Key: objectKey,
          ...(ifMatch ? { IfMatch: toHttpEtag(ifMatch) } : {}),
        }),
        { abortSignal: signal },
      );
      if (!result.Body?.transformToByteArray) {
        throw new Error('R2 GetObject body is unavailable');
      }
      return result.Body.transformToByteArray();
    }, deadline);
  }

  async promoteObject(
    promotion: ImageUploadPromotionCopyFacts,
    deadline?: StorageOperationDeadline,
  ): Promise<string>;
  async promoteObject(
    uploadObjectKey: string,
    finalObjectKey: string,
    sourceEtag: string,
    expected: { contentType: string; fileSize: number },
  ): Promise<void>;
  async promoteObject(
    promotionOrSource: ImageUploadPromotionCopyFacts | string,
    deadlineOrDestination?: StorageOperationDeadline | string,
    sourceEtag?: string,
    _expected?: { contentType: string; fileSize: number },
  ): Promise<string | void> {
    if (typeof promotionOrSource === 'string') {
      const destination = deadlineOrDestination as string;
      const command = new CopyObjectCommand({
        Bucket: this.bucketname,
        Key: destination,
        CopySource: encodeURIComponent(
          `/${this.bucketname}/${promotionOrSource}`,
        ).replace(/%2F/g, '/'),
        CopySourceIfMatch: toHttpEtag(sourceEtag ?? ''),
        MetadataDirective: 'COPY',
      });
      await this.runR2((signal) =>
        this.s3.send(command, { abortSignal: signal }),
      );
      return;
    }

    const promotion = promotionOrSource;
    const deadline =
      (deadlineOrDestination as StorageOperationDeadline | undefined) ?? {};
    const command = new CopyObjectCommand({
      Bucket: this.bucketname,
      Key: promotion.destinationObjectKey,
      CopySource: encodeURIComponent(
        `/${this.bucketname}/${promotion.sourceObjectKey}`,
      ).replace(/%2F/g, '/'),
      CopySourceIfMatch: toHttpEtag(promotion.sourceEtag),
      MetadataDirective: 'REPLACE',
      ContentType: promotion.canonicalMime,
      Metadata: {
        sha256: promotion.inspectedSha256,
        'promotion-id': promotion.promotionId,
        bytes: String(promotion.inspectedByteSize),
        width: String(promotion.inspectedWidth),
        height: String(promotion.inspectedHeight),
      },
    });
    command.middlewareStack.addRelativeTo(
      r2CopyDestinationCreateOnlyMiddleware,
      {
        name: 'r2CopyDestinationCreateOnly',
        relation: 'before',
        toMiddleware: 'awsAuthMiddleware',
      },
    );
    const result = await this.runR2(
      (signal) => this.s3.send(command, { abortSignal: signal }),
      deadline,
    );
    const destinationEtag = result.CopyObjectResult?.ETag;
    if (!destinationEtag) {
      throw new Error('CopyObject response ETag is missing');
    }
    return canonicalizeEtag(destinationEtag);
  }
}
