import { AuditInterceptor } from './audit.interceptor';
import { of, throwError, lastValueFrom } from 'rxjs';

describe('AuditInterceptor', () => {
  function context() {
    const request: any = {
      method: 'PATCH',
      path: '/albums/1',
      route: { path: '/albums/:id' },
      baseUrl: '/albums',
      params: { id: '1' },
      headers: { 'x-request-id': 'req-1' },
      user: { sub: 'user-1' },
      res: { setHeader: jest.fn() },
    };
    return {
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
      switchToHttp: () => ({ getRequest: () => request }),
      request,
    } as any;
  }

  it('emits correlated success events only for admin metadata', async () => {
    const audit = { emit: jest.fn() };
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['admin']) };
    const interceptor = new AuditInterceptor(reflector as any, audit as any);
    await lastValueFrom(interceptor.intercept(context(), { handle: () => of({ ok: true }) } as any));

    expect(audit.emit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'patch /albums/:id',
      actorId: 'user-1',
      requestId: 'req-1',
      resourceId: '1',
      result: 'success',
    }));
  });

  it('emits failed events and rethrows handler errors', async () => {
    const audit = { emit: jest.fn() };
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['admin']) };
    const interceptor = new AuditInterceptor(reflector as any, audit as any);
    await expect(lastValueFrom(interceptor.intercept(context(), { handle: () => throwError(() => new Error('boom')) } as any))).rejects.toThrow('boom');
    expect(audit.emit).toHaveBeenCalledWith(expect.objectContaining({ result: 'failed', requestId: 'req-1' }));
  });

  it('does not audit public routes', async () => {
    const audit = { emit: jest.fn() };
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) };
    const interceptor = new AuditInterceptor(reflector as any, audit as any);
    await lastValueFrom(interceptor.intercept(context(), { handle: () => of({ ok: true }) } as any));
    expect(audit.emit).not.toHaveBeenCalled();
  });
});
