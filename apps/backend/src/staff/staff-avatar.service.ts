import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../images/storage.service';
import { ImageUrlService } from '../images/image-url.service';

const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB
const AVATAR_OBJECT_PREFIX = 'staff-avatars';
const AVATAR_SIZE = 256; // square avatar served via imgproxy

@Injectable()
export class StaffAvatarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly imageUrl: ImageUrlService,
  ) {}

  /**
   * Issue a presigned PUT URL for a staff avatar upload.
   * Frontend uploads the raw bytes directly to R2, then calls confirmUpload.
   */
  async presignUpload(contentType: string, fileSize: number) {
    if (!ALLOWED_AVATAR_TYPES.includes(contentType)) {
      throw new BadRequestException('Avatar phải là ảnh JPEG/PNG/WebP');
    }
    if (fileSize <= 0 || fileSize > MAX_AVATAR_BYTES) {
      throw new BadRequestException('Avatar tối đa 5MB');
    }
    const objectKey = `${AVATAR_OBJECT_PREFIX}/${randomUUID()}`;
    const uploadUrl = await this.storage.getPresignedUploadUrl(
      objectKey,
      contentType,
      fileSize,
    );
    return { objectKey, uploadUrl };
  }

  /**
   * Confirm an avatar upload: persist a signed imgproxy URL as avatarUrl.
   * The URL is resized to AVATAR_SIZE x AVATAR_SIZE, WebP, quality 80 —
   * the same optimisation pipeline used for album images (serving-time resize).
   */
  async confirmUpload(staffId: string, objectKey: string): Promise<string> {
    const staff = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff) throw new NotFoundException(`Staff ${staffId} không tồn tại`);
    if (!objectKey.startsWith(`${AVATAR_OBJECT_PREFIX}/`)) {
      throw new BadRequestException('objectKey không hợp lệ');
    }
    const avatarUrl = this.imageUrl.getSignedUrl(objectKey, AVATAR_SIZE, AVATAR_SIZE);
    await this.prisma.staff.update({
      where: { id: staffId },
      data: { avatarUrl },
    });
    return avatarUrl;
  }
}