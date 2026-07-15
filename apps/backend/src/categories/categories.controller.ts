import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('categories')
@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Tạo category mới' })
  @ApiCreatedResponse({ description: 'Category đã được tạo thành công' })
  create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoriesService.create(createCategoryDto);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Lấy danh sách tất cả categories' })
  @ApiCreatedResponse({ description: 'Lấy danh sách categories thành công' })
  findAll() {
    return this.categoriesService.findAll();
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Lấy category theo ID' })
  @ApiCreatedResponse({ description: 'Lấy category thành công' })
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Patch(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Cập nhật category' })
  @ApiCreatedResponse({ description: 'Cập nhật category thành công' })
  update(@Param('id') id: string, @Body() updateCategoryDto: UpdateCategoryDto) {
    return this.categoriesService.update(id, updateCategoryDto);
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Xóa category' })
  @ApiCreatedResponse({ description: 'Category đã được xóa thành công' })
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }

  @Get(':id/usage')
  @Roles('admin')
  @ApiOperation({ summary: 'Kiểm tra category đang được sử dụng ở đâu' })
  @ApiCreatedResponse({ description: 'Lấy thông tin usage thành công' })
  checkUsage(@Param('id') id: string) {
    return this.categoriesService.checkUsage(id);
  }

  @Post(':id/bulk-remove')
  @Roles('admin')
  @ApiOperation({ summary: 'Xóa category khỏi tất cả albums' })
  @ApiCreatedResponse({ description: 'Xóa hàng loạt thành công' })
  bulkRemoveFromAlbums(@Param('id') id: string) {
    return this.categoriesService.bulkRemoveFromAlbums(id);
  }
}
