import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import passport from 'passport';
import type { Request } from 'express';
import { JWT_VERIFIER } from '../jwt-verifier.provider';
import type { JwtVerifier } from '../jwt-verifier.provider';

const PassportBaseStrategy =
  passport.Strategy as unknown as new () => passport.Strategy;

export interface JwtPayload {
  sub: string;
  email?: string;
  role?: string;
  user_role?: string;
  aud: string | string[];
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(PassportBaseStrategy, 'jwt') {
  constructor(
    @Inject(JWT_VERIFIER)
    private readonly verifier: JwtVerifier,
  ) {
    super();
  }

  validate(user: unknown): unknown {
    return user;
  }

  authenticate(request: Request): void {
    const callbacks = this as unknown as {
      success: (user: unknown) => void;
      fail: (challenge: unknown, status?: number) => void;
    };
    const authorization = request.headers.authorization;
    const match =
      typeof authorization === 'string'
        ? /^Bearer ([^\s]+)$/i.exec(authorization)
        : null;

    if (!match) {
      callbacks.fail(new UnauthorizedException('Missing bearer token'), 401);
      return;
    }

    this.verifier.verify(match[1]).then(
      (user) => callbacks.success(user),
      (error: unknown) =>
        callbacks.fail(
          error instanceof UnauthorizedException
            ? error
            : new UnauthorizedException('Invalid bearer token'),
          401,
        ),
    );
  }
}
