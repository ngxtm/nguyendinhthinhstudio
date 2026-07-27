export type UploadPresignRequest = {
  clientRequestId: string;
  albumId: string;
  filename: string;
  contentType: 'image/webp';
  fileSize: number;
  processedSha256: string;
};

export type PublicImageResponse = {
  id: string;
  filename: string;
  width: number | null;
  height: number | null;
  altText: string | null;
  thumbnailUrl: string;
  smallUrl: string;
  mediumUrl: string;
  largeUrl: string;
  xlargeUrl: string;
  orderIndex: number;
};

export type UploadFailureCode =
  | 'upload_abandoned'
  | 'upload_expired'
  | 'upload_presign_failed'
  | 'upload_digest_mismatch'
  | 'upload_source_changed'
  | 'upload_decode_failed'
  | 'upload_dispatch_rejected'
  | 'upload_cutover_aborted';

export type UploadResultDeletedResponse = {
  outcome: 'deleted';
  statusCode: 410;
  uploadId: string;
  code: 'upload_result_deleted';
  message: string;
  resultImageId: string | null;
  resultDeletedAt: string;
};

export type UploadResultUnavailableResponse = {
  outcome: 'unavailable';
  statusCode: 410;
  uploadId: string;
  code: 'upload_result_unavailable';
  message: string;
  resultImageId: string | null;
  resultDeletedAt: string | null;
};

export type PresignResponse =
  | {
      outcome: 'ready';
      statusCode: 200;
      uploadId: string;
      uploadUrl: string;
      expiresAt: string;
    }
  | {
      outcome: 'finalizing';
      statusCode: 409;
      uploadId: string;
      code: 'upload_finalizing';
      message: string;
      retryAfter: string;
    }
  | {
      outcome: 'consumed';
      statusCode: 200;
      uploadId: string;
      image: PublicImageResponse;
      resultImageId: string;
      resultDeletedAt: null;
      retentionExpiresAt: string;
    }
  | {
      outcome: 'failed';
      statusCode: 409;
      uploadId: string;
      code: 'upload_failed';
      message: string;
      failureCode: UploadFailureCode;
    }
  | {
      outcome: 'gone';
      statusCode: 410;
      uploadId: string;
      code: 'upload_session_gone';
      message: string;
    }
  | UploadResultDeletedResponse
  | UploadResultUnavailableResponse;

export type ConfirmResponse =
  | Extract<
      PresignResponse,
      { outcome: 'finalizing' | 'consumed' | 'failed' | 'gone' }
    >
  | UploadResultDeletedResponse
  | UploadResultUnavailableResponse
  | {
      outcome: 'retryable';
      statusCode: 503;
      uploadId: string;
      code: 'upload_inspection_retryable' | 'upload_storage_retryable';
      message: string;
      retryAfter: string;
    };

export type UploadSessionStatusResponse =
  | {
      outcome: 'pending';
      statusCode: 200;
      uploadId: string;
      expiresAt: string;
    }
  | Extract<
      PresignResponse,
      { outcome: 'finalizing' | 'consumed' | 'failed' | 'gone' }
    >
  | UploadResultDeletedResponse
  | UploadResultUnavailableResponse;

export type AbandonResponse =
  | {
      outcome: 'abandoned';
      statusCode: 200;
      uploadId: string;
      code: 'upload_abandoned';
      message: string;
    }
  | {
      outcome: 'finalizing';
      statusCode: 409;
      uploadId: string;
      code: 'upload_finalizing';
      message: string;
      retryAfter: string;
    }
  | {
      outcome: 'consumed';
      statusCode: 409;
      uploadId: string;
      code: 'upload_consumed';
      message: string;
    }
  | Extract<PresignResponse, { outcome: 'failed' | 'gone' }>
  | UploadResultDeletedResponse
  | UploadResultUnavailableResponse;

export type UploadErrorResponse =
  | {
      statusCode: 400;
      code: 'upload_invalid_request';
      message: string;
    }
  | {
      statusCode: 401;
      code: 'upload_authentication_required';
      message: string;
    }
  | {
      statusCode: 403;
      code: 'upload_admin_required' | 'upload_operator_smoke_required';
      message: string;
    }
  | {
      statusCode: 404;
      code: 'upload_not_found';
      message: string;
    }
  | {
      statusCode: 409;
      code: 'upload_request_conflict';
      message: string;
    }
  | {
      statusCode: 409;
      code: 'upload_capacity_exceeded' | 'album_cleanup_pending';
      message: string;
    }
  | {
      statusCode: 429;
      code: 'upload_rate_limited';
      message: string;
      retryAfter: string;
    }
  | {
      statusCode: 503;
      code: 'upload_presign_disabled' | 'upload_rate_limit_unavailable';
      message: string;
      retryAfter?: string;
    };
