import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ImagePresenterService } from '../images/image-presenter.service';
import { StorageService } from '../images/storage.service';
import { UploadCleanupService } from '../images/upload-cleanup.service';
import { runSerializableWithRetry } from '../prisma/serializable-retry';
import {
  Album as PrismaAlbum,
  Category as PrismaCategory,
  Prisma,
} from '@prisma/client';
import { CreateAlbumDto } from './dto/create-album.dto';
import { UpdateAlbumDto } from './dto/update-album.dto';
import { QueryAlbumsDto } from './dto/query-albums.dto';
import { SetCoverDto } from './dto/set-cover.dto';

type CategoryAssignment = {
  categoryId: string;
  depth: number;
  source: 'manual' | 'parent';
};

type AlbumCategoryLink = {
  category: PrismaCategory | null;
  depth: number | null;
  source: string | null;
};

type AlbumWithRelations = PrismaAlbum & {
  categories?: AlbumCategoryLink[];
  tags?: any[];
  coverImage?: any;
  images?: any;
  _count?: any;
};

@Injectable()
export class AlbumsService {
  private readonly logger = new Logger(AlbumsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly uploadCleanup: UploadCleanupService,
    private readonly imagePresenter: ImagePresenterService,
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
        const foundSlugs = tags.map((t) => t.slug);
        const missing = createAlbumDto.tagSlugs.filter(
          (s) => !foundSlugs.includes(s),
        );
        throw new BadRequestException(`Tags not found: ${missing.join(', ')}`);
      }

      tagIds = tags.map((t) => t.id);
    }

    // Create album
    const { tagSlugs, categoryIds, ...albumData } = createAlbumDto;

    const sanitizedAlbumData = this.sanitizeAlbumPayload(
      albumData,
    ) as typeof albumData;

    const categoryAssignments =
      await this.buildCategoryAssignments(categoryIds);

    const album = await this.prisma.album.create({
      data: {
        ...sanitizedAlbumData,
        slug,
        publishedAt: createAlbumDto.status === 'published' ? new Date() : null,
        tags:
          tagIds.length > 0
            ? {
                create: tagIds.map((tagId) => ({ tagId })),
              }
            : undefined,
        categories:
          categoryAssignments.length > 0
            ? {
                create: categoryAssignments.map(
                  ({ categoryId: catId, depth, source }) => ({
                    categoryId: catId,
                    depth,
                    source,
                  }),
                ),
              }
            : undefined,
      },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
        categories: {
          include: {
            category: true,
          },
          orderBy: {
            depth: 'asc',
          },
        },
        coverImage: true,
      },
    });

    this.logger.log(`Album created: ${album.id}`);
    return this.presentAlbum(album);
  }

  /**
   * Find albums with filtering and pagination
   */
  async findAll(query: QueryAlbumsDto) {
    const { status, category, tag, isFeatured, limit, cursor, sortBy, search } =
      query;

    if (status && status !== 'published') {
      throw new BadRequestException('Public album status must be published');
    }
    const filters: Prisma.AlbumWhereInput[] = [{ status: 'published' }, { deleteStatus: 'active' }];

    

    if (category) {
      filters.push({
        categories: {
          some: {
            category: {
              OR: [{ id: category }, { slug: category }],
            },
          },
        },
      });
    }

    if (typeof isFeatured === 'boolean') {
      filters.push({ isFeatured });
    }

    if (tag) {
      filters.push({
        tags: {
          some: {
            tag: {
              slug: tag,
            },
          },
        },
      });
    }

    if (cursor) {
      filters.push({ id: { lt: cursor } });
    }

    if (search) {
      const term = search.trim();
      if (term) {
        const contains = {
          contains: term,
          mode: 'insensitive' as const,
        };

        filters.push({
          OR: [
            { title: contains },
            { slug: contains },
            {
              categories: {
                some: {
                  category: {
                    OR: [{ name: contains }, { slug: contains }],
                  },
                },
              },
            },
            {
              tags: {
                some: {
                  tag: {
                    OR: [{ name: contains }, { slug: contains }],
                  },
                },
              },
            },
          ],
        });
      }
    }

    const where: Prisma.AlbumWhereInput | undefined =
      filters.length === 0
        ? undefined
        : filters.length === 1
          ? filters[0]
          : { AND: filters };

    const limitValue = Math.min(Math.max(limit ?? 20, 1), 50);

    // Build orderBy clause
    let orderBy: any = {};
    switch (sortBy) {
      case 'newest':
        orderBy = [{ publishedAt: 'desc' }, { createdAt: 'desc' }];
        break;
      case 'oldest':
        orderBy = [{ publishedAt: 'asc' }, { createdAt: 'asc' }];
        break;
      case 'popular':
        orderBy = [{ viewCount: 'desc' }, { publishedAt: 'desc' }];
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
      take: limitValue + 1, // Fetch one extra to check if there's a next page
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
        categories: {
          include: {
            category: true,
          },
          orderBy: {
            depth: 'asc',
          },
        },
        coverImage: true,
        _count: {
          select: { images: true },
        },
      },
    });

    // Determine if there's a next page
    const hasMore = albums.length > limitValue;
    const data = hasMore ? albums.slice(0, limitValue) : albums;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return {
      data: data.map((album) => this.presentAlbum(album)),
      pagination: {
        hasMore,
        nextCursor,
        limit: limitValue,
      },
    };
  }

  /**
   * Find album by slug
   * @param skipViewIncrement - Skip view count increment (for metadata/admin requests)
   */
  async findBySlug(slug: string, skipViewIncrement = false) {
    const album = await this.prisma.album.findUnique({
      where: { slug, status: 'published', deleteStatus: 'active' },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
        categories: {
          include: {
            category: true,
          },
          orderBy: {
            depth: 'asc',
          },
        },
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
      this.prisma.album
        .update({
          where: { id: album.id },
          data: { viewCount: { increment: 1 } },
        })
        .catch((err) => {
          this.logger.error(`Failed to increment view count: ${err}`);
        });
    }

    return this.presentPublicAlbum(album);
  }

  async findAdminById(id: string) {
    const album = await this.prisma.album.findUnique({ where: { id }, include: { tags: { include: { tag: true } }, categories: { include: { category: true } }, coverImage: true, images: true } });
    if (!album) throw new NotFoundException('Album not found');
    return this.presentAlbum(album as any);
  }

  async findAdminAll(query: QueryAlbumsDto = {} as any) {
    const albums = await this.prisma.album.findMany({ where: query.status && query.status !== 'all' ? { status: query.status } : undefined, include: { tags: { include: { tag: true } }, categories: { include: { category: true } }, coverImage: true, _count: { select: { images: true } } }, take: Math.min(Math.max(query.limit ?? 20, 1), 50) });
    return { data: albums.map((a: any) => this.presentAlbum(a)), pagination: { hasMore: false, nextCursor: null, limit: query.limit ?? 20 } };
  }

  private presentPublicAlbum(album: any) {
    const presented = this.presentAlbum(album);
    const { googleDriveLink, scheduledPublishAt, deleteStatus, deleteStartedAt, metaTitle, metaDescription, ...safe } = presented as any;
    return { ...safe, metaTitle: album.metaTitle ?? null, metaDescription: album.metaDescription ?? null };
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
        throw new ConflictException(
          `Album with slug "${updateAlbumDto.slug}" already exists`,
        );
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
          const foundSlugs = tags.map((t) => t.slug);
          const missing = updateAlbumDto.tagSlugs.filter(
            (s) => !foundSlugs.includes(s),
          );
          throw new BadRequestException(
            `Tags not found: ${missing.join(', ')}`,
          );
        }

        const tagIds = tags.map((t) => t.id);

        tagOperations = {
          deleteMany: {},
          create: tagIds.map((tagId) => ({ tagId })),
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

    const { tagSlugs, categoryIds, ...albumData } = updateAlbumDto;

    const sanitizedAlbumData = this.sanitizeAlbumPayload(
      albumData,
    ) as typeof albumData;

    let categoryOperations: any = undefined;
    if (categoryIds !== undefined) {
      const categoryAssignments =
        await this.buildCategoryAssignments(categoryIds);
      categoryOperations = {
        deleteMany: {},
        create: categoryAssignments.map(
          ({ categoryId: catId, depth, source }) => ({
            categoryId: catId,
            depth,
            source,
          }),
        ),
      };
    }

    const updated = await this.prisma.album.update({
      where: { id },
      data: {
        ...sanitizedAlbumData,
        publishedAt: publishedAt !== undefined ? publishedAt : undefined,
        tags: tagOperations,
        categories: categoryOperations,
      },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
        categories: {
          include: {
            category: true,
          },
          orderBy: {
            depth: 'asc',
          },
        },
        coverImage: true,
      },
    });

    this.logger.log(`Album updated: ${id}`);
    return this.presentAlbum(updated);
  }

  /**
   * Delete album and all its images
   */
  async remove(id: string) {
    const lock = await (this.prisma as any).album.updateMany({
      where: { id, deleteStatus: 'active' },
      data: { deleteStatus: 'deleting', deleteStartedAt: new Date() },
    });
    if (lock.count === 0) {
      const persisted = await this.prisma.album.findUnique({
        where: { id },
        select: { deleteStatus: true },
      });
      if (!persisted) throw new NotFoundException('Album not found');
      if ((persisted as any).deleteStatus !== 'deleting') {
        throw new ConflictException('Album deletion is already in progress');
      }
    }
    await this.uploadCleanup.cleanupExpired(id);
    const imagesDeleted = await runSerializableWithRetry(() =>
      this.prisma.$transaction(
        async (tx: any) => {
          const album = await tx.album.findUnique({
            where: { id },
            include: {
              images: { where: { r2ObjectKey: { not: null } } },
            },
          });
          if (!album) throw new NotFoundException('Album not found');

          const activeUploads = await tx.imageUpload.count({
            where: {
              albumId: id,
              status: { in: ['pending', 'finalizing'] },
            },
          });
          if (activeUploads > 0) {
            throw new ConflictException(
              'Album is locked for deletion; retry after active uploads finish or expire',
            );
          }

          for (const image of album.images) {
            if (!image.r2ObjectKey) continue;
            const provider = image.r2ObjectKey.startsWith('albums/')
              ? 'r2'
              : 'cloudflare_legacy';
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
              },
              update: {},
            });
          }
          await tx.imageUpload.deleteMany({
            where: { albumId: id, status: { in: ['consumed', 'failed'] } },
          });
          await tx.album.delete({ where: { id } });
          return album.images.length;
        },
        { isolationLevel: 'Serializable' as any },
      ),
    );

    this.logger.log(`Album deleted: ${id} (${imagesDeleted} images removed)`);
    return {
      message: 'Album deleted successfully',
      imagesDeleted,
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
        categories: {
          include: {
            category: true,
          },
          orderBy: {
            depth: 'asc',
          },
        },
      },
    });

    return this.presentAlbum(updated);
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
        categories: {
          include: {
            category: true,
          },
          orderBy: {
            depth: 'asc',
          },
        },
      },
    });

    return this.presentAlbum(updated);
  }

  private sanitizeAlbumPayload(
    data: Partial<CreateAlbumDto | UpdateAlbumDto>,
  ): Partial<CreateAlbumDto | UpdateAlbumDto> {
    const sanitized: Record<string, any> = { ...data };

    const optionalStrings: Array<
      keyof Pick<
        CreateAlbumDto,
        'description' | 'metaTitle' | 'metaDescription' | 'googleDriveLink'
      >
    > = ['description', 'metaTitle', 'metaDescription', 'googleDriveLink'];

    optionalStrings.forEach((field) => {
      if (field in sanitized) {
        const value = sanitized[field];
        if (typeof value === 'string') {
          const trimmed = value.trim();
          if (trimmed === '') {
            delete sanitized[field];
          } else {
            sanitized[field] = trimmed;
          }
        }
      }
    });

    if ('shootDate' in sanitized) {
      const value = sanitized.shootDate as string | Date | undefined | null;
      if (!value) {
        delete sanitized.shootDate;
      } else if (typeof value === 'string') {
        sanitized.shootDate = new Date(value);
      }
    }

    if ('slug' in sanitized && typeof sanitized.slug === 'string') {
      sanitized.slug = sanitized.slug.trim();
      if (!sanitized.slug) {
        delete sanitized.slug;
      }
    }

    if ('status' in sanitized && typeof sanitized.status === 'string') {
      const trimmedStatus = sanitized.status.trim();
      if (trimmedStatus) {
        sanitized.status = trimmedStatus;
      } else {
        delete sanitized.status;
      }
    }

    return sanitized as Partial<CreateAlbumDto | UpdateAlbumDto>;
  }

  private async buildCategoryAssignments(
    categoryIds?: string[],
  ): Promise<CategoryAssignment[]> {
    if (!categoryIds || categoryIds.length === 0) {
      return [];
    }

    const uniqueIds = Array.from(new Set(categoryIds));
    const manualSet = new Set(uniqueIds);

    const baseCategories = await this.prisma.category.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, parentId: true },
    });

    if (baseCategories.length !== uniqueIds.length) {
      const foundIds = new Set(baseCategories.map((c) => c.id));
      const missing = uniqueIds.filter((id) => !foundIds.has(id));
      throw new BadRequestException(
        `Categories not found: ${missing.join(', ')}`,
      );
    }

    const bestDepth = new Map<string, number>();
    const parentCache = new Map<string, string | null>();
    baseCategories.forEach((cat) => {
      parentCache.set(cat.id, cat.parentId ?? null);
    });

    const stack = baseCategories.map((cat) => ({ id: cat.id, depth: 0 }));

    while (stack.length > 0) {
      const { id, depth } = stack.pop();

      const existingDepth = bestDepth.get(id);
      if (existingDepth !== undefined && existingDepth <= depth) {
        continue;
      }
      bestDepth.set(id, depth);

      let parentId = parentCache.get(id);
      if (parentId === undefined) {
        const parent = await this.prisma.category.findUnique({
          where: { id },
          select: { parentId: true },
        });
        parentId = parent?.parentId ?? null;
        parentCache.set(id, parentId);
      }

      if (parentId) {
        if (!parentCache.has(parentId)) {
          const parentParent = await this.prisma.category.findUnique({
            where: { id: parentId },
            select: { parentId: true },
          });
          parentCache.set(parentId, parentParent?.parentId ?? null);
        }

        stack.push({ id: parentId, depth: depth + 1 });
      }
    }

    const assignments: CategoryAssignment[] = Array.from(
      bestDepth.entries(),
    ).map(([categoryId, depth]) => ({
      categoryId,
      depth,
      source: manualSet.has(categoryId) ? 'manual' : 'parent',
    }));

    assignments.sort(
      (a, b) => a.depth - b.depth || a.categoryId.localeCompare(b.categoryId),
    );

    return assignments;
  }

  async getDashboardStats() {
    const [totalAlbums, publishedAlbums, draftAlbums, aggregates] =
      await Promise.all([
        this.prisma.album.count(),
        this.prisma.album.count({ where: { status: 'published' } }),
        this.prisma.album.count({ where: { status: 'draft' } }),
        this.prisma.album.aggregate({
          _sum: {
            imageCount: true,
            viewCount: true,
          },
        }),
      ]);

    return {
      totalAlbums,
      publishedAlbums,
      draftAlbums,
      totalImages: aggregates._sum?.imageCount ?? 0,
      totalViews: aggregates._sum?.viewCount ?? 0,
    };
  }

  /**
   * Normalize album relations for API consumers
   */
  presentAlbum(album: AlbumWithRelations) {
    const categories = (album.categories ?? [])
      .filter(
        (link): link is AlbumCategoryLink & { category: PrismaCategory } =>
          Boolean(link?.category),
      )
      .map((link) => ({
        id: link.category.id,
        name: link.category.name,
        slug: link.category.slug,
        depth: link.depth ?? 0,
        source: link.source === 'parent' ? 'parent' : 'manual',
      }))
      .sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));

    const primaryCategory =
      categories.find((cat) => cat.source === 'manual') ??
      categories[0] ??
      null;

    const presentedImageRelations = {
      ...(Object.prototype.hasOwnProperty.call(album, 'coverImage')
        ? {
            coverImage: album.coverImage
              ? this.imagePresenter.presentImage(album.coverImage)
              : album.coverImage,
          }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(album, 'images')
        ? {
            images: Array.isArray(album.images)
              ? album.images.map((image) =>
                  this.imagePresenter.presentImage(image),
                )
              : album.images,
          }
        : {}),
    };
    const { categories: _categories, ...rest } = album;

    return {
      ...rest,
      ...presentedImageRelations,
      primaryCategory,
      categories,
      category: primaryCategory,
    };
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
