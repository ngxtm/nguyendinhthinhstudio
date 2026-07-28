import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
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
    required: false,
  })
  @IsString()
  @IsOptional()
  parentId?: string;

  @ApiProperty({
    description:
      'Hiển thị category trong menu thư viện khi có album đã xuất bản',
    default: false,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  showInNavigation?: boolean;

  @ApiProperty({
    description: 'Thứ tự hiển thị trong cùng một cấp menu',
    default: 0,
    required: false,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  navigationOrder?: number;
}
