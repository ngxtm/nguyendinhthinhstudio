import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ImagePresenterService } from './image-presenter.service';
import { ImageUrlService } from './image-url.service';
import { StorageService } from './storage.service';
import { UploadRequestDto } from './dto/upload-request.dto';
import { UploadConfirmDto } from './dto/upload-confirm.dto';
import { UpdateImageDto } from './dto/update-image.dto';
import { ReorderImagesDto } from './dto/reorder-images.dto';
import { runSerializableWithRetry } from '../prisma/serializable-retry';

const FINALIZATION_LEASE_MS = 10 * 60 * 1000;

@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly imageUrl: ImageUrlService,
    private readonly imagePresenter: ImagePresenterService,
  ) {}

  /**
   * Get presigned upload URL for image upload
   */
  async getUploadUrl(uploadRequest: UploadRequestDto) {
    // Validate album exists
    const album = await this.prisma.album.findUnique({
      where: { id: uploadRequest.albumId },
      include: { _count: { select: { images: true } } },
    });

    if (!album) {
      throw new NotFoundException('Album not found');
    }
    if (
      (album as any).deleteStatus !== undefined &&
      (album as any).deleteStatus !== 'active'
    ) {
      throw new ConflictException('Album is locked for deletion');
    }

    // Check if album already has 50 images (limit)
    if (album._count.images >= 50) {
      throw new BadRequestException(
        'Album already has maximum number of images (50)',
      );
    }

    const uploadId = randomUUID();
    const uploadObjectKey = this.storage.createUploadObjectKey(
      uploadId,
      uploadRequest.filename,
    );
    const finalObjectKey = this.storage.createFinalObjectKey(
      uploadRequest.albumId,
      uploadRequest.filename,
    );
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const imageUpload = (this.prisma as any).imageUpload;
    await imageUpload.create({
      data: {
        id: uploadId,
        ...uploadRequest,
        uploadObjectKey,
        finalObjectKey,
        status: 'pending',
        expiresAt,
      },
    });
    let uploadUrl: string;
    try {
      uploadUrl = await this.storage.getPresignedUploadUrl(
        uploadObjectKey,
        uploadRequest.contentType,
        uploadRequest.fileSize,
      );
    } catch (error) {
      await imageUpload.deleteMany?.({
        where: { id: uploadId, status: 'pending' },
      });
      throw error;
    }

    return {
      uploadUrl,
      uploadId,
      expiresAt: expiresAt.toISOString(),
    };
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
      where: { id: albumId },
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

    return images.map((image) => this.imagePresenter.presentImage(image));
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
        await tx.imageObjectDeletion.upsert({
          where: {
            provider_objectKey: {
              provider: image.r2ObjectKey.startsWith('albums/')
                ? 'r2'
                : 'cloudflare_legacy',
              objectKey: image.r2ObjectKey,
            },
          },
          create: {
            imageId: image.id,
            provider: image.r2ObjectKey.startsWith('albums/')
              ? 'r2'
              : 'cloudflare_legacy',
            objectKey: image.r2ObjectKey,
            status: image.r2ObjectKey.startsWith('albums/')
              ? 'pending'
              : 'deferred',
          },
          update: {},
        });
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
