import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class SetCoverDto {
  @ApiProperty({ example: 'image-id-xxx', description: 'Image ID to set as cover' })
  @IsString()
  @IsNotEmpty()
  imageId!: string;
}

