import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudflareService } from '../images/cloudflare.service';
import { CreateAlbumDto } from './dto/create-album.dto';
import { UpdateAlbumDto } from './dto/update-album.dto';
import { QueryAlbumsDto } from './dto/query-albums.dto';
import { SetCoverDto } from './dto/set-cover.dto';

@Injectable()
export class AlbumsService {
  private readonly logger = new Logger(AlbumsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudflare: CloudflareService,
  ) {}

  /**
   * Create a new album
   */
  async create(createAlbumDto: CreateAlbumDto) {
    // Generate slug if not provided
    const slug = createAlbumDto.slug || this.generateSlug(createAlbumDto.title);

    // Check if slug already exists
    const existing = await this.prisma.album.findUnique({
      where: { slug },
    });

    if (existing) {
      throw new ConflictException(`Album with slug "${slug}" already exists`);
    }

    // Get tags if provided
    let tagIds: string[] = [];
    if (createAlbumDto.tagSlugs && createAlbumDto.tagSlugs.length > 0) {
      const tags = await this.prisma.tag.findMany({
        where: { slug: { in: createAlbumDto.tagSlugs } },
      });

      if (tags.length !== createAlbumDto.tagSlugs.length) {
        const foundSlugs = tags.map(t => t.slug);
        const missing = createAlbumDto.tagSlugs.filter(s => !foundSlugs.includes(s));
        throw new BadRequestException(`Tags not found: ${missing.join(', ')}`);
      }

      tagIds = tags.map(t => t.id);
    }

    // Create album
    const { tagSlugs, ...albumData } = createAlbumDto;
    
    const album = await this.prisma.album.create({
      data: {
        ...albumData,
        slug,
        publishedAt: createAlbumDto.status === 'published' ? new Date() : null,
        tags: tagIds.length > 0 ? {
          create: tagIds.map(tagId => ({ tagId })),
        } : undefined,
      },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
        category: true,
        coverImage: true,
      },
    });

    this.logger.log(`Album created: ${album.id}`);
    return album;
  }

  /**
   * Find albums with filtering and pagination
   */
  async findAll(query: QueryAlbumsDto) {
    const { status, category, tag, isFeatured, limit, cursor, sortBy } = query;

    // Build where clause
    const where: any = {};

    if (status && status !== 'all') {
      where.status = status;
    }

    if (category) {
      where.categoryId = category;
    }

    if (isFeatured !== undefined) {
      where.isFeatured = isFeatured;
    }

    if (tag) {
      where.tags = {
        some: {
          tag: {
            slug: tag,
          },
        },
      };
    }

    // Cursor pagination
    if (cursor) {
      where.id = { lt: cursor };
    }

    // Build orderBy clause
    let orderBy: any = {};
    switch (sortBy) {
      case 'newest':
        orderBy = [
          { publishedAt: 'desc' },
          { createdAt: 'desc' },
        ];
        break;
      case 'oldest':
        orderBy = [
          { publishedAt: 'asc' },
          { createdAt: 'asc' },
        ];
        break;
      case 'popular':
        orderBy = [
          { viewCount: 'desc' },
          { publishedAt: 'desc' },
        ];
        break;
      case 'featured':
        orderBy = [
          { isFeatured: 'desc' },
          { featuredOrder: 'asc' },
          { publishedAt: 'desc' },
        ];
        break;
      default:
        orderBy = { createdAt: 'desc' };
    }

    // Fetch albums
    const albums = await this.prisma.album.findMany({
      where,
      orderBy,
      take: limit + 1, // Fetch one extra to check if there's a next page
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
        category: true,
        coverImage: true,
        _count: {
          select: { images: true },
        },
      },
    });

    // Determine if there's a next page
    const hasMore = albums.length > limit;
    const data = hasMore ? albums.slice(0, limit) : albums;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return {
      data,
      pagination: {
        hasMore,
        nextCursor,
        limit,
      },
    };
  }

  /**
   * Find album by slug
   * @param skipViewIncrement - Skip view count increment (for metadata/admin requests)
   */
  async findBySlug(slug: string, skipViewIncrement = false) {
    const album = await this.prisma.album.findUnique({
      where: { slug },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
        category: true,
        coverImage: true,
        images: {
          where: { uploadStatus: 'completed' },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!album) {
      throw new NotFoundException('Album not found');
    }

    // Increment view count only for actual page views (not metadata requests)
    if (!skipViewIncrement) {
      this.prisma.album.update({
        where: { id: album.id },
        data: { viewCount: { increment: 1 } },
      }).catch(err => {
        this.logger.error(`Failed to increment view count: ${err}`);
      });
    }

    return album;
  }

  /**
   * Update album
   */
  async update(id: string, updateAlbumDto: UpdateAlbumDto) {
    const album = await this.prisma.album.findUnique({
      where: { id },
    });

    if (!album) {
      throw new NotFoundException('Album not found');
    }

    // Handle slug update
    if (updateAlbumDto.slug && updateAlbumDto.slug !== album.slug) {
      const existing = await this.prisma.album.findUnique({
        where: { slug: updateAlbumDto.slug },
      });

      if (existing) {
        throw new ConflictException(`Album with slug "${updateAlbumDto.slug}" already exists`);
      }
    }

    // Handle tags update
    let tagOperations: any = undefined;
    if (updateAlbumDto.tagSlugs !== undefined) {
      if (updateAlbumDto.tagSlugs.length > 0) {
        const tags = await this.prisma.tag.findMany({
          where: { slug: { in: updateAlbumDto.tagSlugs } },
        });

        if (tags.length !== updateAlbumDto.tagSlugs.length) {
          const foundSlugs = tags.map(t => t.slug);
          const missing = updateAlbumDto.tagSlugs.filter(s => !foundSlugs.includes(s));
          throw new BadRequestException(`Tags not found: ${missing.join(', ')}`);
        }

        const tagIds = tags.map(t => t.id);

        tagOperations = {
          deleteMany: {},
          create: tagIds.map(tagId => ({ tagId })),
        };
      } else {
        tagOperations = {
          deleteMany: {},
        };
      }
    }

    // Handle publishing
    let publishedAt = undefined;
    if (updateAlbumDto.status === 'published' && album.status !== 'published') {
      publishedAt = new Date();
    }

    const { tagSlugs, ...albumData } = updateAlbumDto;

    const updated = await this.prisma.album.update({
      where: { id },
      data: {
        ...albumData,
        publishedAt: publishedAt !== undefined ? publishedAt : undefined,
        tags: tagOperations,
      },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
        category: true,
        coverImage: true,
      },
    });

    this.logger.log(`Album updated: ${id}`);
    return updated;
  }

  /**
   * Delete album and all its images
   */
  async remove(id: string) {
    const album = await this.prisma.album.findUnique({
      where: { id },
      include: {
        images: {
          where: { cloudflareImageId: { not: null } },
        },
      },
    });

    if (!album) {
      throw new NotFoundException('Album not found');
    }

    // Step 1: Delete all images from Cloudflare first
    if (album.images.length > 0) {
      this.logger.log(`Deleting ${album.images.length} images from Cloudflare for album ${id}`);

      const deletePromises = album.images.map(async (image) => {
        if (image.cloudflareImageId) {
          try {
            await this.cloudflare.deleteImage(image.cloudflareImageId);
            this.logger.log(`Deleted Cloudflare image: ${image.cloudflareImageId}`);
          } catch (error) {
            this.logger.error(`Failed to delete Cloudflare image ${image.cloudflareImageId}: ${error}`);
            // Continue even if Cloudflare deletion fails
          }
        }
      });

      await Promise.all(deletePromises);
    }

    // Step 2: Delete album (images will be cascade deleted from database)
    await this.prisma.album.delete({
      where: { id },
    });

    this.logger.log(`Album deleted: ${id} (${album.images.length} images removed)`);
    return {
      message: 'Album deleted successfully',
      imagesDeleted: album.images.length,
    };
  }

  /**
   * Set cover image
   */
  async setCover(id: string, setCoverDto: SetCoverDto) {
    const [album, image] = await Promise.all([
      this.prisma.album.findUnique({ where: { id } }),
      this.prisma.image.findUnique({ where: { id: setCoverDto.imageId } }),
    ]);

    if (!album) {
      throw new NotFoundException('Album not found');
    }

    if (!image) {
      throw new NotFoundException('Image not found');
    }

    if (image.albumId !== album.id) {
      throw new BadRequestException('Image does not belong to this album');
    }

    const updated = await this.prisma.album.update({
      where: { id },
      data: { coverImageId: setCoverDto.imageId },
      include: {
        coverImage: true,
        images: {
          where: { uploadStatus: 'completed' },
          orderBy: { orderIndex: 'asc' },
        },
        tags: {
          include: {
            tag: true,
          },
        },
        category: true,
      },
    });

    return updated;
  }

  /**
   * Toggle featured status
   */
  async toggleFeatured(id: string) {
    const album = await this.prisma.album.findUnique({
      where: { id },
    });

    if (!album) {
      throw new NotFoundException('Album not found');
    }

    // If making featured, get the next order number
    let featuredOrder = album.featuredOrder;
    if (!album.isFeatured) {
      const lastFeatured = await this.prisma.album.findFirst({
        where: { isFeatured: true },
        orderBy: { featuredOrder: 'desc' },
      });
      featuredOrder = (lastFeatured?.featuredOrder ?? 0) + 1;
    } else {
      featuredOrder = null;
    }

    const updated = await this.prisma.album.update({
      where: { id },
      data: {
        isFeatured: !album.isFeatured,
        featuredOrder,
      },
      include: {
        coverImage: true,
        tags: {
          include: {
            tag: true,
          },
        },
        category: true,
      },
    });

    return updated;
  }

  /**
   * Generate URL-friendly slug from title
   */
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }
}

