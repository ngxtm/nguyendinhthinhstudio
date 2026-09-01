import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsString,
} from 'class-validator';

export class MoveImagesDto {
  @ApiProperty({
    example: [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ],
    description: 'Exact snapshot of image IDs selected for moving',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  imageIds!: string[];

  @ApiProperty({
    example: '00000000-0000-4000-8000-000000000003',
    description: 'Destination album ID',
  })
  @IsString()
  @IsNotEmpty()
  targetAlbumId!: string;
}
