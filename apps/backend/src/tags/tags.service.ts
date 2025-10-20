import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class TagsService {

  constructor(private readonly prisma: PrismaService) {}

  async create(createTagDto: CreateTagDto) {
    // Check if name or slug already exists
    const existing = await this.prisma.tag.findFirst({
      where: {
        OR: [
          { name: createTagDto.name },
          { slug: createTagDto.slug },
        ],
      },
    });

    if (existing) {
      if (existing.name === createTagDto.name) {
        throw new ConflictException(`Tag với tên "${createTagDto.name}" đã tồn tại`);
      }
      if (existing.slug === createTagDto.slug) {
        throw new ConflictException(`Tag với slug "${createTagDto.slug}" đã tồn tại`);
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
              ].filter(obj => Object.keys(obj).length > 0),
            },
          ],
        },
      });

      if (conflict) {
        if (conflict.name === updateTagDto.name) {
          throw new ConflictException(`Tag với tên "${updateTagDto.name}" đã tồn tại`);
        }
        if (conflict.slug === updateTagDto.slug) {
          throw new ConflictException(`Tag với slug "${updateTagDto.slug}" đã tồn tại`);
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
}
