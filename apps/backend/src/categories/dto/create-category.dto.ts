import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({ description: 'Tên category', example: 'Wedding' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Slug của category', example: 'wedding' })
  @IsString()
  @IsNotEmpty()
  slug: string;

  @ApiProperty({ description: 'Mô tả category', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'ID của parent category (nếu là category con)',
    example: 'uuid-of-parent',
    required: false
  })
  @IsString()
  @IsOptional()
  parentId?: string;
}
