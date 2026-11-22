import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, errors as joseErrors, jwtVerify } from 'jose';
import { AppError, unauthenticated } from '../errors.js';

/** 256 random bits, base64url (43 characters). Used for refresh tokens and share links. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86_400 };

/** "15m" -> 900. */
export function parseDuration(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) throw new Error(`Invalid duration "${value}"`);
  return Number(match[1]) * UNIT_SECONDS[match[2]!]!;
}

export interface AccessClaims {
  userId: string;
  /** Session family id: identifies the login the token belongs to. */
  sessionFamilyId: string;
}

export class AccessTokens {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    readonly ttlSec: number,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  async sign(claims: AccessClaims): Promise<{ token: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + this.ttlSec * 1000);
    const token = await new SignJWT({ sid: claims.sessionFamilyId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.userId)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.key);
    return { token, expiresAt };
  }

  async verify(token: string): Promise<AccessClaims> {
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
        throw unauthenticated('UNAUTHENTICATED', 'Invalid access token.');
      }
      return { userId: payload.sub, sessionFamilyId: payload.sid };
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err instanceof joseErrors.JWTExpired) {
        throw unauthenticated('TOKEN_EXPIRED', 'Access token expired.');
      }
      throw unauthenticated('UNAUTHENTICATED', 'Invalid access token.');
    }
  }
}
