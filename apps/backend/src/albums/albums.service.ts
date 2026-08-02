import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BulkDeleteImagesDto } from '../images/dto/bulk-delete-images.dto';
import { ImagePresenterService } from '../images/image-presenter.service';
import { ImagesService } from '../images/images.service';
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
import { RecommendationService } from './recommendation.service';
import { compareGalleryAlbums } from './gallery-sort';

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
    private readonly recommendationService: RecommendationService,
    private readonly imagesService: ImagesService,
  ) {}

  /**
   * Create a new album
   */
  async create(createAlbumDto: CreateAlbumDto) {
    if (createAlbumDto.status === 'published') {
      throw new BadRequestException({
        statusCode: 400,
        code: 'album_not_publishable',
        message:
          'A new album must be created as draft before images and a cover can be added',
      });
    }

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
    // A new published album should appear in other albums' related lists immediately.
    this.recommendationService.clearCache();
    return this.presentAlbum(album);
  }

  /**
   * Find albums with filtering and pagination
   */
  async findAll(query: QueryAlbumsDto) {
    if (query.status && query.status !== 'published') {
      throw new BadRequestException('Public album status must be published');
    }
    return this.findVisibleAlbums(query, true);
  }

  private async findVisibleAlbums(query: QueryAlbumsDto, publicOnly: boolean) {
    const {
      status,
      category,
      tag,
      isFeatured,
      limit,
      page,
      cursor,
      sortBy,
      search,
    } = query;

    const filters: Prisma.AlbumWhereInput[] = publicOnly
      ? [{ status: 'published' }, { deleteStatus: 'active' }]
      : [{ deleteStatus: 'active' }];
    if (!publicOnly && status && status !== 'all') {
      filters.push({ status });
    }

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
    const adminPage = !publicOnly
      ? Math.max(Math.floor(page ?? 1), 1)
      : undefined;
    const albumInclude = {
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
          depth: 'asc' as const,
        },
      },
      coverImage: true,
      _count: {
        select: { images: true },
      },
    };

    if (sortBy === 'gallery' && publicOnly) {
      const candidates = await this.prisma.album.findMany({
        where,
        select: {
          id: true,
          isFeatured: true,
          featuredOrder: true,
          shootDate: true,
          publishedAt: true,
          createdAt: true,
          categories: {
            select: {
              category: {
                select: { slug: true },
              },
            },
          },
        },
      });
      const sortedCandidates = [...candidates].sort(compareGalleryAlbums);
      const cursorIndex = cursor
        ? sortedCandidates.findIndex((album) => album.id === cursor)
        : -1;
      const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
      const pageCandidates = sortedCandidates.slice(
        startIndex,
        startIndex + limitValue + 1,
      );
      const hasMore = pageCandidates.length > limitValue;
      const pageIds = pageCandidates
        .slice(0, limitValue)
        .map((album) => album.id);
      const rows = pageIds.length
        ? await this.prisma.album.findMany({
            where: { id: { in: pageIds } },
            include: albumInclude,
          })
        : [];
      const rowsById = new Map(rows.map((album: any) => [album.id, album]));
      const data = pageIds
        .map((id) => rowsById.get(id))
        .filter(Boolean) as AlbumWithRelations[];

      return {
        data: data.map((album) => this.presentAlbum(album)),
        pagination: {
          hasMore,
          nextCursor: hasMore ? data[data.length - 1].id : null,
          limit: limitValue,
        },
      };
    }

    const orderBy = this.getAlbumOrderBy(sortBy);
    const cursorFilter =
      publicOnly && cursor ? this.getCursorFilter(sortBy, cursor) : null;
    const queryWhere = cursorFilter
      ? where
        ? { AND: [where, cursorFilter] }
        : cursorFilter
      : where;

    let albums: AlbumWithRelations[];
    let total: number | undefined;
    if (adminPage !== undefined) {
      [albums, total] = await Promise.all([
        this.prisma.album.findMany({
          where: queryWhere,
          orderBy,
          skip: (adminPage - 1) * limitValue,
          take: limitValue,
          include: albumInclude,
        }),
        this.prisma.album.count({ where }),
      ]);
    } else {
      albums = await this.prisma.album.findMany({
        where: queryWhere,
        orderBy,
        take: limitValue + 1,
        include: albumInclude,
      });
    }

    const hasMore =
      adminPage !== undefined
        ? adminPage * limitValue < (total ?? 0)
        : albums.length > limitValue;
    const data =
      adminPage !== undefined || !hasMore
        ? albums
        : albums.slice(0, limitValue);
    const nextCursor =
      adminPage !== undefined || !hasMore
        ? null
        : this.encodeAlbumCursor(data[data.length - 1], sortBy);
    const pagination: Record<string, unknown> = {
      hasMore,
      nextCursor,
      limit: limitValue,
    };
    if (adminPage !== undefined) {
      pagination.page = adminPage;
      pagination.total = total ?? 0;
      pagination.totalPages = Math.ceil((total ?? 0) / limitValue);
    }

    return {
      data: data.map((album) => this.presentAlbum(album)),
      pagination,
    };
  }

  private getAlbumOrderBy(
    sortBy: QueryAlbumsDto['sortBy'],
  ): Prisma.AlbumOrderByWithRelationInput[] {
    switch (sortBy) {
      case 'oldest':
        return [{ publishedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }];
      case 'popular':
        return [{ viewCount: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }];
      case 'featured':
        return [
          { isFeatured: 'desc' },
          { featuredOrder: 'desc' },
          { publishedAt: 'desc' },
          { id: 'desc' },
        ];
      case 'newest':
      default:
        return [{ publishedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }];
    }
  }

  private encodeAlbumCursor(
    album: AlbumWithRelations,
    sortBy: QueryAlbumsDto['sortBy'],
  ) {
    const payload = {
      sortBy: sortBy ?? 'newest',
      id: album.id,
      publishedAt:
        album.publishedAt?.toISOString?.() ?? album.publishedAt ?? null,
      createdAt: album.createdAt.toISOString?.() ?? album.createdAt,
      viewCount: album.viewCount,
      isFeatured: album.isFeatured,
      featuredOrder: album.featuredOrder,
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
  }

  private getCursorFilter(
    sortBy: QueryAlbumsDto['sortBy'],
    cursor: string,
  ): Prisma.AlbumWhereInput | null {
    let payload: Record<string, any>;
    try {
      payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    } catch {
      return { id: { lt: cursor } };
    }

    if (payload.sortBy !== (sortBy ?? 'newest')) {
      return { id: { lt: payload.id ?? cursor } };
    }

    const fields =
      sortBy === 'oldest'
        ? [
            ['publishedAt', 'asc'],
            ['createdAt', 'asc'],
            ['id', 'asc'],
          ]
        : sortBy === 'popular'
          ? [
              ['viewCount', 'desc'],
              ['publishedAt', 'desc'],
              ['id', 'desc'],
            ]
          : sortBy === 'featured'
            ? [
                ['isFeatured', 'desc'],
                ['featuredOrder', 'desc'],
                ['publishedAt', 'desc'],
                ['id', 'desc'],
              ]
            : [
                ['publishedAt', 'desc'],
                ['createdAt', 'desc'],
                ['id', 'desc'],
              ];
    const clauses = fields.map(([field, direction], index) => {
      const equals = Object.fromEntries(
        fields
          .slice(0, index)
          .map(([previousField]) => [
            previousField,
            this.deserializeCursorValue(previousField, payload[previousField]),
          ]),
      );
      const value = this.deserializeCursorValue(field, payload[field]);
      if (value == null && field !== 'id') return null;
      return {
        ...equals,
        [field]: {
          [direction === 'desc' ? 'lt' : 'gt']: value,
        },
      };
    });
    return { OR: clauses.filter(Boolean) as Prisma.AlbumWhereInput[] };
  }

  private deserializeCursorValue(field: string, value: unknown) {
    if (value != null && ['publishedAt', 'createdAt'].includes(field)) {
      return new Date(String(value));
    }
    return value;
  }

  /**
   * Find album by slug
   * Reads only — view count is incremented by the dedicated `incrementView`
   * endpoint (`POST /albums/:slug/view`) so prefetch/SSR metadata requests
   * don't double-count.
   */
  async findBySlug(slug: string) {
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

    return this.presentPublicAlbum(album);
  }

  /**
   * Increment an album's view count by 1.
   * Called once per real page view from the client. Single guarded write:
   * the where-clause (slug + published + active) prevents incrementing a
   * draft/soft-deleted album (no TOCTOU window), and the write is awaited so
   * the caller gets a non-2xx signal on DB failure.
   */
  async incrementView(slug: string): Promise<void> {
    const result = await this.prisma.album.updateMany({
      where: { slug, status: 'published', deleteStatus: 'active' },
      data: { viewCount: { increment: 1 } },
    });

    if (result.count === 0) {
      // Album missing, draft, or soft-deleted: no-op. Don't leak existence.
      return;
    }
  }

  async findAdminById(id: string) {
    const album = await this.prisma.album.findUnique({
      where: { id },
      include: {
        tags: { include: { tag: true } },
        categories: { include: { category: true } },
        coverImage: true,
        images: {
          where: { uploadStatus: 'completed' },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });
    if (!album) throw new NotFoundException('Album not found');
    return this.presentAlbum(album as any);
  }

  async findAdminBySlug(slug: string) {
    const album = await this.prisma.album.findUnique({
      where: { slug },
      include: {
        tags: { include: { tag: true } },
        categories: { include: { category: true } },
        coverImage: true,
        images: {
          where: { uploadStatus: 'completed' },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });
    if (!album) throw new NotFoundException('Album not found');
    return this.presentAlbum(album as any);
  }

  async findAdminAll(query: QueryAlbumsDto = {} as any) {
    return this.findVisibleAlbums(query, false);
  }

  private presentPublicAlbum(album: any) {
    const presented = this.presentAlbum(album);
    const {
      googleDriveLink,
      scheduledPublishAt,
      deleteStatus,
      deleteStartedAt,
      metaTitle,
      metaDescription,
      ...safe
    } = presented as any;
    return {
      ...safe,
      metaTitle: album.metaTitle ?? null,
      metaDescription: album.metaDescription ?? null,
    };
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

    const hydratedInclude = {
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
    } as const;
    const updateData = {
      ...sanitizedAlbumData,
      tags: tagOperations,
      categories: categoryOperations,
    };

    const updated =
      updateAlbumDto.status === 'published'
        ? await runSerializableWithRetry(() =>
            this.prisma.$transaction(
              async (tx: any) => {
                await tx.$executeRawUnsafe?.(
                  'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
                  `album-images:${id}`,
                );
                const current = await tx.album.findUnique({
                  where: { id },
                  select: {
                    status: true,
                    coverImageId: true,
                    _count: {
                      select: {
                        images: {
                          where: { uploadStatus: 'completed' },
                        },
                      },
                    },
                  },
                });
                if (!current) {
                  throw new NotFoundException('Album not found');
                }
                if (!current.coverImageId || current._count.images < 1) {
                  throw new BadRequestException({
                    statusCode: 400,
                    code: 'album_not_publishable',
                    message:
                      'Album must have a completed image and a cover before publishing',
                  });
                }

                return tx.album.update({
                  where: { id },
                  data: {
                    ...updateData,
                    publishedAt:
                      current.status !== 'published' ? new Date() : undefined,
                  },
                  include: hydratedInclude,
                });
              },
              { isolationLevel: 'Serializable' as any },
            ),
          )
        : await this.prisma.album.update({
            where: { id },
            data: updateData,
            include: hydratedInclude,
          });

    this.logger.log(`Album updated: ${id}`);
    // Album visibility/tags/categories may have changed; invalidate related-album cache.
    this.recommendationService.clearCache();
    return this.presentAlbum(updated);
  }

  async bulkDeleteImages(id: string, dto: BulkDeleteImagesDto) {
    await this.imagesService.removeMany(id, dto);
    return this.findAdminById(id);
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
          const pendingPromotions = await tx.imageUploadPromotion.count({
            where: {
              albumId: id,
              disposition: { in: ['pending', 'cleanup_required'] },
            },
          });
          if (activeUploads > 0 || pendingPromotions > 0) {
            throw new ConflictException({
              statusCode: 409,
              code: 'album_cleanup_pending',
              message: 'Album cleanup is still pending',
            });
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
          await tx.album.update({
            where: { id },
            data: { deleteStatus: 'deleted' },
          });
          return album.images.length;
        },
        { isolationLevel: 'Serializable' as any },
      ),
    );

    this.logger.log(`Album deleted: ${id} (${imagesDeleted} images removed)`);
    // Album is gone from public lists; invalidate related-album cache so it
    // stops appearing in "explore more" across all albums.
    this.recommendationService.clearCache();
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

    // Cover image is cached per candidate in recommendation results; the new
    // cover must propagate to other albums' "explore more" strips.
    this.recommendationService.clearCache();
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
        this.prisma.album.count({ where: { deleteStatus: 'active' } }),
        this.prisma.album.count({
          where: { status: 'published', deleteStatus: 'active' },
        }),
        this.prisma.album.count({
          where: { status: 'draft', deleteStatus: 'active' },
        }),
        this.prisma.album.aggregate({
          where: { deleteStatus: 'active' },
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
