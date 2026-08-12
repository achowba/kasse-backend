import { ApiProperty } from '@nestjs/swagger';
import { RefreshTokenDocument } from '../schemas/refresh-token.schema';

/**
 * One active session.
 *
 * @remarks
 * Identified by when it started and when it was last used, not by a device or
 * browser label. Deriving such a label means storing the user agent, and the
 * logging convention forbids persisting personal identifiers. Timestamps are
 * enough to recognise a session a user does not expect.
 *
 * @property id - Identifier, used to revoke this session.
 * @property createdAt - When the session was established, by login or by signup.
 * @property lastUsedAt - When its refresh token was last exchanged. Null if it never has been.
 * @property expiresAt - When the session ends on its own.
 */
export class SessionResponseDTO {
  @ApiProperty({ description: 'Identifier, used to revoke this session.', example: '65f1c2d3e4b5a6c7d8e9f0a1' })
  id!: string;

  @ApiProperty({ description: 'When the session was established.', example: '2026-01-15T10:04:11.212Z', format: 'date-time' })
  createdAt!: string;

  @ApiProperty({
    description: 'When this session last refreshed. Null if it never has.',
    example: '2026-01-16T08:12:00.000Z',
    format: 'date-time',
    nullable: true,
  })
  lastUsedAt!: string | null;

  @ApiProperty({ description: 'When the session expires.', example: '2026-01-22T10:04:11.212Z', format: 'date-time' })
  expiresAt!: string;

  /**
   * Maps a stored refresh token onto the session shape.
   *
   * @remarks
   * The token hash is never exposed. It is a credential equivalent, and a session
   * list is a read only view.
   *
   * @param token - The stored refresh token record.
   * @returns The session, as a client sees it.
   */
  static fromDocument(token: RefreshTokenDocument): SessionResponseDTO {
    return {
      id: token._id.toString(),
      createdAt: token.createdAt.toISOString(),
      lastUsedAt: token.lastUsedAt === null ? null : token.lastUsedAt.toISOString(),
      expiresAt: token.expiresAt.toISOString(),
    };
  }
}
