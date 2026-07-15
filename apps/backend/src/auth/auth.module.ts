import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategies/jwt.strategy';
import { createJwtVerifier, JWT_VERIFIER } from './jwt-verifier.provider';
import { AuditService } from '../audit/audit.service';

@Module({
  imports: [ConfigModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [
    {
      provide: JWT_VERIFIER,
      inject: [ConfigService],
      useFactory: createJwtVerifier,
    },
    JwtStrategy,
    AuditService,
  ],
  exports: [PassportModule, JwtStrategy, AuditService],
})
export class AuthModule {}
