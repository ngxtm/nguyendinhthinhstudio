import { ConfigService } from '@nestjs/config';
import { CopyObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
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

  it('verifies uploaded object metadata and returns its ETag', async () => {
    const service = new StorageService(config);
    const send = jest
      .spyOn((service as any).s3, 'send')
      .mockResolvedValue({
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
