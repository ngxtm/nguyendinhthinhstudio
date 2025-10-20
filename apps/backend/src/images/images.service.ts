import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudflareService } from './cloudflare.service';
import { UploadRequestDto } from './dto/upload-request.dto';
import { UploadConfirmDto } from './dto/upload-confirm.dto';
import { UpdateImageDto } from './dto/update-image.dto';
import { ReorderImagesDto } from './dto/reorder-images.dto';

@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name);
  private readonly uploadRequests = new Map<string, UploadRequestDto>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudflare: CloudflareService,
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
      throw new BadRequestException('Album already has maximum number of images (50)');
    }

    // Get presigned URL from Cloudflare
    const { uploadURL, id } = await this.cloudflare.getDirectUploadUrl({
      albumId: uploadRequest.albumId,
      filename: uploadRequest.filename,
    });

    // Store upload request temporarily (for webhook confirmation)
    this.uploadRequests.set(id, uploadRequest);

    // Clean up after 15 minutes (URL expires)
    setTimeout(() => {
      this.uploadRequests.delete(id);
    }, 15 * 60 * 1000);

    return {
      uploadUrl: uploadURL,
      uploadId: id,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
  }

  /**
   * Confirm image upload via webhook from Cloudflare
   */
  async confirmUpload(confirmDto: UploadConfirmDto) {
    // Get original upload request
    const uploadRequest = this.uploadRequests.get(confirmDto.uploadId);
    
    if (!uploadRequest) {
      this.logger.warn(`Upload request not found for ID: ${confirmDto.uploadId}`);
      // Don't throw error, just log - webhook might come after cleanup
    }

    const albumId = uploadRequest?.albumId;
    
    if (!albumId) {
      throw new BadRequestException('Album ID not found in upload request');
    }

    // Get variant URLs
    const variantUrls = this.cloudflare.getVariantUrls(confirmDto.cloudflareImageId);

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
        cloudflareImageId: confirmDto.cloudflareImageId,
        uploadStatus: 'completed',
        thumbnailUrl: variantUrls.thumbnailUrl,
        smallUrl: variantUrls.smallUrl,
        mediumUrl: variantUrls.mediumUrl,
        largeUrl: variantUrls.largeUrl,
        xlargeUrl: variantUrls.xlargeUrl,
        orderIndex,
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

    // Delete from Cloudflare
    if (image.cloudflareImageId) {
      try {
        await this.cloudflare.deleteImage(image.cloudflareImageId);
      } catch (error) {
        this.logger.error(`Failed to delete image from Cloudflare: ${error}`);
        // Continue with DB deletion even if Cloudflare deletion fails
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
    const albumImageIds = album.images.map(img => img.id);
    const invalidIds = reorderDto.imageIds.filter(id => !albumImageIds.includes(id));

    if (invalidIds.length > 0) {
      throw new BadRequestException(`Invalid image IDs: ${invalidIds.join(', ')}`);
    }

    // Update order indices (start from 1, not 0)
    const updatePromises = reorderDto.imageIds.map((imageId, index) =>
      this.prisma.image.update({
        where: { id: imageId },
        data: { orderIndex: index + 1 },
      })
    );

    await Promise.all(updatePromises);

    return { message: 'Images reordered successfully' };
  }
}

