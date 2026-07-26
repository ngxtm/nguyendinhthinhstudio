import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const STAFF_ROLES = ['photographer', 'makeup_artist'] as const;
const STAFF_STATUSES = ['active', 'inactive'] as const;

export class CreateStaffDto {
  @ApiProperty({ description: 'Họ tên nhân viên', example: 'Nguyễn Văn A' })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({ description: 'Số điện thoại', required: false, example: '0901234567' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ description: 'Email nhân viên', required: false, example: 'a@ndt.studio' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ description: 'URL ảnh avatar', required: false })
  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @ApiProperty({
    description: 'Loại nhân viên',
    enum: STAFF_ROLES,
    default: 'photographer',
  })
  @IsString()
  @IsIn(STAFF_ROLES as unknown as string[])
  role: string;

  @ApiProperty({
    description: 'Trạng thái làm việc',
    enum: STAFF_STATUSES,
    default: 'active',
  })
  @IsString()
  @IsIn(STAFF_STATUSES as unknown as string[])
  @IsOptional()
  status?: string;

  @ApiProperty({ description: 'Ghi chú', required: false })
  @IsString()
  @IsOptional()
  note?: string;
}