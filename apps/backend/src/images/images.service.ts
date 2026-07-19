import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ImagePresenterService } from './image-presenter.service';
import { ImageUrlService } from './image-url.service';
import { StorageService } from './storage.service';
import { UploadRequestDto } from './dto/upload-request.dto';
import { UploadConfirmDto } from './dto/upload-confirm.dto';
import { UpdateImageDto } from './dto/update-image.dto';
import { ReorderImagesDto } from './dto/reorder-images.dto';
import { runSerializableWithRetry } from '../prisma/serializable-retry';
import { createImageUploadRequestFingerprint } from './image-upload-fingerprint';
import {
  createPresignExpiry,
  truncateToWholeSecond,
} from './image-upload-presign-expiry';
import { ImageUploadPolicyService } from './image-upload-policy.service';

const FINALIZATION_LEASE_MS = 10 * 60 * 1000;

function isClientRequestWinnerConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as {
    code?: unknown;
    meta?: { target?: unknown };
  };
  if (candidate.code !== 'P2002') return false;
  const target = candidate.meta?.target;
  return (
    (Array.isArray(target) && target.includes('clientRequestId')) ||
    (typeof target === 'string' && target.includes('clientRequestId'))
  );
}

@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly imageUrl: ImageUrlService,
    private readonly imagePresenter: ImagePresenterService,
    private readonly uploadPolicy: ImageUploadPolicyService =
      new ImageUploadPolicyService(),
  ) {}

  /**
   * Get or reuse an owner-bound current upload session and sign its immutable
   * remaining PUT lifetime.
   */
  async getUploadUrl(
    uploadRequest: UploadRequestDto,
    createdByAdminId: string,
  ) {
    const normalizedFilename = uploadRequest.filename.normalize('NFC').trim();
    const canonicalMime = uploadRequest.contentType;
    const requestFingerprint = createImageUploadRequestFingerprint({
      clientRequestId: uploadRequest.clientRequestId,
      createdByAdminId,
      albumId: uploadRequest.albumId,
      normalizedFilename,
      canonicalMime,
      fileSize: uploadRequest.fileSize,
      processedSha256: uploadRequest.processedSha256,
      policyVersion: uploadRequest.policyVersion,
    });
    const candidateUploadId = randomUUID();
    const candidateUploadObjectKey = this.storage.createUploadObjectKey(
      candidateUploadId,
      normalizedFilename,
    );
    const candidateFinalObjectKey = this.storage.createFinalObjectKey(
      uploadRequest.albumId,
      normalizedFilename,
    );

    const session = await runSerializableWithRetry(
      () =>
        this.prisma.$transaction(
          async (tx: any) => {
            await tx.$executeRawUnsafe?.(
              'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
              `image-upload-album:${uploadRequest.albumId}`,
            );
            const album = await tx.album.findUnique({
              where: { id: uploadRequest.albumId },
            });
            if (!album) {
              throw new NotFoundException('Album not found');
            }
            if (
              album.deleteStatus !== undefined &&
              album.deleteStatus !== 'active'
            ) {
              throw new ConflictException({
                statusCode: 409,
                code: 'upload_request_conflict',
                message: 'Upload request conflicts with existing state',
              });
            }

            await tx.$executeRawUnsafe?.(
              'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
              `image-upload-request:${uploadRequest.clientRequestId}`,
            );
            await tx.$executeRawUnsafe?.(
              'SELECT 1 FROM "ImageUploadIdempotency" WHERE "clientRequestId" = $1 FOR UPDATE',
              uploadRequest.clientRequestId,
            );
            const existing = await tx.imageUploadIdempotency.findUnique({
              where: { clientRequestId: uploadRequest.clientRequestId },
            });
            if (existing) {
              if (
                existing.createdByAdminId !== createdByAdminId ||
                existing.requestFingerprint !== requestFingerprint
              ) {
                throw new ConflictException({
                  statusCode: 409,
                  code: 'upload_request_conflict',
                  message: 'Upload request conflicts with existing state',
                });
              }
              const winner = await tx.imageUpload.findUnique({
                where: { id: existing.uploadId },
              });
              if (
                !winner ||
                winner.createdByAdminId !== createdByAdminId ||
                winner.clientRequestId !== uploadRequest.clientRequestId
              ) {
                throw new ConflictException({
                  statusCode: 409,
                  code: 'upload_request_conflict',
                  message: 'Upload request conflicts with existing state',
                });
              }
              return winner;
            }

            const admissionAt = truncateToWholeSecond(new Date());
            const [completedImages, activeReservations] = await Promise.all([
              tx.image.count({ where: { albumId: uploadRequest.albumId } }),
              tx.imageUpload.count({
                where: {
                  albumId: uploadRequest.albumId,
                  OR: [
                    {
                      status: 'pending',
                      expiresAt: { gt: admissionAt },
                    },
                    { status: 'finalizing' },
                  ],
                },
              }),
            ]);
            if (completedImages + activeReservations + 1 > 50) {
              throw new ConflictException({
                statusCode: 409,
                code: 'upload_capacity_exceeded',
                message: 'Album upload capacity is exhausted',
              });
            }

            const presignExpiresAt = createPresignExpiry(admissionAt);
            const created = await tx.imageUpload.create({
              data: {
                id: candidateUploadId,
                albumId: uploadRequest.albumId,
                uploadObjectKey: candidateUploadObjectKey,
                finalObjectKey: candidateFinalObjectKey,
                filename: normalizedFilename,
                contentType: canonicalMime,
                fileSize: uploadRequest.fileSize,
                status: 'pending',
                clientRequestId: uploadRequest.clientRequestId,
                createdByAdminId,
                policyVersion: uploadRequest.policyVersion,
                policySnapshot: this.uploadPolicy.getPolicy().policy,
                processedSha256: uploadRequest.processedSha256,
                presignExpiresAt,
                expiresAt: presignExpiresAt,
              },
            });
            await tx.imageUploadIdempotency.create({
              data: {
                clientRequestId: uploadRequest.clientRequestId,
                createdByAdminId,
                uploadId: candidateUploadId,
                requestFingerprint,
              },
            });
            return created;
          },
          { isolationLevel: 'Serializable' as any },
        ),
      isClientRequestWinnerConflict,
    );

    const signingAt = truncateToWholeSecond(new Date());
    const persistedExpiry = session.presignExpiresAt ?? session.expiresAt;
    if (
      session.status !== 'pending' ||
      !(persistedExpiry instanceof Date) ||
      signingAt.getTime() >= persistedExpiry.getTime()
    ) {
      if (
        session.status === 'pending' &&
        persistedExpiry instanceof Date &&
        signingAt.getTime() >= persistedExpiry.getTime()
      ) {
        const terminalized = await this.terminalizePendingPresign(
          session,
          createdByAdminId,
          'upload_expired',
          signingAt,
        );
        if (terminalized) {
          return this.failedPresignResponse(session.id, 'upload_expired');
        }
      }
      const winner = await (this.prisma as any).imageUpload.findUnique({
        where: { id: session.id },
      });
      return this.renderSessionStatus(winner ?? session, signingAt);
    }

    try {
      const uploadUrl = await this.storage.signFixedExpiryPut(
        session.uploadObjectKey,
        session.contentType,
        session.fileSize,
        persistedExpiry,
        signingAt,
      );
      return {
        outcome: 'ready' as const,
        statusCode: 200 as const,
        uploadUrl,
        uploadId: session.id,
        expiresAt: persistedExpiry.toISOString(),
      };
    } catch {
      const terminalized = await this.terminalizePendingPresign(
        session,
        createdByAdminId,
        'upload_presign_failed',
        signingAt,
      );
      if (terminalized) {
        return this.failedPresignResponse(
          session.id,
          'upload_presign_failed',
        );
      }
      const winner = await (this.prisma as any).imageUpload.findUnique({
        where: { id: session.id },
      });
      return this.renderSessionStatus(winner ?? session, signingAt);
    }
  }

  async getUploadStatus(uploadId: string, createdByAdminId: string) {
    const session = await (this.prisma as any).imageUpload.findUnique({
      where: { id: uploadId },
    });
    this.assertOwnedSession(session, createdByAdminId);
    return this.renderSessionStatus(session, truncateToWholeSecond(new Date()));
  }

  async abandonUpload(uploadId: string, createdByAdminId: string) {
    const now = truncateToWholeSecond(new Date());
    const session = await (this.prisma as any).imageUpload.findUnique({
      where: { id: uploadId },
    });
    this.assertOwnedSession(session, createdByAdminId);

    if (this.isResultGone(session, now)) {
      return this.goneResponse(session.id);
    }
    if (session.status === 'finalizing') {
      return this.renderPresignWinner(session);
    }
    if (session.status === 'consumed') {
      return {
        outcome: 'consumed' as const,
        statusCode: 409 as const,
        uploadId: session.id,
        code: 'upload_consumed' as const,
        message: 'Upload session has already been consumed',
      };
    }
    if (session.status === 'failed') {
      if (session.failureCode === 'upload_abandoned') {
        return this.abandonedResponse(session.id);
      }
      return this.failedPresignResponse(
        session.id,
        session.failureCode ?? 'upload_presign_failed',
      );
    }
    if (session.status !== 'pending') {
      throw this.uploadNotFound();
    }

    const terminalAt = now;
    const resultRetentionExpiresAt = new Date(
      terminalAt.getTime() + 30 * 24 * 60 * 60 * 1000,
    );
    const changed = await this.prisma.$transaction(
      async (tx: any) => {
        const where: Record<string, unknown> = {
          id: session.id,
          createdByAdminId,
          status: 'pending',
        };
        if (session.sourceEtag) where.sourceEtag = session.sourceEtag;
        if (session.finalizationLeaseToken) {
          where.finalizationLeaseToken = session.finalizationLeaseToken;
        }
        const upload = await tx.imageUpload.updateMany({
          where,
          data: {
            status: 'failed',
            failureCode: 'upload_abandoned',
            terminalAt,
            resultRetentionExpiresAt,
            temporaryCleanupState: 'pending',
            temporaryCleanupNextAttemptAt: terminalAt,
          },
        });
        if (upload.count !== 1) return false;
        const idempotency = await tx.imageUploadIdempotency.updateMany({
          where: {
            clientRequestId: session.clientRequestId,
            createdByAdminId,
            uploadId: session.id,
            terminalOutcome: null,
          },
          data: {
            terminalOutcome: 'failed',
            failureCode: 'upload_abandoned',
            terminalAt,
            resultRetentionExpiresAt,
          },
        });
        if (idempotency.count !== 1) {
          throw new Error('Upload idempotency terminal outcome invariant failed');
        }
        return true;
      },
      { isolationLevel: 'Serializable' as any },
    );
    if (changed) return this.abandonedResponse(session.id);

    const winner = await (this.prisma as any).imageUpload.findUnique({
      where: { id: session.id },
    });
    this.assertOwnedSession(winner, createdByAdminId);
    if (winner.status === 'finalizing') return this.renderPresignWinner(winner);
    if (
      winner.status === 'failed' &&
      winner.failureCode === 'upload_abandoned'
    ) {
      return this.abandonedResponse(winner.id);
    }
    return this.renderSessionStatus(winner, now);
  }

  private assertOwnedSession(
    session: any,
    createdByAdminId: string,
  ): asserts session {
    if (!session || session.createdByAdminId !== createdByAdminId) {
      throw this.uploadNotFound();
    }
  }

  private uploadNotFound() {
    return new NotFoundException({
      statusCode: 404,
      code: 'upload_not_found',
      message: 'Upload session was not found',
    });
  }

  private isResultGone(session: any, now: Date): boolean {
    return (
      session.resultRetentionExpiresAt instanceof Date &&
      now.getTime() >= session.resultRetentionExpiresAt.getTime()
    );
  }

  private goneResponse(uploadId: string) {
    return {
      outcome: 'gone' as const,
      statusCode: 410 as const,
      uploadId,
      code: 'upload_session_gone' as const,
      message: 'Upload session result is no longer retained',
    };
  }

  private abandonedResponse(uploadId: string) {
    return {
      outcome: 'abandoned' as const,
      statusCode: 200 as const,
      uploadId,
      code: 'upload_abandoned' as const,
      message: 'Upload session was abandoned',
    };
  }

  private async renderSessionStatus(session: any, now: Date): Promise<any> {
    if (this.isResultGone(session, now)) return this.goneResponse(session.id);
    if (session.status === 'pending') {
      const expiry = session.presignExpiresAt ?? session.expiresAt;
      return {
        outcome: 'pending' as const,
        statusCode: 200 as const,
        uploadId: session.id,
        expiresAt: expiry.toISOString(),
      };
    }
    if (session.status === 'finalizing' || session.status === 'failed') {
      return this.renderPresignWinner(session);
    }
    if (session.status !== 'consumed') throw this.uploadNotFound();

    const retentionExpiresAt = session.resultRetentionExpiresAt;
    if (session.resultDeletedAt) {
      return {
        outcome: 'deleted' as const,
        statusCode: 410 as const,
        uploadId: session.id,
        code: 'upload_result_deleted' as const,
        message: 'Upload result was deleted',
        resultImageId: session.resultImageId ?? null,
        resultDeletedAt: session.resultDeletedAt.toISOString(),
      };
    }
    if (!session.resultImageId) {
      return this.unavailableResultResponse(session);
    }
    const image = await (this.prisma as any).image.findUnique({
      where: { id: session.resultImageId },
    });
    if (!image) return this.unavailableResultResponse(session);
    return {
      outcome: 'consumed' as const,
      statusCode: 200 as const,
      uploadId: session.id,
      image: this.imagePresenter.presentImage(image),
      resultImageId: session.resultImageId,
      resultDeletedAt: null,
      retentionExpiresAt: retentionExpiresAt.toISOString(),
    };
  }

  private unavailableResultResponse(session: any) {
    return {
      outcome: 'unavailable' as const,
      statusCode: 410 as const,
      uploadId: session.id,
      code: 'upload_result_unavailable' as const,
      message: 'Upload result is unavailable',
      resultImageId: session.resultImageId ?? null,
      resultDeletedAt: session.resultDeletedAt ?? null,
    };
  }

  private failedPresignResponse(uploadId: string, failureCode: string) {
    return {
      outcome: 'failed' as const,
      statusCode: 409 as const,
      uploadId,
      code: 'upload_failed' as const,
      message: 'Upload session has failed',
      failureCode,
    };
  }

  private renderPresignWinner(session: any) {
    if (session.status === 'failed') {
      return this.failedPresignResponse(
        session.id,
        session.failureCode ?? 'upload_presign_failed',
      );
    }
    if (session.status === 'finalizing') {
      return {
        outcome: 'finalizing' as const,
        statusCode: 409 as const,
        uploadId: session.id,
        code: 'upload_finalizing' as const,
        message: 'Upload session is being finalized',
        retryAfter: new Date(
          (session.finalizationStartedAt ?? new Date()).getTime() +
            FINALIZATION_LEASE_MS,
        ).toISOString(),
      };
    }
    throw new ConflictException({
      statusCode: 409,
      code: 'upload_request_conflict',
      message: 'Upload request conflicts with existing state',
    });
  }

  private async terminalizePendingPresign(
    session: any,
    createdByAdminId: string,
    failureCode: 'upload_expired' | 'upload_presign_failed',
    terminalAt: Date,
  ): Promise<boolean> {
    const resultRetentionExpiresAt = new Date(
      terminalAt.getTime() + 30 * 24 * 60 * 60 * 1000,
    );
    return this.prisma.$transaction(
      async (tx: any) => {
        const changed = await tx.imageUpload.updateMany({
          where: {
            id: session.id,
            createdByAdminId,
            status: 'pending',
            presignExpiresAt: session.presignExpiresAt ?? session.expiresAt,
          },
          data: {
            status: 'failed',
            failureCode,
            terminalAt,
            resultRetentionExpiresAt,
            temporaryCleanupState: 'pending',
            temporaryCleanupNextAttemptAt: terminalAt,
          },
        });
        if (changed.count !== 1) {
          return false;
        }
        const outcome = await tx.imageUploadIdempotency.updateMany({
          where: {
            clientRequestId: session.clientRequestId,
            createdByAdminId,
            uploadId: session.id,
            terminalOutcome: null,
          },
          data: {
            terminalOutcome: 'failed',
            failureCode,
            terminalAt,
            resultRetentionExpiresAt,
          },
        });
        if (outcome.count !== 1) {
          throw new Error(
            'Upload idempotency terminal outcome invariant failed',
          );
        }
        return true;
      },
      { isolationLevel: 'Serializable' as any },
    );
  }

  /**
   * Confirm image upload after R2 direct upload
   */
  async confirmUpload(confirmDto: UploadConfirmDto) {
    const imageUpload = (this.prisma as any).imageUpload;
    const session = await imageUpload.findUnique({
      where: { id: confirmDto.uploadId },
    });
    if (!session) throw new NotFoundException('Upload session not found');
    if (session.status === 'consumed')
      throw new BadRequestException('Upload session has already been consumed');
    if (session.status === 'failed')
      throw new BadRequestException('Upload session has failed');
    if (session.expiresAt < new Date())
      throw new BadRequestException('Upload session has expired');
    const leaseCutoff = new Date(Date.now() - FINALIZATION_LEASE_MS);
    if (
      session.status === 'finalizing' &&
      (!session.finalizationStartedAt ||
        session.finalizationStartedAt > leaseCutoff)
    ) {
      throw new ConflictException('Upload session is already being finalized');
    }
    let sourceEtag: string;
    try {
      sourceEtag = await this.storage.verifyObject(session.uploadObjectKey, {
        contentType: session.contentType,
        fileSize: session.fileSize,
      });
    } catch (error) {
      await imageUpload.update({
        where: { id: session.id },
        data: { status: 'failed' },
      });
      throw error;
    }
    if (session.status === 'finalizing') {
      if (!session.sourceEtag || session.sourceEtag !== sourceEtag) {
        await imageUpload.updateMany({
          where: {
            id: session.id,
            status: 'finalizing',
            sourceEtag: session.sourceEtag,
          },
          data: { status: 'failed' },
        });
        throw new BadRequestException(
          'Uploaded object ETag does not match finalizing lease',
        );
      }
      const reclaimed = await imageUpload.updateMany({
        where: {
          id: session.id,
          status: 'finalizing',
          sourceEtag: session.sourceEtag,
          finalizationStartedAt: { lte: leaseCutoff },
        },
        data: {
          status: 'pending',
          sourceEtag: null,
          finalizationStartedAt: null,
        },
      });
      if (reclaimed.count !== 1) {
        throw new ConflictException(
          'Upload session is already being finalized',
        );
      }
    }
    await runSerializableWithRetry(() =>
      this.prisma.$transaction(
        async (tx: any) => {
          const [images, finalizing] = await Promise.all([
            tx.image.count({ where: { albumId: session.albumId } }),
            tx.imageUpload.count({
              where: { albumId: session.albumId, status: 'finalizing' },
            }),
          ]);
          if (images + finalizing >= 50)
            throw new BadRequestException(
              'Album already has maximum number of images (50)',
            );
          const claimed = await tx.imageUpload.updateMany({
            where: { id: session.id, status: 'pending' },
            data: {
              status: 'finalizing',
              sourceEtag,
              finalizationStartedAt: new Date(),
            },
          });
          if (claimed.count !== 1)
            throw new ConflictException(
              'Upload session is already being finalized',
            );
        },
        { isolationLevel: 'Serializable' as any },
      ),
    );
    try {
      await this.storage.promoteObject(
        session.uploadObjectKey,
        session.finalObjectKey,
        sourceEtag,
        { contentType: session.contentType, fileSize: session.fileSize },
      );
    } catch (error) {
      await imageUpload.update({
        where: { id: session.id },
        data: { status: 'failed' },
      });
      throw error;
    }
    const variantUrls = this.imageUrl.getVariantUrls(session.finalObjectKey);
    const image = await runSerializableWithRetry(() =>
      this.prisma.$transaction(
        async (tx: any) => {
          const lastImage = await tx.image.findFirst({
            where: { albumId: session.albumId },
            orderBy: { orderIndex: 'desc' },
            select: { orderIndex: true },
          });
          const created = await tx.image.create({
            data: {
              albumId: session.albumId,
              filename: session.filename,
              r2ObjectKey: session.finalObjectKey,
              uploadStatus: 'completed',
              ...variantUrls,
              orderIndex: (lastImage?.orderIndex ?? 0) + 1,
              fileSizeKb: Math.round(session.fileSize / 1024),
            },
          });
          await tx.album.update({
            where: { id: session.albumId },
            data: { imageCount: { increment: 1 } },
          });
          await tx.imageUpload.update({
            where: { id: session.id },
            data: { status: 'consumed', consumedAt: new Date() },
          });
          return created;
        },
        { isolationLevel: 'Serializable' as any },
      ),
    );
    await this.storage
      .deleteObject(session.uploadObjectKey)
      .catch(() => undefined);

    this.logger.log(`Image uploaded successfully: ${image.id}`);

    return image;
  }

  /**
   * Get all images for an album
   */
  async findByAlbum(albumId: string) {
    const album = await this.prisma.album.findUnique({
      where: { id: albumId, status: 'published', deleteStatus: 'active' },
    });

    if (!album) {
      throw new NotFoundException('Album not found');
    }

    const images = await this.prisma.image.findMany({
      where: {
        albumId,
        uploadStatus: 'completed',
      },
      orderBy: { orderIndex: 'asc' },
    });

    return images.map((image) => {
      const presented: any = this.imagePresenter.presentImage(image);
      const {
        albumId: _albumId,
        r2ObjectKey,
        uploadStatus,
        fileSizeKb,
        createdAt,
        ...safe
      } = presented;
      return safe;
    });
  }

  /**
   * Update image metadata
   */
  async update(id: string, updateDto: UpdateImageDto) {
    const image = await this.prisma.image.findUnique({
      where: { id },
    });

    if (!image) {
      throw new NotFoundException('Image not found');
    }

    return this.prisma.image.update({
      where: { id },
      data: updateDto,
    });
  }

  /**
   * Delete image
   */
  async remove(id: string) {
    const image = await this.prisma.image.findUnique({
      where: { id },
      include: { album: true },
    });

    if (!image) {
      throw new NotFoundException('Image not found');
    }

    await this.prisma.$transaction(async (tx: any) => {
      if (image.r2ObjectKey) {
        const provider = image.r2ObjectKey.startsWith('albums/')
          ? 'r2'
          : 'cloudflare_legacy';
        const objectKeyHash = createHash('sha256')
          .update(image.r2ObjectKey)
          .digest('hex');
        const committedPromotion =
          await tx.imageUploadPromotion.findFirst({
            where: {
              committedResultImageId: image.id,
              disposition: 'committed',
            },
          });
        const authority = committedPromotion
          ? 'current_result'
          : provider === 'r2'
            ? 'legacy_image'
            : 'non_r2_deferred';
        const legacyImageSnapshotSha256 = committedPromotion
          ? null
          : createHash('sha256')
              .update(
                JSON.stringify({
                  imageId: image.id,
                  albumId: image.albumId,
                  provider,
                  objectKeyHash,
                }),
              )
              .digest('hex');
        await tx.imageObjectDeletion.upsert({
          where: {
            provider_objectKey: {
              provider,
              objectKey: image.r2ObjectKey,
            },
          },
          create: {
            imageId: image.id,
            provider,
            objectKey: image.r2ObjectKey,
            status: provider === 'r2' ? 'pending' : 'deferred',
            authority,
            objectKeyHash,
            legacyImageSnapshotSha256,
            providerDisposition:
              provider === 'r2' ? null : 'legacy_deferred',
          },
          update: {
            authority,
            objectKeyHash,
            legacyImageSnapshotSha256,
            providerDisposition:
              provider === 'r2' ? null : 'legacy_deferred',
          },
        });
        if (committedPromotion) {
          const resultDeletedAt = new Date();
          await tx.imageUpload.updateMany({
            where: { resultImageId: image.id },
            data: { resultDeletedAt },
          });
          await tx.imageUploadIdempotency.updateMany({
            where: { resultImageId: image.id },
            data: { resultDeletedAt },
          });
        }
      }
      if (image.album?.coverImageId === image.id)
        await tx.album.update({
          where: { id: image.albumId },
          data: { coverImageId: null },
        });
      await tx.image.delete({ where: { id } });
      await tx.album.update({
        where: { id: image.albumId },
        data: { imageCount: { decrement: 1 } },
      });
    });

    return { message: 'Image deleted successfully' };
  }

  /**
   * Reorder images in an album
   */
  async reorder(albumId: string, reorderDto: ReorderImagesDto) {
    const album = await this.prisma.album.findUnique({
      where: { id: albumId },
      include: { images: true },
    });

    if (!album) {
      throw new NotFoundException('Album not found');
    }

    // Validate all image IDs belong to this album
    const albumImageIds = album.images.map((img) => img.id);
    const invalidIds = reorderDto.imageIds.filter(
      (id) => !albumImageIds.includes(id),
    );

    if (invalidIds.length > 0) {
      throw new BadRequestException(
        `Invalid image IDs: ${invalidIds.join(', ')}`,
      );
    }

    // Update order indices (start from 1, not 0)
    const updatePromises = reorderDto.imageIds.map((imageId, index) =>
      this.prisma.image.update({
        where: { id: imageId },
        data: { orderIndex: index + 1 },
      }),
    );

    await Promise.all(updatePromises);

    return { message: 'Images reordered successfully' };
  }
}
