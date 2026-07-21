import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class UploadRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientRequestId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  albumId!: string;

  @ApiProperty({ example: 'photo.jpg' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[\p{L}\p{N}](?:[\p{L}\p{N} ._()-]*[\p{L}\p{N})])?$/u)
  filename!: string;

  @ApiProperty({ maximum: 5_242_880 })
  @IsInt()
  @Min(1)
  @Max(5_242_880)
  fileSize!: number;

  @ApiProperty({ enum: ['image/jpeg', 'image/png', 'image/webp'] })
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  contentType!: 'image/jpeg' | 'image/png' | 'image/webp';

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @Matches(/^[0-9a-f]{64}$/)
  processedSha256!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  policyVersion!: string;
}
