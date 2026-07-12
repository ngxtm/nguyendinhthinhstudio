import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ImagesService } from './images.service';
import { UploadRequestDto } from './dto/upload-request.dto';
import { UploadConfirmDto } from './dto/upload-confirm.dto';
import { UpdateImageDto } from './dto/update-image.dto';
import { ReorderImagesDto } from './dto/reorder-images.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('images')
@Controller('images')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Post('upload-url')
  @Public() // TODO: Remove this in production - only for development
  @ApiOperation({ summary: 'Get presigned upload URL (Admin only)' })
  @ApiResponse({ status: 200, description: 'Upload URL generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request or album limit reached' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Album not found' })
  getUploadUrl(@Body() uploadRequestDto: UploadRequestDto) {
    return this.imagesService.getUploadUrl(uploadRequestDto);
  }

  @Post('webhook')
  @Public()
  @ApiOperation({ summary: 'Cloudflare webhook for upload confirmation' })
  @ApiResponse({ status: 200, description: 'Upload confirmed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid webhook payload' })
  confirmUpload(@Body() uploadConfirmDto: UploadConfirmDto) {
    return this.imagesService.confirmUpload(uploadConfirmDto);
  }

  @Get('album/:albumId')
  @Public()
  @ApiOperation({ summary: 'Get all images for an album' })
  @ApiResponse({ status: 200, description: 'Images retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Album not found' })
  findByAlbum(@Param('albumId') albumId: string) {
    return this.imagesService.findByAlbum(albumId);
  }

  @Patch(':id')
  @Public() // TODO: Remove this in production - only for development
  @ApiOperation({ summary: 'Update image metadata (Admin only)' })
  @ApiResponse({ status: 200, description: 'Image updated successfully' })
  @ApiResponse({ status: 404, description: 'Image not found' })
  update(@Param('id') id: string, @Body() updateImageDto: UpdateImageDto) {
    return this.imagesService.update(id, updateImageDto);
  }

  @Delete(':id')
  @Public() // TODO: Remove this in production - only for development
  @ApiOperation({ summary: 'Delete image (Admin only)' })
  @ApiResponse({ status: 200, description: 'Image deleted successfully' })
  @ApiResponse({ status: 404, description: 'Image not found' })
  remove(@Param('id') id: string) {
    return this.imagesService.remove(id);
  }

  @Patch('album/:albumId/reorder')
  @Public() // TODO: Remove this in production - only for development
  @ApiOperation({ summary: 'Reorder images in album (Admin only)' })
  @ApiResponse({ status: 200, description: 'Images reordered successfully' })
  @ApiResponse({ status: 400, description: 'Invalid image IDs' })
  @ApiResponse({ status: 404, description: 'Album not found' })
  reorder(@Param('albumId') albumId: string, @Body() reorderDto: ReorderImagesDto) {
    return this.imagesService.reorder(albumId, reorderDto);
  }
}

