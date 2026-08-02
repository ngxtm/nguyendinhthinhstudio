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
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { BulkDeleteImagesDto } from '../images/dto/bulk-delete-images.dto';
import { MoveImagesDto } from '../images/dto/move-images.dto';
import { AlbumsService } from './albums.service';
import { RecommendationService } from './recommendation.service';
import { CreateAlbumDto } from './dto/create-album.dto';
import { UpdateAlbumDto } from './dto/update-album.dto';
import { QueryAlbumsDto } from './dto/query-albums.dto';
import { SetCoverDto } from './dto/set-cover.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('albums')
@Controller('albums')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AlbumsController {
  constructor(
    private readonly albumsService: AlbumsService,
    private readonly recommendationService: RecommendationService,
  ) {}

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Create new album (Admin only)' })
  @ApiResponse({ status: 201, description: 'Album created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 409, description: 'Album with slug already exists' })
  create(@Body() createAlbumDto: CreateAlbumDto) {
    return this.albumsService.create(createAlbumDto);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get all albums with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Albums retrieved successfully' })
  findAll(@Query() query: QueryAlbumsDto) {
    return this.albumsService.findAll(query);
  }

  @Get('dashboard/stats')
  @Roles('admin')
  @ApiOperation({ summary: 'Get aggregated dashboard statistics' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard stats retrieved successfully',
  })
  getDashboardStats() {
    return this.albumsService.getDashboardStats();
  }

  @Get('admin')
  @Roles('admin')
  findAdminAll(@Query() query: QueryAlbumsDto) {
    return this.albumsService.findAdminAll(query);
  }

  @Get('admin/:id')
  @Roles('admin')
  findAdminById(@Param('id') id: string) {
    return this.albumsService.findAdminById(id);
  }

  @Get('admin/slug/:slug')
  @Roles('admin')
  findAdminBySlug(@Param('slug') slug: string) {
    return this.albumsService.findAdminBySlug(slug);
  }

  @Get(':slug')
  @Public()
  @ApiOperation({ summary: 'Get album by slug' })
  @ApiResponse({ status: 200, description: 'Album retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Album not found' })
  findOne(@Param('slug') slug: string) {
    return this.albumsService.findBySlug(slug);
  }

  @Post(':slug/view')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } }) // 30 views/min/IP — tight per-album view counter
  @ApiOperation({
    summary: 'Record a single album page view (increment view count)',
  })
  @ApiResponse({ status: 200, description: 'View recorded' })
  recordView(@Param('slug') slug: string) {
    return this.albumsService.incrementView(slug);
  }

  @Get(':slug/related')
  @Public()
  @ApiOperation({ summary: 'Get 12 related albums using smart recommendation' })
  @ApiResponse({
    status: 200,
    description: 'Related albums retrieved successfully',
  })
  getRelated(@Param('slug') slug: string) {
    return this.recommendationService.getRelatedAlbums(slug, 12);
  }

  @Patch(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Update album (Admin only)' })
  @ApiResponse({ status: 200, description: 'Album updated successfully' })
  @ApiResponse({ status: 404, description: 'Album not found' })
  @ApiResponse({ status: 409, description: 'Album with slug already exists' })
  update(@Param('id') id: string, @Body() updateAlbumDto: UpdateAlbumDto) {
    return this.albumsService.update(id, updateAlbumDto);
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete album (Admin only)' })
  @ApiResponse({ status: 200, description: 'Album deleted successfully' })
  @ApiResponse({ status: 404, description: 'Album not found' })
  remove(@Param('id') id: string) {
    return this.albumsService.remove(id);
  }

  @Patch(':id/cover')
  @Roles('admin')
  @ApiOperation({ summary: 'Set album cover image (Admin only)' })
  @ApiResponse({ status: 200, description: 'Cover image set successfully' })
  @ApiResponse({ status: 404, description: 'Album or image not found' })
  @ApiResponse({ status: 400, description: 'Image does not belong to album' })
  setCover(@Param('id') id: string, @Body() setCoverDto: SetCoverDto) {
    return this.albumsService.setCover(id, setCoverDto);
  }

  @Post(':id/images/bulk-delete')
  @Roles('admin')
  @ApiOperation({
    summary: 'Delete selected album images atomically (Admin only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Images deleted and album refreshed',
  })
  @ApiResponse({ status: 400, description: 'Invalid image selection' })
  bulkDeleteImages(@Param('id') id: string, @Body() dto: BulkDeleteImagesDto) {
    return this.albumsService.bulkDeleteImages(id, dto);
  }

  @Post(':id/images/move')
  @Roles('admin')
  @ApiOperation({
    summary: 'Move selected album images atomically (Admin only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Images moved and source album refreshed',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid image selection or destination',
  })
  @ApiResponse({
    status: 409,
    description: 'Destination album capacity is exhausted',
  })
  moveImages(@Param('id') id: string, @Body() dto: MoveImagesDto) {
    return this.albumsService.moveImages(id, dto);
  }

  @Patch(':id/publish')
  @Roles('admin')
  @ApiOperation({ summary: 'Publish album (Admin only)' })
  @ApiResponse({ status: 200, description: 'Album published successfully' })
  @ApiResponse({ status: 404, description: 'Album not found' })
  publish(@Param('id') id: string) {
    return this.albumsService.update(id, { status: 'published' });
  }

  @Patch(':id/feature')
  @Roles('admin')
  @ApiOperation({ summary: 'Toggle featured status (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Featured status toggled successfully',
  })
  @ApiResponse({ status: 404, description: 'Album not found' })
  toggleFeatured(@Param('id') id: string) {
    return this.albumsService.toggleFeatured(id);
  }
}
