import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { THROTTLER_LIMIT } from '@nestjs/throttler/dist/throttler.constants';
import { AlbumsController } from '../albums/albums.controller';
import { ApiThrottlerGuard } from './api-throttler.guard';

class TestableApiThrottlerGuard extends ApiThrottlerGuard {
  skip(context: ExecutionContext): Promise<boolean> {
    return this.shouldSkip(context);
  }
}

function routeContext(
  controller: typeof AlbumsController,
  methodName: keyof AlbumsController,
  method: string,
): ExecutionContext {
  const handler = controller.prototype[methodName];
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ method }) }),
  } as unknown as ExecutionContext;
}

describe('ApiThrottlerGuard', () => {
  const guard = new TestableApiThrottlerGuard(
    [],
    {} as never,
    new Reflector(),
  );

  it.each([
    ['public GET', 'findAll', 'GET', true],
    ['admin GET', 'findAdminAll', 'GET', true],
    ['admin POST', 'create', 'POST', true],
    ['public POST view counter', 'recordView', 'POST', false],
  ])('%s has expected skip decision', async (_name, methodName, method, expected) => {
    await expect(
      guard.skip(
        routeContext(
          AlbumsController,
          methodName as keyof AlbumsController,
          method,
        ),
      ),
    ).resolves.toBe(expected);
  });

  it('keeps the public album view counter at 30 requests per minute', () => {
    expect(
      Reflect.getMetadata(
        `${THROTTLER_LIMIT}default`,
        AlbumsController.prototype.recordView,
      ),
    ).toBe(30);
  });
});
