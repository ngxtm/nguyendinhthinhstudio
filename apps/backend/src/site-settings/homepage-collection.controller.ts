import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { HomepageCollectionService } from './homepage-collection.service';
import {
  QueryHomepageCollectionDto,
  UpdateHomepageCollectionDto,
} from './dto/homepage-collection.dto';

@ApiTags('homepage-collection')
@Controller('homepage-collection')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HomepageCollectionController {
  constructor(private readonly collection: HomepageCollectionService) {}

  @Get()
  @Public()
  getPublicCollection() {
    return this.collection.getPublicCollection();
  }

  @Get('admin')
  @Roles('admin')
  getConfiguration() {
    return this.collection.getConfiguration();
  }

  @Get('options')
  @Roles('admin')
  search(@Query() query: QueryHomepageCollectionDto) {
    return this.collection.search(query);
  }

  @Patch('admin')
  @Roles('admin')
  save(@Body() dto: UpdateHomepageCollectionDto) {
    return this.collection.save(dto.albumIds);
  }
}
