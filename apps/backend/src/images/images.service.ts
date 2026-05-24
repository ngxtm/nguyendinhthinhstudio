import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ImageUrlService } from './image-url.service';
import { StorageService } from './storage.service';
import { UploadRequestDto } from './dto/upload-request.dto';
import { UploadConfirmDto } from './dto/upload-confirm.dto';
import { UpdateImageDto } from './dto/update-image.dto';
import { ReorderImagesDto } from './dto/reorder-images.dto';

type PendingUpload = UploadRequestDto & { objectKey: string };

@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name);
  private readonly uploadRequests = new Map<string, PendingUpload>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly imageUrl: ImageUrlService,
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

    // Check if album already has 50 images (limit)
    if (album._count.images >= 50) {
      throw new BadRequestException(
        'Album already has maximum number of images (50)',
      );
    }

    const uploadId = randomUUID();
    const { uploadUrl, objectKey } = await this.storage.getPresignedUploadUrl(
      uploadRequest.albumId,
      uploadRequest.filename,
      uploadRequest.contentType,
      uploadId,
      uploadRequest.fileSize,
    );

    this.uploadRequests.set(uploadId, { ...uploadRequest, objectKey });

    // Clean up after 15 minutes (URL expires)
    setTimeout(
      () => {
        this.uploadRequests.delete(uploadId);
      },
      15 * 60 * 1000,
    );

    return {
      uploadUrl,
      uploadId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
  }

  /**
   * Confirm image upload after R2 direct upload
   */
  async confirmUpload(confirmDto: UploadConfirmDto) {
    const uploadRequest = this.uploadRequests.get(confirmDto.uploadId);

    if (!uploadRequest) {
      this.logger.warn(
        `Upload request not found for ID: ${confirmDto.uploadId}`,
      );
      // Don't throw error, just log - webhook might come after cleanup
    }

    const albumId = uploadRequest?.albumId;

    if (!albumId) {
      throw new BadRequestException('Album ID not found in upload request');
    }

    const variantUrls = this.imageUrl.getVariantUrls(uploadRequest.objectKey);

    // Get next order index (start from 1, not 0)
    const lastImage = await this.prisma.image.findFirst({
      where: { albumId },
      orderBy: { orderIndex: 'desc' },
      select: { orderIndex: true },
    });

    const orderIndex = (lastImage?.orderIndex ?? 0) + 1;

    // Create image record
    const image = await this.prisma.image.create({
      data: {
        albumId,
        filename: uploadRequest?.filename || 'uploaded-image',
        r2ObjectKey: uploadRequest.objectKey,
        uploadStatus: 'completed',
        thumbnailUrl: variantUrls.thumbnailUrl,
        smallUrl: variantUrls.smallUrl,
        mediumUrl: variantUrls.mediumUrl,
        largeUrl: variantUrls.largeUrl,
        xlargeUrl: variantUrls.xlargeUrl,
        orderIndex,
        fileSizeKb: Math.round(uploadRequest.fileSize / 1024),
      },
    });

    // Update album image count
    await this.prisma.album.update({
      where: { id: albumId },
      data: { imageCount: { increment: 1 } },
    });

    // Clean up upload request
    this.uploadRequests.delete(confirmDto.uploadId);

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

    return this.prisma.image.findMany({
      where: {
        albumId,
        uploadStatus: 'completed',
      },
      orderBy: { orderIndex: 'asc' },
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

    if (image.r2ObjectKey) {
      try {
        await this.storage.deleteObject(image.r2ObjectKey);
      } catch (error) {
        this.logger.error(`Failed to delete image from R2: ${error}`);
        // Continue with DB deletion even if object deletion fails
      }
    }

    // Delete from database
    await this.prisma.image.delete({
      where: { id },
    });

    // Update album image count
    await this.prisma.album.update({
      where: { id: image.albumId },
      data: { imageCount: { decrement: 1 } },
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
