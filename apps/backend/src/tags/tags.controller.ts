import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { QueryTagAlbumsDto } from './dto/query-tag-albums.dto';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('tags')
@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo tag mới' })
  @ApiCreatedResponse({ description: 'Tag đã được tạo thành công' })
  create(@Body() createTagDto: CreateTagDto) {
    return this.tagsService.create(createTagDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách tất cả tags' })
  @ApiCreatedResponse({ description: 'Lấy danh sách tag thành công' })
  findAll() {
    return this.tagsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy tag theo ID' })
  @ApiCreatedResponse({ description: 'Lấy tag theo ID thành công' })
  findOne(@Param('id') id: string) {
    return this.tagsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật tag' })
  @ApiCreatedResponse({ description: 'Cập nhật tag thành công' })
  update(@Param('id') id: string, @Body() updateTagDto: UpdateTagDto) {
    return this.tagsService.update(id, updateTagDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa tag' })
  @ApiCreatedResponse({ description: 'Tag đã được xóa thành công' })
  remove(@Param('id') id: string) {
    return this.tagsService.remove(id);
  }

  @Get(':id/usage')
  @ApiOperation({ summary: 'Kiểm tra tag đang được sử dụng ở đâu' })
  @ApiCreatedResponse({ description: 'Lấy thông tin usage thành công' })
  checkUsage(@Param('id') id: string) {
    return this.tagsService.checkUsage(id);
  }

  @Post(':id/bulk-remove')
  @ApiOperation({ summary: 'Xóa tag khỏi tất cả albums' })
  @ApiCreatedResponse({ description: 'Xóa hàng loạt thành công' })
  bulkRemoveFromAlbums(@Param('id') id: string) {
    return this.tagsService.bulkRemoveFromAlbums(id);
  }

  @Get('slug/:slug/albums')
  @Public()
  @ApiOperation({ summary: 'Danh sách album theo tag (blended feed)' })
  @ApiCreatedResponse({
    description: 'Lấy danh sách album theo tag thành công',
  })
  findAlbumsByTag(
    @Param('slug') slug: string,
    @Query() query: QueryTagAlbumsDto,
  ) {
    return this.tagsService.getAlbumsBySlug(slug, query);
  }
}
