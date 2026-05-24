import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  private readonly bucketname: string;
  private readonly isMockUpload: boolean;

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
    this.isMockUpload = config.get<string>('USE_MOCK_UPLOAD') === 'true';
  }

  async getPresignedUploadUrl(
    albumId: string,
    filename: string,
    contentType: string,
    uploadId: string,
    filesize: number,
  ): Promise<{ uploadUrl: string; objectKey: string }> {
    const objectKey = `albums/${albumId}/${randomUUID()}-${filename}`;
    if (this.isMockUpload) {
      const uploadUrl = `http://localhost:3000/images/mock-upload/${uploadId}`;
      return { uploadUrl, objectKey };
    }

    const putObjectCommand = new PutObjectCommand({
      Bucket: this.bucketname,
      Key: objectKey,
      ContentType: contentType,
      ContentLength: filesize,
    });

    const uploadUrl = await getSignedUrl(this.s3, putObjectCommand, {
      expiresIn: 3600,
    });
    return { uploadUrl, objectKey };
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
}
