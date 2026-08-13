import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { IAuthConfig } from '@common/config';
import { AuditLogModule } from '@modules/audit-log';
import { UsersModule } from '@modules/users';
import { TOKEN_ISSUER } from './auth.constants';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PasswordService } from './password.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { RefreshToken, RefreshTokenSchema } from './schemas/refresh-token.schema';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenService } from './token.service';

/**
 * Sessions, credentials, and the guard that protects every other route.
 *
 * @remarks
 * Registers {@link JwtAuthGuard} as a global guard, so authentication is on by
 * default across the application and a route has to opt out with `@Public`. The
 * alternative, protecting each route individually, fails silently the first time
 * someone forgets.
 *
 * The JWT module is configured with a key pair rather than a shared secret: the
 * private key signs and the public key verifies, so verification can be delegated
 * without delegating the ability to mint tokens.
 */
@Module({
  imports: [
    AuditLogModule,
    UsersModule,
    PassportModule,
    MongooseModule.forFeature([{ name: RefreshToken.name, schema: RefreshTokenSchema }]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const auth = configService.getOrThrow<IAuthConfig>('auth');

        return {
          privateKey: auth.privateKey,
          publicKey: auth.publicKey,
          signOptions: { algorithm: auth.algorithm, expiresIn: auth.accessTtlSeconds, issuer: TOKEN_ISSUER },
          verifyOptions: { algorithms: [auth.algorithm], issuer: TOKEN_ISSUER },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    RefreshTokensRepository,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  // AuthService is exported for the seeders, which create the demo account
  // through the same signup path a person uses rather than writing a user row
  // directly. Nothing in the HTTP graph imports it.
  exports: [TokenService, AuthService],
})
export class AuthModule {}
