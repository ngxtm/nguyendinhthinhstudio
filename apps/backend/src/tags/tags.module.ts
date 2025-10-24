import { Module } from '@nestjs/common';
import { TagsService } from './tags.service';
import { TagsController } from './tags.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AlbumsModule } from '../albums/albums.module';

@Module({
  imports: [PrismaModule, AlbumsModule],
  controllers: [TagsController],
  providers: [TagsService],
})
export class TagsModule {}
