import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { PricingService } from './pricing.service';
import { UpdatePricingDto } from './dto/update-pricing.dto';

@ApiTags('pricing')
@Controller('pricing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get('admin/:category')
  @Roles('admin')
  @Header('Cache-Control', 'no-store')
  getConfiguration(@Param('category') category: string) {
    return this.pricing.getConfiguration(category);
  }

  @Put('admin/:category/draft')
  @Roles('admin')
  @Header('Cache-Control', 'no-store')
  saveDraft(
    @Param('category') category: string,
    @Body() dto: UpdatePricingDto,
  ) {
    return this.pricing.save(category, dto, false);
  }

  @Post('admin/:category/publish')
  @HttpCode(200)
  @Roles('admin')
  @Header('Cache-Control', 'no-store')
  publish(@Param('category') category: string, @Body() dto: UpdatePricingDto) {
    return this.pricing.save(category, dto, true);
  }

  @Get(':category')
  @Public()
  @Header('Cache-Control', 'no-store')
  getPublished(@Param('category') category: string) {
    return this.pricing.getPublished(category);
  }
}
