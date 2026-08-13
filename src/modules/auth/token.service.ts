import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import { IAuthConfig } from '@common/config';
import { MILLISECONDS_PER_DAY, MILLISECONDS_PER_SECOND, REFRESH_TOKEN_BYTES } from './auth.constants';

/**
 * The claims carried by an access token.
 *
 * @property sub - The account the token authenticates, as a string.
 * @property exp - Expiry, in seconds since the epoch. Set by the signer.
 */
export interface IAccessTokenPayload {
  sub: string;
  exp?: number;
}

/**
 * A freshly signed access token.
 *
 * @property accessToken - The signed JWT.
 * @property expiresIn - Seconds until it expires, so a client can refresh before it does.
 */
export interface IIssuedAccessToken {
  accessToken: string;
  expiresIn: number;
}

/**
 * A freshly minted refresh token.
 *
 * @property token - The value handed to the client. Never stored.
 * @property tokenHash - What is stored, and what refresh looks up by.
 * @property expiresAt - When it stops working.
 */
export interface IIssuedRefreshToken {
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

/**
 * Mints and hashes tokens.
 *
 * @remarks
 * The two token types are deliberately different things. The access token is a
 * signed JWT: self contained, short lived, verified with the public key without
 * touching the database. The refresh token is opaque random data with no claims
 * and no signature: it is long lived, so it must be revocable, and revocation
 * needs a database record anyway.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Signs an access token for an account.
   *
   * @remarks
   * `expiresIn` is read back from the signed token rather than recomputed from
   * configuration, so the number the client is given cannot drift from the claim
   * the token actually carries.
   *
   * @param userId - The account to authenticate.
   * @returns The token and how long it is good for.
   */
  async issueAccessToken(userId: Types.ObjectId): Promise<IIssuedAccessToken> {
    const accessToken = await this.jwtService.signAsync({ sub: userId.toString() });
    const decoded = this.jwtService.decode<IAccessTokenPayload | null>(accessToken);
    const expirySeconds = decoded?.exp ?? 0;
    const nowSeconds = Math.floor(Date.now() / MILLISECONDS_PER_SECOND);

    return { accessToken, expiresIn: Math.max(expirySeconds - nowSeconds, 0) };
  }

  /**
   * Mints a refresh token.
   *
   * @returns The token to hand over, its hash to store, and its expiry.
   */
  createRefreshToken(): IIssuedRefreshToken {
    const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const { refreshTtlDays } = this.configService.getOrThrow<IAuthConfig>('auth');

    return {
      token,
      tokenHash: this.hashRefreshToken(token),
      expiresAt: new Date(Date.now() + refreshTtlDays * MILLISECONDS_PER_DAY),
    };
  }

  /**
   * Hashes a refresh token for storage and lookup.
   *
   * @remarks
   * SHA-256, not Argon2. The input is 256 bits of randomness, so there is no
   * dictionary to attack and no reason to make verification slow. It also has to
   * be deterministic, because refresh looks the token up by its hash.
   *
   * @param token - The refresh token as presented.
   * @returns The hex encoded hash.
   */
  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
