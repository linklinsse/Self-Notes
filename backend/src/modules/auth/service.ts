import { randomUUID } from 'node:crypto';
import type { PrismaClient, Session } from '@prisma/client';
import type { Db } from '../../db.js';
import { unauthenticated } from '../../errors.js';
import { randomToken, sha256 } from '../../lib/tokens.js';

/** A replaced refresh token presented again within this delay is treated as a lost response, not theft. */
export const REUSE_GRACE_MS = 2 * 60 * 1000;

export interface SessionMeta {
  userAgent?: string;
}

export interface IssuedRefresh {
  token: string;
  session: Session;
}

const invalidRefresh = () => unauthenticated('INVALID_REFRESH_TOKEN', 'Session expired, please sign in again.');

function clientOf(userAgent?: string): string {
  return userAgent && /Android/i.test(userAgent) ? 'android' : 'web';
}

export async function createSession(
  db: Db,
  ttlSec: number,
  userId: string,
  familyId: string,
  meta: SessionMeta,
): Promise<IssuedRefresh> {
  const token = randomToken();
  const session = await db.session.create({
    data: {
      userId,
      familyId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + ttlSec * 1000),
      client: clientOf(meta.userAgent),
      userAgent: meta.userAgent?.slice(0, 500),
    },
  });
  return { token, session };
}

/** New login = new session family. */
export function startSession(db: Db, ttlSec: number, userId: string, meta: SessionMeta) {
  return createSession(db, ttlSec, userId, randomUUID(), meta);
}

class RotationRace extends Error {}

/**
 * Exchange a refresh token for a new one (rotation, sliding expiry).
 * - Reusing an already replaced token revokes the whole family (theft detection),
 *   except within REUSE_GRACE_MS when the replacement was never used (lost response).
 */
export async function rotateRefreshToken(
  prisma: PrismaClient,
  ttlSec: number,
  token: string,
  meta: SessionMeta,
  retry = true,
): Promise<IssuedRefresh> {
  const now = new Date();
  const current = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { replacedBy: true },
  });
  if (!current || current.revokedAt || current.expiresAt <= now) throw invalidRefresh();

  if (current.replacedById) {
    const successor = current.replacedBy;
    const lostResponse =
      successor !== null &&
      successor.revokedAt === null &&
      successor.replacedById === null &&
      now.getTime() - successor.createdAt.getTime() < REUSE_GRACE_MS;
    if (!lostResponse) {
      await prisma.session.updateMany({
        where: { familyId: current.familyId, revokedAt: null },
        data: { revokedAt: now },
      });
      throw invalidRefresh();
    }
    return prisma.$transaction(async (tx) => {
      const fresh = await createSession(tx, ttlSec, current.userId, current.familyId, meta);
      const moved = await tx.session.updateMany({
        where: { id: current.id, replacedById: successor.id },
        data: { replacedById: fresh.session.id },
      });
      if (moved.count !== 1) throw invalidRefresh();
      await tx.session.update({ where: { id: successor.id }, data: { revokedAt: now } });
      return fresh;
    });
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const fresh = await createSession(tx, ttlSec, current.userId, current.familyId, meta);
      const marked = await tx.session.updateMany({
        where: { id: current.id, replacedById: null, revokedAt: null },
        data: { replacedById: fresh.session.id, lastUsedAt: now },
      });
      if (marked.count !== 1) throw new RotationRace();
      return fresh;
    });
  } catch (err) {
    // Another request rotated the same token at the same time: handle it as a reuse.
    if (err instanceof RotationRace && retry) return rotateRefreshToken(prisma, ttlSec, token, meta, false);
    throw err;
  }
}

/** Logout: revoke every token of the session family the refresh token belongs to. */
export async function revokeByRefreshToken(db: Db, token: string): Promise<void> {
  const session = await db.session.findUnique({ where: { tokenHash: sha256(token) } });
  if (!session) return;
  await db.session.updateMany({
    where: { familyId: session.familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
