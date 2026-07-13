import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class UploadConfirmDto {
  @ApiProperty({
    example: 'uuid-upload-id',
    description: 'Upload ID from presigned URL request',
  })
  @IsUUID()
  uploadId!: string;
}
