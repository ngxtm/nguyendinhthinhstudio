import { Module } from '@nestjs/common';
import { StaffService } from './staff.service';
import { StaffAvatarService } from './staff-avatar.service';
import { StaffController } from './staff.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ImagesModule } from '../images/images.module';

@Module({
  imports: [PrismaModule, ImagesModule],
  controllers: [StaffController],
  providers: [StaffService, StaffAvatarService],
  exports: [StaffService],
})
export class StaffModule {}