import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Types } from 'mongoose';
import { ExtractJwt, Strategy, StrategyOptionsWithoutRequest } from 'passport-jwt';
import { IAuthenticatedUser } from '@common/auth';
import { IAuthConfig } from '@common/config';
import { TOKEN_ISSUER } from '../auth.constants';
import { IAccessTokenPayload } from '../token.service';

/**
 * Verifies the bearer access token on a request.
 *
 * @remarks
 * Verification uses the public key. That is the point of signing asymmetrically:
 * this code can confirm a token is genuine while holding nothing that could mint
 * one, so the same key can be handed to any other service that needs to
 * authenticate callers.
 *
 * The issuer is checked as well as the signature, so a token signed by a
 * different service that happens to share the key pair is rejected.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const auth = configService.getOrThrow<IAuthConfig>('auth');

    const options: StrategyOptionsWithoutRequest = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: auth.publicKey,
      algorithms: [auth.algorithm],
      issuer: TOKEN_ISSUER,
    };

    super(options);
  }

  /**
   * Turns verified claims into the caller attached to the request.
   *
   * @remarks
   * Only reached once the signature, expiry, and issuer have all passed. The
   * subject is still checked for shape: a token signed with a valid key but
   * carrying a malformed subject would otherwise become a database query with a
   * bad identifier.
   *
   * Nothing beyond the account id is taken from the token. Settings are read from
   * the database per request, so a token issued before a change cannot carry
   * stale values.
   *
   * @param payload - The verified claims.
   * @returns The authenticated caller.
   * @throws UnauthorizedException When the subject is not a valid identifier.
   */
  validate(payload: IAccessTokenPayload): IAuthenticatedUser {
    if (!Types.ObjectId.isValid(payload.sub)) {
      throw new UnauthorizedException('Malformed access token subject.');
    }

    return { userId: new Types.ObjectId(payload.sub), email: payload.email };
  }
}
