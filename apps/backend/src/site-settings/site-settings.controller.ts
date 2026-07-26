import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { SiteSettingsService } from './site-settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateSiteSettingDto } from './dto/update-site-setting.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('site-settings')
@Controller('site-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SiteSettingsController {
  constructor(private readonly siteSettingsService: SiteSettingsService) {}

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'Lấy tất cả cấu hình site (admin)' })
  findAll() {
    return this.siteSettingsService.findAll();
  }

  @Get(':key')
  @Roles('admin')
  @ApiOperation({ summary: 'Lấy một cấu hình theo key (admin)' })
  findOne(@Param('key') key: string) {
    return this.siteSettingsService.findOne(key);
  }

  @Put(':key')
  @Roles('admin')
  @ApiOperation({ summary: 'Cập nhật/tạo cấu hình theo key (admin)' })
  upsert(@Param('key') key: string, @Body() dto: UpdateSiteSettingDto) {
    return this.siteSettingsService.upsert(key, dto.value);
  }
}