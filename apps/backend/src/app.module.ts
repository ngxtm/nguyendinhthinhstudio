import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { TagsModule } from './tags/tags.module';

@Module({
  imports: [PrismaModule, TagsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
