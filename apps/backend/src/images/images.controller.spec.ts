import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { smokeTokenFingerprint } from './image-upload-ingress';
import { ImagesController } from './images.controller';

describe('ImagesController upload contract', () => {
  const smokeToken = 'operator-smoke-token-with-at-least-32-bytes';
  const adminRequest = {
    user: { sub: 'admin-1', role: 'admin' },
    headers: {},
  };
  const smokeAdminRequest = {
    user: { sub: 'admin-1', role: 'admin' },
    headers: { 'x-image-upload-smoke-token': smokeToken },
  };
  const policy = {
    policyVersion: 'policy-v1',
    getPolicy: jest.fn(() => ({ policyVersion: 'policy-v1', policy: {} })),
  };
  const runtime = { presignEnabled: true, mode: 'general' as const };
  const rateLimit = { admit: jest.fn().mockResolvedValue({ admitted: true }) };
  const images = {
    getUploadUrl: jest.fn().mockResolvedValue({ uploadId: 'upload-1' }),
    confirmUpload: jest.fn().mockResolvedValue({ outcome: 'finalizing' }),
    getUploadStatus: jest.fn().mockResolvedValue({ outcome: 'pending' }),
    abandonUpload: jest.fn().mockResolvedValue({ outcome: 'abandoned' }),
  };

  beforeEach(() => jest.clearAllMocks());

  function controller(enabled = true, override: Record<string, unknown> = {}) {
    return new ImagesController(
      images as never,
      policy as never,
      rateLimit as never,
      {
        ...runtime,
        presignEnabled: enabled,
        mode: enabled ? 'general' : 'disabled',
        ...override,
      } as never,
    );
  }

  function operatorController() {
    return controller(true, {
      mode: 'operator-smoke',
      smokeTokenSha256: smokeTokenFingerprint(smokeToken),
    });
  }

  it('does not expose the mock upload endpoint', () => {
    expect('mockUpload' in ImagesController.prototype).toBe(false);
  });

  it('returns upload policy through an admin-only route handler', () => {
    expect(controller().getUploadPolicy()).toEqual({
      policyVersion: 'policy-v1',
      policy: {},
    });
  });

  it('checks maintenance before rate admission or session work', async () => {
    await expect(
      controller(false).getUploadUrl(
        {
          clientRequestId: 'missing',
        },
        adminRequest as never,
      ),
    ).rejects.toMatchObject({
      response: { statusCode: 503, code: 'upload_presign_disabled' },
    });
    expect(rateLimit.admit).not.toHaveBeenCalled();
    expect(images.getUploadUrl).not.toHaveBeenCalled();
  });

  it.each([
    ['getUploadUrl', [{ clientRequestId: 'missing' }, adminRequest]],
    [
      'confirmUpload',
      [{ uploadId: '00000000-0000-4000-8000-000000000030' }, adminRequest],
    ],
    ['getUploadStatus', ['00000000-0000-4000-8000-000000000030', adminRequest]],
    ['abandonUpload', ['00000000-0000-4000-8000-000000000030', adminRequest]],
  ])(
    'checks operator ingress before rate admission for %s',
    async (method, args) => {
      await expect(
        (
          operatorController() as unknown as Record<
            string,
            (...input: unknown[]) => unknown
          >
        )[method](...args),
      ).rejects.toMatchObject({
        response: { statusCode: 403, code: 'upload_operator_smoke_required' },
      });
      expect(rateLimit.admit).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'getUploadUrl',
      [
        {
          clientRequestId: '00000000-0000-4000-8000-000000000010',
          albumId: '00000000-0000-4000-8000-000000000020',
          filename: 'photo.webp',
          contentType: 'image/webp',
          fileSize: 1024,
          processedSha256: 'a'.repeat(64),
          policyVersion: 'policy-v1',
        },
        smokeAdminRequest,
      ],
    ],
    [
      'confirmUpload',
      [{ uploadId: '00000000-0000-4000-8000-000000000030' }, smokeAdminRequest],
    ],
    [
      'getUploadStatus',
      ['00000000-0000-4000-8000-000000000030', smokeAdminRequest],
    ],
    [
      'abandonUpload',
      ['00000000-0000-4000-8000-000000000030', smokeAdminRequest],
    ],
  ])('admits the exact operator token for %s', async (method, args) => {
    await expect(
      (
        operatorController() as unknown as Record<
          string,
          (...input: unknown[]) => unknown
        >
      )[method](...args),
    ).resolves.toBeDefined();
    expect(rateLimit.admit).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicated operator token headers before admission', async () => {
    const duplicated = {
      ...smokeAdminRequest,
      headers: { 'x-image-upload-smoke-token': [smokeToken, smokeToken] },
    };
    await expect(
      operatorController().getUploadStatus(
        '00000000-0000-4000-8000-000000000030',
        duplicated as never,
      ),
    ).rejects.toMatchObject({
      response: { statusCode: 403, code: 'upload_operator_smoke_required' },
    });
    expect(rateLimit.admit).not.toHaveBeenCalled();
  });

  it.each(['confirmUpload', 'getUploadStatus', 'abandonUpload'])(
    'preserves disabled-mode drain behavior for %s',
    async (method) => {
      const uploadId = '00000000-0000-4000-8000-000000000030';
      await expect(
        (
          controller(false) as unknown as Record<
            string,
            (...input: unknown[]) => unknown
          >
        )[method]({ uploadId }, adminRequest),
      ).resolves.toBeDefined();
      expect(rateLimit.admit).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['clientRequestId', 'processedSha256', 'policyVersion'])(
    'admits before rejecting missing legacy field %s with policy refresh',
    async (field) => {
      const body: Record<string, unknown> = {
        clientRequestId: '00000000-0000-4000-8000-000000000010',
        albumId: '00000000-0000-4000-8000-000000000020',
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        fileSize: 1024,
        processedSha256: 'a'.repeat(64),
        policyVersion: 'policy-v1',
      };
      delete body[field];

      await expect(
        controller().getUploadUrl(body, adminRequest as never),
      ).rejects.toMatchObject({
        response: { statusCode: 409, code: 'policy_refresh_required' },
      });
      expect(rateLimit.admit).toHaveBeenCalledWith('admin-1', 'upload_url');
      expect(images.getUploadUrl).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['albumId', 'not-a-uuid'],
    ['clientRequestId', 'not-a-uuid'],
    ['processedSha256', 'A'.repeat(64)],
    ['contentType', 'image/jpg'],
    ['fileSize', 0],
    ['fileSize', 5_242_881],
    ['fileSize', 1.5],
    ['filename', '../photo.jpg'],
    ['filename', ' photo.jpg'],
    ['unknown', true],
  ])('rejects invalid current-only field %s', async (field, value) => {
    const body: Record<string, unknown> = {
      clientRequestId: '00000000-0000-4000-8000-000000000010',
      albumId: '00000000-0000-4000-8000-000000000020',
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      fileSize: 1024,
      processedSha256: 'a'.repeat(64),
      policyVersion: 'policy-v1',
      [field]: value,
    };

    await expect(
      controller().getUploadUrl(body, adminRequest as never),
    ).rejects.toMatchObject({
      response: { statusCode: 400, code: 'upload_invalid_request' },
    });
    expect(rateLimit.admit.mock.invocationCallOrder[0]).toBeLessThan(
      images.getUploadUrl.mock.invocationCallOrder[0] ??
        Number.MAX_SAFE_INTEGER,
    );
  });

  it('delegates a valid normalized current request after admission', async () => {
    const body = {
      clientRequestId: '00000000-0000-4000-8000-000000000010',
      albumId: '00000000-0000-4000-8000-000000000020',
      filename: 'photo.jpg',
      contentType: 'image/webp',
      fileSize: 1024,
      processedSha256: 'a'.repeat(64),
      policyVersion: 'policy-v1',
    };

    await expect(
      controller().getUploadUrl(body, adminRequest as never),
    ).resolves.toEqual({ uploadId: 'upload-1' });
    expect(images.getUploadUrl).toHaveBeenCalledWith(body, 'admin-1');
  });

  it.each([
    ['confirmUpload', 'confirm_upload'],
    ['getUploadStatus', 'upload_status'],
    ['abandonUpload', 'abandon_upload'],
  ])('admits before %s business lookup', async (method, scope) => {
    const uploadId = '00000000-0000-4000-8000-000000000030';
    await expect(
      (
        controller() as unknown as Record<
          string,
          (...args: unknown[]) => unknown
        >
      )[method]({ uploadId }, adminRequest),
    ).resolves.toBeDefined();
    expect(rateLimit.admit).toHaveBeenCalledWith('admin-1', scope);
  });

  it.each([
    [new NotFoundException('opaque'), 'upload_not_found'],
    [new ConflictException('opaque'), 'upload_request_conflict'],
    [new BadRequestException('opaque'), 'upload_capacity_exceeded'],
  ])(
    'maps real presign business exceptions to closed error %s',
    async (businessError, code) => {
      images.getUploadUrl.mockRejectedValueOnce(businessError);
      const body = {
        clientRequestId: '00000000-0000-4000-8000-000000000010',
        albumId: '00000000-0000-4000-8000-000000000020',
        filename: 'photo.jpg',
        contentType: 'image/webp',
        fileSize: 1024,
        processedSha256: 'a'.repeat(64),
        policyVersion: 'policy-v1',
      };

      await expect(
        controller().getUploadUrl(body, adminRequest as never),
      ).rejects.toMatchObject({ response: { code } });
    },
  );

  it.each([
    [new NotFoundException('opaque'), 'upload_not_found'],
    [new ConflictException('opaque'), 'upload_request_conflict'],
    [new BadRequestException('opaque'), 'upload_invalid_request'],
  ])(
    'maps real confirm business exceptions to closed error %s',
    async (businessError, code) => {
      images.confirmUpload.mockRejectedValueOnce(businessError);
      await expect(
        controller().confirmUpload(
          { uploadId: '00000000-0000-4000-8000-000000000030' },
          adminRequest as never,
        ),
      ).rejects.toMatchObject({ response: { code } });
    },
  );

  it('preserves typed closed errors without switching on message text', () => {
    const error = ImagesController.uploadError(
      409,
      'upload_request_conflict',
      'opaque',
    );
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getResponse()).toEqual({
      statusCode: 409,
      code: 'upload_request_conflict',
      message: 'opaque',
    });
  });
});
