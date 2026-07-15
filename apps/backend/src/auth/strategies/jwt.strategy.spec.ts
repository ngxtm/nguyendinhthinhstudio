import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { JwtStrategy } from './jwt.strategy';
import type { JwtVerifier, VerifiedUser } from '../jwt-verifier';

function request(authorization?: string): Request {
  return {
    headers: authorization ? { authorization } : {},
  } as Request;
}

describe('JwtStrategy', () => {
  it('authenticates a verified bearer token', async () => {
    const user: VerifiedUser = {
      userId: '00000000-0000-4000-8000-000000000001',
      role: 'admin',
    };
    const verifier = {
      verify: jest.fn(async () => user),
    } as unknown as JwtVerifier;
    const strategy = new JwtStrategy(verifier);
    const success = jest.fn();
    Object.assign(strategy, { success });

    strategy.authenticate(request('Bearer signed-token'));
    await Promise.resolve();

    expect(verifier.verify).toHaveBeenCalledWith('signed-token');
    expect(success).toHaveBeenCalledWith(user);
  });

  it('fails authentication when the verifier rejects the selected validator', async () => {
    const verifier = {
      verify: jest.fn(async () => {
        throw new UnauthorizedException('Invalid token signature');
      }),
    } as unknown as JwtVerifier;
    const strategy = new JwtStrategy(verifier);
    const fail = jest.fn();
    Object.assign(strategy, { fail });

    strategy.authenticate(request('Bearer invalid-token'));
    await Promise.resolve();
    await Promise.resolve();

    expect(fail).toHaveBeenCalledWith(expect.any(UnauthorizedException), 401);
  });

  it('rejects a request without a bearer token', () => {
    const verifier = {
      verify: jest.fn(),
    } as unknown as JwtVerifier;
    const strategy = new JwtStrategy(verifier);
    const fail = jest.fn();
    Object.assign(strategy, { fail });

    strategy.authenticate(request());

    expect(verifier.verify).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledWith(expect.any(UnauthorizedException), 401);
  });
});
