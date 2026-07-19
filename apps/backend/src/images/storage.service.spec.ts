import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import {
  CopyObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageService } from './storage.service';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

describe('StorageService', () => {
  const config = {
    get: jest.fn(
      (key: string) =>
        ({
          R2_S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
          R2_ACCESS_KEY_ID: 'access-key',
          R2_SECRET_ACCESS_KEY: 'secret-key',
          CLOUDFLARE_R2_BUCKET_NAME: 'test-images',
        })[key],
    ),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('always returns an R2 presigned URL', async () => {
    jest.mocked(getSignedUrl).mockResolvedValue('https://r2.example/upload');
    const service = new StorageService(config);

    await expect(
      service.getPresignedUploadUrl(
        'uploads/upload-id/photo.jpg',
        'image/jpeg',
        42,
      ),
    ).resolves.toBe('https://r2.example/upload');

    expect(config.get).not.toHaveBeenCalledWith('USE_MOCK_UPLOAD');
    expect(getSignedUrl).toHaveBeenCalledTimes(1);
  });

  it('signs exact PUT constraints only for the remaining fixed expiry', async () => {
    jest
      .mocked(getSignedUrl)
      .mockResolvedValue(
        'https://r2.example/key?X-Amz-Date=20260719T103000Z&X-Amz-Expires=1800',
      );
    const service = new StorageService(config);
    const now = new Date('2026-07-19T10:30:00.999Z');
    const expiresAt = new Date('2026-07-19T11:00:00.000Z');

    await expect(
      service.signFixedExpiryPut(
        'uploads/upload-id/photo.webp',
        'image/webp',
        1024,
        expiresAt,
        now,
      ),
    ).resolves.toBe(
      'https://r2.example/key?X-Amz-Date=20260719T103000Z&X-Amz-Expires=1800',
    );
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(PutObjectCommand),
      {
        expiresIn: 1800,
        signingDate: new Date('2026-07-19T10:30:00.000Z'),
      },
    );
    expect(jest.mocked(getSignedUrl).mock.calls[0][1]).toEqual(
      expect.objectContaining({
        input: expect.objectContaining({
          Key: 'uploads/upload-id/photo.webp',
          ContentType: 'image/webp',
          ContentLength: 1024,
        }),
      }),
    );
  });

  it('fails closed when provider URL extends the persisted expiry', async () => {
    jest
      .mocked(getSignedUrl)
      .mockResolvedValue(
        'https://r2.example/key?X-Amz-Date=20260719T103000Z&X-Amz-Expires=3600',
      );
    const service = new StorageService(config);
    await expect(
      service.signFixedExpiryPut(
        'uploads/upload-id/photo.webp',
        'image/webp',
        1024,
        new Date('2026-07-19T11:00:00.000Z'),
        new Date('2026-07-19T10:30:00.000Z'),
      ),
    ).rejects.toThrow('effective expiry');
  });

  it('returns no URL at or after the persisted expiry', async () => {
    const service = new StorageService(config);
    await expect(
      service.signFixedExpiryPut(
        'uploads/upload-id/photo.webp',
        'image/webp',
        1024,
        new Date('2026-07-19T11:00:00.000Z'),
        new Date('2026-07-19T11:00:00.000Z'),
      ),
    ).rejects.toThrow('presign expiry');
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('never logs full object keys, provider URLs, or provider error details', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const service = new StorageService(config);
    const sensitiveKey = 'uploads/private-upload-id/secret-filename.jpg';
    const send = jest.spyOn((service as any).s3, 'send');

    send.mockResolvedValueOnce({});
    await service.deleteObject(sensitiveKey);

    send.mockRejectedValueOnce(
      new Error('provider secret https://signed.example/token'),
    );
    await expect(service.deleteObject(sensitiveKey)).rejects.toThrow();

    const rendered = JSON.stringify([...log.mock.calls, ...error.mock.calls]);
    expect(rendered).not.toContain(sensitiveKey);
    expect(rendered).not.toContain('secret-filename.jpg');
    expect(rendered).not.toContain('signed.example');
    expect(rendered).not.toContain('provider secret');
  });

  it('verifies uploaded object metadata and returns its ETag', async () => {
    const service = new StorageService(config);
    const send = jest.spyOn((service as any).s3, 'send').mockResolvedValue({
      ContentLength: 1024,
      ContentType: 'image/jpeg',
      ETag: '"source-etag"',
    });

    await expect(
      service.verifyObject('uploads/id/photo.jpg', {
        contentType: 'image/jpeg',
        fileSize: 1024,
      }),
    ).resolves.toBe('"source-etag"');
    expect(send).toHaveBeenCalledWith(expect.any(HeadObjectCommand));
  });

  it('rejects object metadata mismatches and missing ETags', async () => {
    const service = new StorageService(config);
    const send = jest.spyOn((service as any).s3, 'send');
    send.mockResolvedValueOnce({
      ContentLength: 1,
      ContentType: 'image/jpeg',
      ETag: '"etag"',
    });
    await expect(
      service.verifyObject('key', {
        contentType: 'image/jpeg',
        fileSize: 1024,
      }),
    ).rejects.toThrow('Uploaded object size does not match');
    send.mockResolvedValueOnce({
      ContentLength: 1024,
      ContentType: 'image/png',
      ETag: '"etag"',
    });
    await expect(
      service.verifyObject('key', {
        contentType: 'image/jpeg',
        fileSize: 1024,
      }),
    ).rejects.toThrow('Uploaded object content type does not match');
    send.mockResolvedValueOnce({
      ContentLength: 1024,
      ContentType: 'image/jpeg',
    });
    await expect(
      service.verifyObject('key', {
        contentType: 'image/jpeg',
        fileSize: 1024,
      }),
    ).rejects.toThrow('Uploaded object ETag is missing');
  });

  it('promotes only the ETag-verified temporary object', async () => {
    const service = new StorageService(config);
    const send = jest
      .spyOn((service as any).s3, 'send')
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        ContentLength: 1024,
        ContentType: 'image/jpeg',
        ETag: '"final-etag"',
      });

    await service.promoteObject(
      'uploads/id/photo.jpg',
      'albums/album/photo.jpg',
      '"source-etag"',
      {
        contentType: 'image/jpeg',
        fileSize: 1024,
      },
    );
    expect(send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        input: expect.objectContaining({ CopySourceIfMatch: '"source-etag"' }),
      }),
    );
    expect(send.mock.calls[0][0]).toBeInstanceOf(CopyObjectCommand);
  });
});
