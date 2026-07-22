import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AlbumsService } from '../albums/albums.service';
import { QueryTagAlbumsDto } from './dto/query-tag-albums.dto';

@Injectable()
export class TagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly albumsService: AlbumsService,
  ) {}

  async create(createTagDto: CreateTagDto) {
    // Check if name or slug already exists
    const existing = await this.prisma.tag.findFirst({
      where: {
        OR: [{ name: createTagDto.name }, { slug: createTagDto.slug }],
      },
    });

    if (existing) {
      if (existing.name === createTagDto.name) {
        throw new ConflictException(
          `Tag với tên "${createTagDto.name}" đã tồn tại`,
        );
      }
      if (existing.slug === createTagDto.slug) {
        throw new ConflictException(
          `Tag với slug "${createTagDto.slug}" đã tồn tại`,
        );
      }
    }

    return this.prisma.tag.create({
      data: createTagDto,
    });
  }

  async findAll() {
    return this.prisma.tag.findMany({
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findOne(id: string) {
    const tag = await this.prisma.tag.findUnique({
      where: { id },
    });

    if (!tag) {
      throw new NotFoundException(`Tag với ID "${id}" không tồn tại`);
    }

    return tag;
  }

  async update(id: string, updateTagDto: UpdateTagDto) {
    // Check if tag exists
    const existing = await this.prisma.tag.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Tag với ID "${id}" không tồn tại`);
    }

    // Check if name or slug conflicts with other tags
    if (updateTagDto.name || updateTagDto.slug) {
      const conflict = await this.prisma.tag.findFirst({
        where: {
          AND: [
            { id: { not: id } },
            {
              OR: [
                updateTagDto.name ? { name: updateTagDto.name } : {},
                updateTagDto.slug ? { slug: updateTagDto.slug } : {},
              ].filter((obj) => Object.keys(obj).length > 0),
            },
          ],
        },
      });

      if (conflict) {
        if (conflict.name === updateTagDto.name) {
          throw new ConflictException(
            `Tag với tên "${updateTagDto.name}" đã tồn tại`,
          );
        }
        if (conflict.slug === updateTagDto.slug) {
          throw new ConflictException(
            `Tag với slug "${updateTagDto.slug}" đã tồn tại`,
          );
        }
      }
    }

    return this.prisma.tag.update({
      where: { id },
      data: updateTagDto,
    });
  }

  async remove(id: string) {
    // Check if tag exists
    const tag = await this.prisma.tag.findUnique({
      where: { id },
      include: {
        _count: {
          select: { albums: true },
        },
      },
    });

    if (!tag) {
      throw new NotFoundException(`Tag với ID "${id}" không tồn tại`);
    }

    // Check if tag is being used
    if (tag._count.albums > 0) {
      throw new BadRequestException(
        `Không thể xóa tag "${tag.name}" vì đang được sử dụng trong ${tag._count.albums} album`,
      );
    }

    await this.prisma.tag.delete({
      where: { id },
    });

    return { message: 'Xóa tag thành công' };
  }

  async checkUsage(id: string) {
    const tag = await this.prisma.tag.findUnique({
      where: { id },
      include: {
        albums: {
          select: {
            album: {
              select: {
                id: true,
                title: true,
                slug: true,
              },
            },
          },
          take: 100, // Limit to 100 albums for display
        },
        _count: {
          select: { albums: true },
        },
      },
    });

    if (!tag) {
      throw new NotFoundException(`Tag với ID "${id}" không tồn tại`);
    }

    return {
      isUsed: tag._count.albums > 0,
      albumCount: tag._count.albums,
      albums: tag.albums.map((at) => at.album),
    };
  }

  async bulkRemoveFromAlbums(tagId: string) {
    // Check if tag exists
    const tag = await this.prisma.tag.findUnique({
      where: { id: tagId },
    });

    if (!tag) {
      throw new NotFoundException(`Tag với ID "${tagId}" không tồn tại`);
    }

    // Delete all AlbumTag relations for this tag
    const result = await this.prisma.albumTag.deleteMany({
      where: { tagId },
    });

    return {
      removed: result.count,
      message: `Đã xóa tag khỏi ${result.count} album`,
    };
  }

  async getAlbumsBySlug(slug: string, params: QueryTagAlbumsDto) {
    const tag = await this.prisma.tag.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
      },
    });

    if (!tag) {
      throw new NotFoundException(`Tag với slug "${slug}" không tồn tại`);
    }

    const { limit = 20, offset = 0 } = params;

    const includeRelations = {
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

    const orderBy = [
      { isFeatured: 'desc' as const },
      { featuredOrder: 'asc' as const },
      { viewCount: 'desc' as const },
      { publishedAt: 'desc' as const },
      { createdAt: 'desc' as const },
    ];

    const primaryWhere = {
      status: 'published' as const,
      tags: {
        some: {
          tag: {
            slug,
          },
        },
      },
    };

    const fallbackWhereBase = {
      status: 'published' as const,
      tags: {
        none: {
          tag: {
            slug,
          },
        },
      },
    };

    const primaryCount = await this.prisma.album.count({ where: primaryWhere });
    let fallbackCount: number | null = null;

    const primaryAlbums =
      offset < primaryCount
        ? await this.prisma.album.findMany({
            where: primaryWhere,
            orderBy,
            skip: offset,
            take: Math.min(limit, primaryCount - offset),
            include: includeRelations,
          })
        : [];

    const seenIds = new Set(primaryAlbums.map((album) => album.id));
    const collected = primaryAlbums.length;

    const fallbackAlbums: any[] = [];

    if (collected < limit) {
      const fallbackOffset = Math.max(0, offset + collected - primaryCount);
      const fallbackTake = limit - collected;

      fallbackCount = await this.prisma.album.count({
        where: fallbackWhereBase,
      });

      if (fallbackTake > 0 && fallbackOffset < fallbackCount) {
        const fallbackRaw = await this.prisma.album.findMany({
          where: {
            ...fallbackWhereBase,
            id: {
              notIn: Array.from(seenIds),
            },
          },
          orderBy,
          skip: fallbackOffset,
          take: fallbackTake + seenIds.size,
          include: includeRelations,
        });

        for (const album of fallbackRaw) {
          if (seenIds.has(album.id)) {
            continue;
          }
          seenIds.add(album.id);
          fallbackAlbums.push(album);
          if (fallbackAlbums.length >= fallbackTake) {
            break;
          }
        }
      }
    }

    if (fallbackCount === null && offset + collected >= primaryCount) {
      fallbackCount = await this.prisma.album.count({
        where: fallbackWhereBase,
      });
    }

    const combined = [...primaryAlbums, ...fallbackAlbums];
    const totalFetched = combined.length;
    const totalPrimary = primaryCount;
    const totalFallback = fallbackCount ?? 0;
    const totalAvailable = totalPrimary + totalFallback;
    const nextOffset = offset + totalFetched;
    const hasMore = nextOffset < totalAvailable;

    return {
      tag,
      data: combined.map((album) => this.albumsService.presentAlbum(album)),
      pagination: {
        limit,
        offset,
        nextOffset: hasMore ? nextOffset : null,
        hasMore,
        totalPrimary,
        totalFallback,
      },
    };
  }
}
