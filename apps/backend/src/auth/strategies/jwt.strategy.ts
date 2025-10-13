import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string; // user id
  email?: string;
  role?: string;
  aud: string;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    const secret = configService.get<string>('SUPABASE_JWT_SECRET') || 'temporary-test-secret-key-change-in-production';
    
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret,
      ignoreExpiration: false,
    });
    
    if (!configService.get<string>('SUPABASE_JWT_SECRET')) {
      console.warn('⚠️  WARNING: Using temporary JWT secret. Set SUPABASE_JWT_SECRET in .env for production!');
    }
  }

  async validate(payload: JwtPayload) {
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }

    // Return user info to be attached to request object
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role || 'user',
    };
  }
}

