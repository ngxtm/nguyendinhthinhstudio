import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class UploadSessionStatusDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  uploadId!: string;
}
