import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { StaffService } from './staff.service';
import { StaffAvatarService } from './staff-avatar.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { AvatarPresignDto } from './dto/avatar-presign.dto';
import { AvatarConfirmDto } from './dto/avatar-confirm.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('staff')
@Controller('staff')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffController {
  constructor(
    private readonly staffService: StaffService,
    private readonly staffAvatarService: StaffAvatarService,
  ) {}

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'Lấy danh sách nhân viên (admin)' })
  @ApiCreatedResponse({ description: 'Lấy danh sách nhân viên thành công' })
  findAll() {
    return this.staffService.findAll();
  }

  @Get(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Lấy nhân viên theo ID (admin)' })
  @ApiCreatedResponse({ description: 'Lấy nhân viên thành công' })
  findOne(@Param('id') id: string) {
    return this.staffService.findOne(id);
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Tạo nhân viên mới (admin)' })
  @ApiCreatedResponse({ description: 'Nhân viên đã được tạo thành công' })
  create(@Body() createStaffDto: CreateStaffDto) {
    return this.staffService.create(createStaffDto);
  }

  @Patch(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Cập nhật nhân viên (admin)' })
  @ApiCreatedResponse({ description: 'Cập nhật nhân viên thành công' })
  update(@Param('id') id: string, @Body() updateStaffDto: UpdateStaffDto) {
    return this.staffService.update(id, updateStaffDto);
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Xóa nhân viên (admin)' })
  @ApiCreatedResponse({ description: 'Nhân viên đã được xóa thành công' })
  remove(@Param('id') id: string) {
    return this.staffService.remove(id);
  }

  @Post('avatar/presign')
  @Roles('admin')
  @ApiOperation({ summary: 'Yêu cầu presign URL để upload avatar (admin)' })
  presignAvatar(@Body() dto: AvatarPresignDto) {
    return this.staffAvatarService.presignUpload(dto.contentType, dto.fileSize);
  }

  @Post(':id/avatar')
  @Roles('admin')
  @ApiOperation({ summary: 'Xác nhận đã upload avatar, lưu URL (admin)' })
  confirmAvatar(@Param('id') id: string, @Body() dto: AvatarConfirmDto) {
    return this.staffAvatarService.confirmUpload(id, dto.objectKey);
  }
}