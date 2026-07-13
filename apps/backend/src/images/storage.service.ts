import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

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

  async deleteObject(objectKey: string): Promise<void> {
    const deleteObjectCommand = new DeleteObjectCommand({
      Bucket: this.bucketname,
      Key: objectKey,
    });

    try {
      await this.s3.send(deleteObjectCommand);
      this.logger.log(`Deleted object: ${objectKey}`);
    } catch (error) {
      this.logger.error(`Failed to delete object: ${objectKey}`, error);
      throw error;
    }
  }

  async verifyObject(
    objectKey: string,
    expected: { contentType: string; fileSize: number },
  ): Promise<string> {
    const result = await this.s3.send(
      new HeadObjectCommand({ Bucket: this.bucketname, Key: objectKey }),
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
    return result.ETag;
  }

  async promoteObject(
    uploadObjectKey: string,
    finalObjectKey: string,
    sourceEtag: string,
    expected: { contentType: string; fileSize: number },
  ): Promise<void> {
    const copySource = encodeURIComponent(
      `${this.bucketname}/${uploadObjectKey}`,
    ).replace(/%2F/g, '/');
    await this.s3.send(
      new CopyObjectCommand({
        Bucket: this.bucketname,
        Key: finalObjectKey,
        CopySource: copySource,
        CopySourceIfMatch: sourceEtag,
        MetadataDirective: 'COPY',
      }),
    );
    await this.verifyObject(finalObjectKey, expected);
  }
}
