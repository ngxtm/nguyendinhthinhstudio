import { Injectable, ExecutionContext, UnauthorizedException, Optional } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuditService } from '../../audit/audit.service';
import { ensureRequestId } from '../../audit/audit.interceptor';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    @Optional() private readonly audit?: AuditService,
  ) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest(error: any, user: any, info: any, context: ExecutionContext) {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if ((error || !user) && requiredRoles?.includes('admin')) {
      const request = context.switchToHttp().getRequest<any>();
      this.audit?.emit({
        action: `${request.method?.toLowerCase() ?? 'unknown'} ${request.route?.path ?? request.path ?? 'unknown'}`,
        result: 'denied',
        requestId: ensureRequestId(request),
        metadata: { reason: info?.message ?? error?.message ?? 'authentication_failed' },
      });
    }
    if (error || !user) throw error ?? new UnauthorizedException();
    return user;
  }
}
