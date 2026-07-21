import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class UploadConfirmDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  uploadId!: string;
}
