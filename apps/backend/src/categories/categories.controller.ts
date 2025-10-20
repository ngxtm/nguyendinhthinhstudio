import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo category mới' })
  @ApiCreatedResponse({ description: 'Category đã được tạo thành công' })
  create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoriesService.create(createCategoryDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách tất cả categories' })
  @ApiCreatedResponse({ description: 'Lấy danh sách categories thành công' })
  findAll() {
    return this.categoriesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy category theo ID' })
  @ApiCreatedResponse({ description: 'Lấy category thành công' })
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật category' })
  @ApiCreatedResponse({ description: 'Cập nhật category thành công' })
  update(@Param('id') id: string, @Body() updateCategoryDto: UpdateCategoryDto) {
    return this.categoriesService.update(id, updateCategoryDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa category' })
  @ApiCreatedResponse({ description: 'Category đã được xóa thành công' })
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }

  @Get(':id/usage')
  @ApiOperation({ summary: 'Kiểm tra category đang được sử dụng ở đâu' })
  @ApiCreatedResponse({ description: 'Lấy thông tin usage thành công' })
  checkUsage(@Param('id') id: string) {
    return this.categoriesService.checkUsage(id);
  }

  @Post(':id/bulk-remove')
  @ApiOperation({ summary: 'Xóa category khỏi tất cả albums' })
  @ApiCreatedResponse({ description: 'Xóa hàng loạt thành công' })
  bulkRemoveFromAlbums(@Param('id') id: string) {
    return this.categoriesService.bulkRemoveFromAlbums(id);
  }
}
