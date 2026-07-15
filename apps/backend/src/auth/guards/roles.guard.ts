import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuditService } from '../../audit/audit.service';
import { ensureRequestId } from '../../audit/audit.interceptor';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Optional() private readonly audit?: AuditService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) return true;

    const request = context.switchToHttp().getRequest<any>();
    const { user } = request;
    if (!user) {
      this.audit?.emit({
        action: `${request.method?.toLowerCase() ?? 'unknown'} ${request.route?.path ?? request.path ?? 'unknown'}`,
        result: 'denied',
        requestId: ensureRequestId(request),
      });
      throw new ForbiddenException('User not authenticated');
    }

    const hasRole = requiredRoles.some((role) => user.role === role);
    if (!hasRole) {
      this.audit.emit({
        action: `${request.method?.toLowerCase() ?? 'unknown'} ${request.route?.path ?? request.path ?? 'unknown'}`,
        actorId: user.sub ?? user.id,
        result: 'denied',
        requestId: ensureRequestId(request),
      });
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
