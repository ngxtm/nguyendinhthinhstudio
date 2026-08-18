import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

@Injectable()
export class ApiThrottlerGuard extends ThrottlerGuard {
  protected override async shouldSkip(
    context: ExecutionContext,
  ): Promise<boolean> {
    const handler = context.getHandler();
    const classRef = context.getClass();
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      handler,
      classRef,
    ]);

    if (roles?.includes('admin')) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      handler,
      classRef,
    ]);
    const request = context.switchToHttp().getRequest<{ method?: string }>();

    return isPublic === true && request.method?.toUpperCase() === 'GET';
  }
}
