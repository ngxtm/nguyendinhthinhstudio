import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { ApiCreatedResponse } from '@nestjs/swagger';

@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Post()
  @ApiCreatedResponse({ description: 'Tag đã được tạo thành công'})
  create(@Body() createTagDto: CreateTagDto) {
    return this.tagsService.create(createTagDto);
  }

  @Get()
  @ApiCreatedResponse({ description: 'Lấy danh sách tag thành công'})
  findAll() {
    return this.tagsService.findAll();
  }

  @Get(':id')
  @ApiCreatedResponse({ description: 'Lấy tag theo ID thành công'})
  findOne(@Param('id') id: string) {
    return this.tagsService.findOne(id);
  }

  @Patch(':id')
  @ApiCreatedResponse({ description: 'Cập nhật tag thành công'})
  update(@Param('id') id: string, @Body() updateTagDto: UpdateTagDto) {
    return this.tagsService.update(id, updateTagDto);
  }

  @Delete(':id')
  @ApiCreatedResponse({ description: 'Tag đã được xóa thành công'})
  remove(@Param('id') id: string) {
    return this.tagsService.remove(id);
  }
}
