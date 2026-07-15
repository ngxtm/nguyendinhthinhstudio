import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { QueryTagAlbumsDto } from './dto/query-tag-albums.dto';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('tags')
@Controller('tags')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Tạo tag mới' })
  @ApiCreatedResponse({ description: 'Tag đã được tạo thành công' })
  create(@Body() createTagDto: CreateTagDto) {
    return this.tagsService.create(createTagDto);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Lấy danh sách tất cả tags' })
  @ApiCreatedResponse({ description: 'Lấy danh sách tag thành công' })
  findAll() {
    return this.tagsService.findAll();
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Lấy tag theo ID' })
  @ApiCreatedResponse({ description: 'Lấy tag theo ID thành công' })
  findOne(@Param('id') id: string) {
    return this.tagsService.findOne(id);
  }

  @Patch(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Cập nhật tag' })
  @ApiCreatedResponse({ description: 'Cập nhật tag thành công' })
  update(@Param('id') id: string, @Body() updateTagDto: UpdateTagDto) {
    return this.tagsService.update(id, updateTagDto);
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Xóa tag' })
  @ApiCreatedResponse({ description: 'Tag đã được xóa thành công' })
  remove(@Param('id') id: string) {
    return this.tagsService.remove(id);
  }

  @Get(':id/usage')
  @Roles('admin')
  @ApiOperation({ summary: 'Kiểm tra tag đang được sử dụng ở đâu' })
  @ApiCreatedResponse({ description: 'Lấy thông tin usage thành công' })
  checkUsage(@Param('id') id: string) {
    return this.tagsService.checkUsage(id);
  }

  @Post(':id/bulk-remove')
  @Roles('admin')
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
