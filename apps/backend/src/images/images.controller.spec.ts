import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common'
import { smokeTokenFingerprint } from './image-upload-ingress'
import { ImagesController } from './images.controller'

describe('ImagesController simplified upload contract', () => {
  const smokeToken = 'operator-smoke-token-with-at-least-32-bytes'
  const adminRequest = {
    user: { sub: 'admin-1', role: 'admin' },
    headers: {},
  }
  const smokeAdminRequest = {
    user: { sub: 'admin-1', role: 'admin' },
    headers: { 'x-image-upload-smoke-token': smokeToken },
  }
  const runtime = { presignEnabled: true, mode: 'general' as const }
  const images = {
    getUploadUrl: jest.fn().mockResolvedValue({ uploadId: 'upload-1' }),
    confirmUpload: jest.fn().mockResolvedValue({ outcome: 'finalizing' }),
    getUploadStatus: jest.fn().mockResolvedValue({ outcome: 'pending' }),
    abandonUpload: jest.fn().mockResolvedValue({ outcome: 'abandoned' }),
  }

  beforeEach(() => jest.clearAllMocks())

  function controller(enabled = true, override: Record<string, unknown> = {}) {
    return new ImagesController(
      images as never,
      {
        ...runtime,
        presignEnabled: enabled,
        mode: enabled ? 'general' : 'disabled',
        ...override,
      } as never,
    )
  }

  function operatorController() {
    return controller(true, {
      mode: 'operator-smoke',
      smokeTokenSha256: smokeTokenFingerprint(smokeToken),
    })
  }

  function validPresignBody(): Record<string, unknown> {
    return {
      clientRequestId: '00000000-0000-4000-8000-000000000010',
      albumId: '00000000-0000-4000-8000-000000000020',
      filename: 'photo.webp',
      contentType: 'image/webp',
      fileSize: 1024,
      processedSha256: 'a'.repeat(64),
    }
  }

  it('does not expose the removed upload-policy route handler', () => {
    expect('getUploadPolicy' in ImagesController.prototype).toBe(false)
  })

  it('checks disabled ingress before business work', async () => {
    await expect(
      controller(false).getUploadUrl(validPresignBody(), adminRequest as never),
    ).rejects.toMatchObject({
      response: { statusCode: 503, code: 'upload_presign_disabled' },
    })
    expect(images.getUploadUrl).not.toHaveBeenCalled()
  })

  it.each([
    ['getUploadUrl', [validPresignBody(), adminRequest]],
    [
      'confirmUpload',
      [{ uploadId: '00000000-0000-4000-8000-000000000030' }, adminRequest],
    ],
    [
      'getUploadStatus',
      ['00000000-0000-4000-8000-000000000030', adminRequest],
    ],
    [
      'abandonUpload',
      ['00000000-0000-4000-8000-000000000030', adminRequest],
    ],
  ])('checks operator ingress before business work for %s', async (method, args) => {
    await expect(
      (operatorController() as unknown as Record<
        string,
        (...input: unknown[]) => unknown
      >)[method](...args),
    ).rejects.toMatchObject({
      response: { statusCode: 403, code: 'upload_operator_smoke_required' },
    })
  })

  it('admits a valid WebP-only request and delegates it unchanged', async () => {
    const body = validPresignBody()
    await expect(
      controller().getUploadUrl(body, adminRequest as never),
    ).resolves.toEqual({ uploadId: 'upload-1' })

    expect(images.getUploadUrl).toHaveBeenCalledWith(body, 'admin-1')
  })

  it.each([
    ['a stale policyVersion field', { policyVersion: 'web-v1-legacy' }],
    ['a JPEG stored MIME', { contentType: 'image/jpeg' }],
    ['a non-UUID album ID', { albumId: 'not-a-uuid' }],
    ['an invalid digest', { processedSha256: 'A'.repeat(64) }],
    ['an unknown field', { unknown: true }],
  ])('rejects %s as upload_invalid_request before business work', async (_name, change) => {
    await expect(
      controller().getUploadUrl(
        { ...validPresignBody(), ...change },
        adminRequest as never,
      ),
    ).rejects.toMatchObject({
      response: { statusCode: 400, code: 'upload_invalid_request' },
    })
    expect(images.getUploadUrl).not.toHaveBeenCalled()
  })

  it.each([
    ['confirmUpload'],
    ['getUploadStatus'],
    ['abandonUpload'],
  ])('delegates %s without upload rate admission', async (method) => {
    const uploadId = '00000000-0000-4000-8000-000000000030'
    await expect(
      (controller() as unknown as Record<string, (...args: unknown[]) => unknown>)[
        method
      ]({ uploadId }, adminRequest),
    ).resolves.toBeDefined()
  })

  it.each([
    [new NotFoundException('opaque'), 'upload_not_found'],
    [new ConflictException('opaque'), 'upload_request_conflict'],
    [new BadRequestException('opaque'), 'upload_capacity_exceeded'],
  ])('maps real presign business exceptions to closed error %s', async (businessError, code) => {
    images.getUploadUrl.mockRejectedValueOnce(businessError)
    await expect(
      controller().getUploadUrl(validPresignBody(), adminRequest as never),
    ).rejects.toMatchObject({ response: { code } })
  })

  it('preserves typed closed errors without switching on message text', () => {
    const error = ImagesController.uploadError(
      409,
      'upload_request_conflict',
      'opaque',
    )
    expect(error).toBeInstanceOf(HttpException)
    expect(error.getResponse()).toEqual({
      statusCode: 409,
      code: 'upload_request_conflict',
      message: 'opaque',
    })
  })
})
