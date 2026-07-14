import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AlbumsService } from './albums.service';
import { AlbumsController } from './albums.controller';
import { RecommendationService } from './recommendation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ImagesModule } from '../images/images.module';

@Module({
  imports: [PrismaModule, AuthModule, ConfigModule, ImagesModule],
  controllers: [AlbumsController],
  providers: [AlbumsService, RecommendationService],
  exports: [AlbumsService, RecommendationService],
})
export class AlbumsModule {}
