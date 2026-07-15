import { randomUUID } from 'crypto';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { catchError, tap, throwError } from 'rxjs';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { AuditService } from './audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles?.includes('admin')) return next.handle();

    const request = context.switchToHttp().getRequest<any>();
    const requestId = ensureRequestId(request);
    const action = `${request.method.toLowerCase()} ${request.route?.path ?? request.path ?? 'unknown'}`;
    const actorId = request.user?.sub ?? request.user?.id;
    const resourceId = request.params?.id ?? request.params?.albumId ?? request.params?.imageId;

    return next.handle().pipe(
      tap(() => {
        this.audit.emit({
          action,
          actorId,
          requestId,
          resourceType: request.baseUrl?.replace(/^\//, '') || undefined,
          resourceId,
          result: 'success',
        });
      }),
      catchError((error) => {
        this.audit.emit({
          action,
          actorId,
          requestId,
          resourceType: request.baseUrl?.replace(/^\//, '') || undefined,
          resourceId,
          result: 'failed',
          metadata: { status: error?.status ?? error?.statusCode ?? 500 },
        });
        return throwError(() => error);
      }),
    );
  }
}

export function ensureRequestId(request: any): string {
  const existing = request.headers?.['x-request-id'];
  const value = Array.isArray(existing) ? existing[0] : existing;
  const requestId = typeof value === 'string' && value.length <= 128 ? value : randomUUID();
  request.requestId = requestId;
  if (request.res?.setHeader) request.res.setHeader('x-request-id', requestId);
  return requestId;
}
