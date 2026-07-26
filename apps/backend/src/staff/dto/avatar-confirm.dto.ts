import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AvatarConfirmDto {
  @ApiProperty({ description: 'Object key R2 do presign trả về', example: 'staff-avatars/uuid' })
  @IsString()
  @IsNotEmpty()
  objectKey: string;
}