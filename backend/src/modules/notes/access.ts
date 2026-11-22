/**
 * The ONLY place that decides who can do what on a note (docs/architecture.md §4,
 * permission matrix in docs/specification.md §5.3).
 */
import type { NoteRole, Prisma } from '@prisma/client';
import type { Db } from '../../db.js';
import { forbidden, notFound } from '../../errors.js';

const RANK: Record<NoteRole, number> = { viewer: 1, editor: 2, owner: 3 };

export function hasRole(role: NoteRole, min: NoteRole): boolean {
  return RANK[role] >= RANK[min];
}

/**
 * NOTE-17: only the owner may lock a note with a password or remove the password. Editors (who
 * know the password) edit a locked note's content; share links never change the lock.
 */
export function mayChangeLock(role: NoteRole | 'link'): boolean {
  return role === 'owner';
}

/** Share links that are neither revoked nor expired. */
export function activeLinkWhere(): Prisma.ShareLinkWhereInput {
  return { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };
}

/**
 * Role of a user on a note, or an error:
 * 404 when the user has no access (never reveal that the note exists), 403 when the role is too low.
 */
export async function requireMemberRole(
  db: Db,
  noteId: string,
  userId: string,
  min: NoteRole,
): Promise<NoteRole> {
  const member = await db.noteMember.findUnique({
    where: { noteId_userId: { noteId, userId } },
    select: { role: true },
  });
  if (!member) throw notFound('Note not found.');
  if (!hasRole(member.role, min)) throw forbidden();
  return member.role;
}

/** Resolve a share link token. Unknown, revoked and expired tokens all give the same 404. */
export async function requireLink(
  db: Db,
  token: string,
  min: NoteRole,
): Promise<{ id: string; noteId: string; role: NoteRole }> {
  const link = await db.shareLink.findFirst({
    where: { token, ...activeLinkWhere() },
    select: { id: true, noteId: true, role: true },
  });
  if (!link) throw notFound('Link not found.');
  if (!hasRole(link.role, min)) throw forbidden();
  return link;
}
