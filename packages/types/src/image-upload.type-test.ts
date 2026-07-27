import type {
  AbandonResponse,
  ConfirmResponse,
  PresignResponse,
  UploadErrorResponse,
  UploadFailureCode,
  UploadPresignRequest,
  UploadSessionStatusResponse,
} from './image-upload.js';

const validRequest: UploadPresignRequest = {
  clientRequestId: '00000000-0000-4000-8000-000000000001',
  albumId: '00000000-0000-4000-8000-000000000002',
  filename: 'photo.webp',
  contentType: 'image/webp',
  fileSize: 1024,
  processedSha256: 'a'.repeat(64),
};
void validRequest;

const missingClientRequestId: UploadPresignRequest = {
  ...validRequest,
  // @ts-expect-error current requests always require clientRequestId
  clientRequestId: undefined,
};
void missingClientRequestId;

const missingProcessedSha256: UploadPresignRequest = {
  ...validRequest,
  // @ts-expect-error current requests always require processedSha256
  processedSha256: undefined,
};
void missingProcessedSha256;

const stalePolicyVersion: UploadPresignRequest = {
  ...validRequest,
  // @ts-expect-error simplified requests no longer accept policyVersion
  policyVersion: 'web-v1-hash',
};
void stalePolicyVersion;

const nonWebpRequest: UploadPresignRequest = {
  ...validRequest,
  // @ts-expect-error browser-produced storage only uses WebP
  contentType: 'image/jpeg',
};
void nonWebpRequest;

// @ts-expect-error legacy request variants are forbidden
const legacyRequest: UploadPresignRequest = {
  albumId: validRequest.albumId,
  filename: validRequest.filename,
  contentType: validRequest.contentType,
  fileSize: validRequest.fileSize,
};
void legacyRequest;

const rateLimited: UploadErrorResponse = {
  statusCode: 429,
  code: 'upload_rate_limited',
  message: 'retry later',
  retryAfter: '2099-01-01T00:00:00.000Z',
};
void rateLimited;

// @ts-expect-error retryAfter is required for rate limiting
const rateLimitedWithoutRetryAfter: UploadErrorResponse = {
  statusCode: 429,
  code: 'upload_rate_limited',
  message: 'retry later',
};
void rateLimitedWithoutRetryAfter;

const arbitraryError: UploadErrorResponse = {
  statusCode: 400,
  // @ts-expect-error server errors use a closed code union
  code: 'arbitrary_upload_error',
  message: 'invalid',
};
void arbitraryError;

const albumCleanupPending: UploadErrorResponse = {
  statusCode: 409,
  code: 'album_cleanup_pending',
  message: 'cleanup pending',
};
void albumCleanupPending;

const operatorSmokeRequired: UploadErrorResponse = {
  statusCode: 403,
  code: 'upload_operator_smoke_required',
  message: 'operator smoke authorization required',
};
void operatorSmokeRequired;

const presignFailure: UploadFailureCode = 'upload_presign_failed';
void presignFailure;

function assertNever(value: never): never {
  throw new Error(String(value));
}

function handleError(error: UploadErrorResponse): string {
  switch (error.code) {
    case 'upload_invalid_request':
    case 'upload_authentication_required':
    case 'upload_admin_required':
    case 'upload_operator_smoke_required':
    case 'upload_not_found':
    case 'upload_request_conflict':
    case 'upload_capacity_exceeded':
    case 'album_cleanup_pending':
    case 'upload_rate_limited':
    case 'upload_presign_disabled':
    case 'upload_rate_limit_unavailable':
      return error.code;
    default:
      return assertNever(error);
  }
}

function handleFailure(code: UploadFailureCode): string {
  switch (code) {
    case 'upload_abandoned':
    case 'upload_expired':
    case 'upload_presign_failed':
    case 'upload_digest_mismatch':
    case 'upload_source_changed':
    case 'upload_decode_failed':
    case 'upload_dispatch_rejected':
    case 'upload_cutover_aborted':
      return code;
    default:
      return assertNever(code);
  }
}

function consumeResponses(
  presign: PresignResponse,
  confirm: ConfirmResponse,
  status: UploadSessionStatusResponse,
  abandon: AbandonResponse,
): void {
  void presign;
  void confirm;
  void status;
  void abandon;
}

void handleError;
void handleFailure;
void consumeResponses;
