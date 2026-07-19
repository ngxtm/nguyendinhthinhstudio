import {
  ArgumentsHost,
  BadRequestException,
  Body,
  Catch,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { UploadErrorResponse } from '@ndt/types';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ReorderImagesDto } from './dto/reorder-images.dto';
import { UpdateImageDto } from './dto/update-image.dto';
import { UploadConfirmDto } from './dto/upload-confirm.dto';
import { UploadRequestDto } from './dto/upload-request.dto';
import { UploadSessionAbandonDto } from './dto/upload-session-abandon.dto';
import { UploadSessionStatusDto } from './dto/upload-session-status.dto';
import {
  ImageUploadRateLimitService,
  type ImageUploadRouteScope,
} from './image-upload-rate-limit.service';
import { ImageUploadPolicyService } from './image-upload-policy.service';
import { ImagesService } from './images.service';

export const IMAGE_UPLOAD_CONTROLLER_RUNTIME =
  'IMAGE_UPLOAD_CONTROLLER_RUNTIME' as const;

type AdminRequest = Request & {
  user?: { sub?: string; id?: string; userId?: string; role?: string };
};

@Catch(UnauthorizedException, ForbiddenException)
class UploadRouteAuthExceptionFilter implements ExceptionFilter {
  catch(
    exception: UnauthorizedException | ForbiddenException,
    host: ArgumentsHost,
  ): void {
    const statusCode = exception.getStatus();
    const response = host.switchToHttp().getResponse();
    response.status(statusCode).json(
      statusCode === 401
        ? {
            statusCode: 401,
            code: 'upload_authentication_required',
            message: 'Authentication is required',
          }
        : {
            statusCode: 403,
            code: 'upload_admin_required',
            message: 'Administrator access is required',
          },
    );
  }
}

type SessionRouteService = {
  getUploadStatus?: (uploadId: string, adminId: string) => unknown;
  abandonUpload?: (uploadId: string, adminId: string) => unknown;
};

@ApiTags('images')
@ApiBearerAuth()
@Controller('images')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ImagesController {
  constructor(
    private readonly imagesService: ImagesService,
    private readonly policyService: ImageUploadPolicyService,
    private readonly rateLimit: ImageUploadRateLimitService,
    @Optional()
    @Inject(IMAGE_UPLOAD_CONTROLLER_RUNTIME)
    private readonly runtime: { presignEnabled: boolean } = {
      presignEnabled: true,
    },
  ) {}

  static uploadError(
    statusCode: UploadErrorResponse['statusCode'],
    code: UploadErrorResponse['code'],
    message: string,
    extras: Readonly<Record<string, string>> = {},
  ): HttpException {
    return new HttpException(
      { statusCode, code, message, ...extras },
      statusCode,
    );
  }

  private adminId(request: AdminRequest): string {
    const adminId =
      request.user?.userId ?? request.user?.sub ?? request.user?.id;
    if (!adminId) {
      throw ImagesController.uploadError(
        401,
        'upload_authentication_required',
        'Authentication is required',
      );
    }
    return adminId;
  }

  private async admit(
    request: AdminRequest,
    routeScope: ImageUploadRouteScope,
  ): Promise<string> {
    const adminId = this.adminId(request);
    await this.rateLimit.admit(adminId, routeScope);
    return adminId;
  }

  private async invokeBusiness<T>(
    work: () => Promise<T> | T,
    badRequestCode: 'upload_invalid_request' | 'upload_capacity_exceeded',
  ): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof HttpException) {
        const response = error.getResponse();
        if (
          typeof response === 'object' &&
          response !== null &&
          typeof (response as { code?: unknown }).code === 'string'
        ) {
          throw error;
        }
      }
      if (error instanceof NotFoundException) {
        throw ImagesController.uploadError(
          404,
          'upload_not_found',
          'Upload resource was not found',
        );
      }
      if (error instanceof ConflictException) {
        throw ImagesController.uploadError(
          409,
          'upload_request_conflict',
          'Upload request conflicts with existing state',
        );
      }
      if (error instanceof BadRequestException) {
        throw ImagesController.uploadError(
          badRequestCode === 'upload_capacity_exceeded' ? 409 : 400,
          badRequestCode,
          badRequestCode === 'upload_capacity_exceeded'
            ? 'Album upload capacity is exhausted'
            : 'Invalid upload request',
        );
      }
      throw error;
    }
  }

  private validateDto<T extends object>(value: unknown, dto: new () => T): T {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw ImagesController.uploadError(
        400,
        'upload_invalid_request',
        'Invalid upload request',
      );
    }
    const instance = plainToInstance(dto, value);
    const errors = validateSync(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    });
    if (errors.length > 0) {
      throw ImagesController.uploadError(
        400,
        'upload_invalid_request',
        'Invalid upload request',
      );
    }
    return instance;
  }

  @Get('upload-policy')
  @UseFilters(UploadRouteAuthExceptionFilter)
  @Roles('admin')
  getUploadPolicy() {
    return this.policyService.getPolicy();
  }

  @Post('upload-url')
  @UseFilters(UploadRouteAuthExceptionFilter)
  @HttpCode(200)
  @Roles('admin')
  @ApiOperation({ summary: 'Get a current-policy upload URL (Admin only)' })
  async getUploadUrl(@Body() body: unknown, @Req() request: AdminRequest) {
    const presignEnabled =
      process.env.IMAGE_UPLOAD_PRESIGN_ENABLED === 'false'
        ? false
        : this.runtime.presignEnabled;
    if (!presignEnabled) {
      throw ImagesController.uploadError(
        503,
        'upload_presign_disabled',
        'New upload URLs are temporarily disabled',
      );
    }

    const adminId = await this.admit(request, 'upload_url');

    const record =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    if (
      record.clientRequestId === undefined ||
      record.processedSha256 === undefined ||
      record.policyVersion === undefined ||
      record.policyVersion !== this.policyService.policyVersion
    ) {
      throw ImagesController.uploadError(
        409,
        'policy_refresh_required',
        'Refresh the upload policy before retrying',
      );
    }

    const upload = this.validateDto(body, UploadRequestDto);
    if (
      upload.filename !== upload.filename.normalize('NFC') ||
      upload.filename !== upload.filename.trim() ||
      upload.filename.includes('/') ||
      upload.filename.includes('\\')
    ) {
      throw ImagesController.uploadError(
        400,
        'upload_invalid_request',
        'Invalid upload request',
      );
    }
    return this.invokeBusiness(
      () => this.imagesService.getUploadUrl(upload, adminId),
      'upload_capacity_exceeded',
    );
  }

  @Post('confirm-upload')
  @UseFilters(UploadRouteAuthExceptionFilter)
  @HttpCode(200)
  @Roles('admin')
  async confirmUpload(@Body() body: unknown, @Req() request: AdminRequest) {
    await this.admit(request, 'confirm_upload');
    const confirm = this.validateDto(body, UploadConfirmDto);
    return this.invokeBusiness(
      () => this.imagesService.confirmUpload(confirm),
      'upload_invalid_request',
    );
  }

  @Get('upload-sessions/:uploadId')
  @UseFilters(UploadRouteAuthExceptionFilter)
  @Roles('admin')
  async getUploadStatus(
    @Param('uploadId') uploadId: string,
    @Req() request: AdminRequest,
  ) {
    const adminId = await this.admit(request, 'upload_status');
    const routeUploadId =
      typeof uploadId === 'string'
        ? uploadId
        : (uploadId as unknown as { uploadId: string }).uploadId;
    const dto = this.validateDto(
      { uploadId: routeUploadId },
      UploadSessionStatusDto,
    );
    const service = this.imagesService as ImagesService & SessionRouteService;
    if (!service.getUploadStatus) {
      throw ImagesController.uploadError(
        404,
        'upload_not_found',
        'Upload session was not found',
      );
    }
    return service.getUploadStatus(dto.uploadId, adminId);
  }

  @Post('upload-sessions/:uploadId/abandon')
  @UseFilters(UploadRouteAuthExceptionFilter)
  @HttpCode(200)
  @Roles('admin')
  async abandonUpload(
    @Param('uploadId') uploadId: string,
    @Req() request: AdminRequest,
  ) {
    const adminId = await this.admit(request, 'abandon_upload');
    const routeUploadId =
      typeof uploadId === 'string'
        ? uploadId
        : (uploadId as unknown as { uploadId: string }).uploadId;
    const dto = this.validateDto(
      { uploadId: routeUploadId },
      UploadSessionAbandonDto,
    );
    const service = this.imagesService as ImagesService & SessionRouteService;
    if (!service.abandonUpload) {
      throw ImagesController.uploadError(
        404,
        'upload_not_found',
        'Upload session was not found',
      );
    }
    return service.abandonUpload(dto.uploadId, adminId);
  }

  @Get('album/:albumId')
  @Public()
  findByAlbum(@Param('albumId') albumId: string) {
    return this.imagesService.findByAlbum(albumId);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() updateImageDto: UpdateImageDto) {
    return this.imagesService.update(id, updateImageDto);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.imagesService.remove(id);
  }

  @Patch('album/:albumId/reorder')
  @Roles('admin')
  reorder(
    @Param('albumId') albumId: string,
    @Body() reorderDto: ReorderImagesDto,
  ) {
    return this.imagesService.reorder(albumId, reorderDto);
  }
}
