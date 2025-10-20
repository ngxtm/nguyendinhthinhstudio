import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCategoryDto: CreateCategoryDto) {
    // Check if name or slug already exists
    const existing = await this.prisma.category.findFirst({
      where: {
        OR: [
          { name: createCategoryDto.name },
          { slug: createCategoryDto.slug },
        ],
      },
    });

    if (existing) {
      if (existing.name === createCategoryDto.name) {
        throw new ConflictException(`Category với tên "${createCategoryDto.name}" đã tồn tại`);
      }
      if (existing.slug === createCategoryDto.slug) {
        throw new ConflictException(`Category với slug "${createCategoryDto.slug}" đã tồn tại`);
      }
    }

    // Validate parent if provided
    if (createCategoryDto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: createCategoryDto.parentId },
      });

      if (!parent) {
        throw new BadRequestException(`Parent category với ID "${createCategoryDto.parentId}" không tồn tại`);
      }
    }

    return this.prisma.category.create({
      data: createCategoryDto,
      include: {
        parent: true,
        children: true,
        _count: {
          select: { albums: true, children: true },
        },
      },
    });
  }

  async findAll() {
    const categories = await this.prisma.category.findMany({
      include: {
        parent: true,
        children: true,
        _count: {
          select: { albums: true, children: true },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return categories.map((category) => ({
      ...category,
      albumCount: category._count.albums,
      childrenCount: category._count.children,
      _count: undefined,
    }));
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        parent: true,
        children: true,
        _count: {
          select: { albums: true, children: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category với ID "${id}" không tồn tại`);
    }

    return {
      ...category,
      albumCount: category._count.albums,
      childrenCount: category._count.children,
      _count: undefined,
    };
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto) {
    // Check if category exists
    const existing = await this.prisma.category.findUnique({
      where: { id },
      include: { children: true },
    });

    if (!existing) {
      throw new NotFoundException(`Category với ID "${id}" không tồn tại`);
    }

    // Validate parentId if provided
    if (updateCategoryDto.parentId !== undefined) {
      if (updateCategoryDto.parentId) {
        // Check parent exists
        const parent = await this.prisma.category.findUnique({
          where: { id: updateCategoryDto.parentId },
        });

        if (!parent) {
          throw new BadRequestException(`Parent category với ID "${updateCategoryDto.parentId}" không tồn tại`);
        }

        // Prevent self-reference
        if (updateCategoryDto.parentId === id) {
          throw new BadRequestException('Category không thể là parent của chính nó');
        }

        // Prevent circular reference (parent là child của current category)
        const isCircular = await this.checkCircularReference(id, updateCategoryDto.parentId);
        if (isCircular) {
          throw new BadRequestException('Không thể tạo quan hệ vòng tròn (circular reference)');
        }
      }
    }

    // Check if name or slug conflicts with other categories
    if (updateCategoryDto.name || updateCategoryDto.slug) {
      const conflict = await this.prisma.category.findFirst({
        where: {
          AND: [
            { id: { not: id } },
            {
              OR: [
                updateCategoryDto.name ? { name: updateCategoryDto.name } : {},
                updateCategoryDto.slug ? { slug: updateCategoryDto.slug } : {},
              ].filter(obj => Object.keys(obj).length > 0),
            },
          ],
        },
      });

      if (conflict) {
        if (conflict.name === updateCategoryDto.name) {
          throw new ConflictException(`Category với tên "${updateCategoryDto.name}" đã tồn tại`);
        }
        if (conflict.slug === updateCategoryDto.slug) {
          throw new ConflictException(`Category với slug "${updateCategoryDto.slug}" đã tồn tại`);
        }
      }
    }

    return this.prisma.category.update({
      where: { id },
      data: updateCategoryDto,
      include: {
        parent: true,
        children: true,
        _count: {
          select: { albums: true, children: true },
        },
      },
    });
  }

  // Helper: Check if setting parentId would create a circular reference
  private async checkCircularReference(categoryId: string, newParentId: string): Promise<boolean> {
    let currentId: string | null = newParentId;

    while (currentId) {
      if (currentId === categoryId) {
        return true; // Circular reference detected
      }

      const parent = await this.prisma.category.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });

      currentId = parent?.parentId || null;
    }

    return false;
  }

  async remove(id: string) {
    // Check if category exists
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        children: true,
        _count: {
          select: { albums: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category với ID "${id}" không tồn tại`);
    }

    // Check if category has children
    if (category.children.length > 0) {
      throw new BadRequestException(
        `Không thể xóa category "${category.name}" vì có ${category.children.length} category con`,
      );
    }

    // Check if category is being used
    if (category._count.albums > 0) {
      throw new BadRequestException(
        `Không thể xóa category "${category.name}" vì đang được sử dụng trong ${category._count.albums} album`,
      );
    }

    await this.prisma.category.delete({
      where: { id },
    });

    return { message: 'Xóa category thành công' };
  }

  async checkUsage(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        albums: {
          select: {
            id: true,
            title: true,
            slug: true,
          },
          take: 100, // Limit to 100 albums for display
        },
        _count: {
          select: { albums: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category với ID "${id}" không tồn tại`);
    }

    return {
      isUsed: category._count.albums > 0,
      albumCount: category._count.albums,
      albums: category.albums,
    };
  }

  async bulkRemoveFromAlbums(categoryId: string) {
    // Check if category exists
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException(`Category với ID "${categoryId}" không tồn tại`);
    }

    // Update all albums to remove this category
    const result = await this.prisma.album.updateMany({
      where: { categoryId },
      data: { categoryId: null },
    });

    return {
      removed: result.count,
      message: `Đã xóa category khỏi ${result.count} album`,
    };
  }
}
