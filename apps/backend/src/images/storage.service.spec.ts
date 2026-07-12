import { ConfigService } from '@nestjs/config';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageService } from './storage.service';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

describe('StorageService', () => {
  const config = {
    get: jest.fn((key: string) =>
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
      service.getPresignedUploadUrl('album-id', 'photo.jpg', 'image/jpeg', 'upload-id', 42),
    ).resolves.toEqual({
      uploadUrl: 'https://r2.example/upload',
      objectKey: expect.stringMatching(/^albums\/album-id\//),
    });

    expect(config.get).not.toHaveBeenCalledWith('USE_MOCK_UPLOAD');
    expect(getSignedUrl).toHaveBeenCalledTimes(1);
  });
});
