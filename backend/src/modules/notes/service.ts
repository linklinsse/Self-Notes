import type { NoteRole, Prisma, PrismaClient } from '@prisma/client';
import type { Db } from '../../db.js';
import { AppError, badRequest, forbidden, notFound } from '../../errors.js';
import { isEncryptedContent } from '../../lib/encrypted-content.js';
import { plainPreview, taskProgress, textToList, toggleTaskItem } from '../../lib/tasklist.js';
import { activeLinkWhere } from './access.js';
import type {
  CreateNoteInput,
  ListQuery,
  NoteDto,
  NoteSummaryDto,
  ToggleItemInput,
  UpdateNoteInput,
} from './schemas.js';

export const MAX_CONTENT_BYTES = 1_000_000;

export function assertContentSize(content: string | undefined): void {
  if (content !== undefined && Buffer.byteLength(content, 'utf8') > MAX_CONTENT_BYTES) {
    throw new AppError(413, 'CONTENT_TOO_LARGE', 'Note content is limited to 1 MB.');
  }
}

/** Relations needed to describe a note from one user's point of view. */
function noteInclude(userId: string) {
  return {
    categories: {
      where: { category: { userId } },
      include: { category: true },
      orderBy: [{ category: { position: 'asc' } }, { category: { name: 'asc' } }],
    },
    members: { where: { role: 'owner' }, select: { user: { select: { id: true, username: true } } } },
    updatedBy: { select: { id: true, username: true } },
    shareLinks: { where: activeLinkWhere(), select: { id: true }, take: 1 },
    _count: { select: { members: true } },
  } satisfies Prisma.NoteInclude;
}

type NoteWithRelations = Prisma.NoteGetPayload<{ include: ReturnType<typeof noteInclude> }>;
type MemberView = { role: NoteRole; pinned: boolean };

function baseView(note: NoteWithRelations, member: MemberView) {
  const owner = note.members[0]?.user;
  return {
    id: note.id,
    title: note.title,
    type: note.type,
    locked: note.locked,
    version: note.version,
    role: member.role,
    pinned: member.pinned,
    categories: note.categories.map(({ category }) => ({
      id: category.id,
      name: category.name,
      color: category.color,
    })),
    owner: owner ?? { id: '', username: '' },
    shared: note._count.members > 1 || note.shareLinks.length > 0,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    updatedBy: note.updatedBy,
  };
}

function toNote(note: NoteWithRelations, member: MemberView): NoteDto {
  return { ...baseView(note, member), content: note.content };
}

function toSummary(note: NoteWithRelations, member: MemberView): NoteSummaryDto {
  return {
    ...baseView(note, member),
    // NOTE-17: nothing is derived from encrypted content: only the title shows.
    preview: note.locked ? '' : plainPreview(note.content, note.type),
    items: note.type === 'list' && !note.locked ? taskProgress(note.content) : null,
  };
}

/** The note as seen by a member. 404 for non-members. */
export async function getNote(db: Db, noteId: string, userId: string): Promise<NoteDto> {
  const member = await db.noteMember.findUnique({
    where: { noteId_userId: { noteId, userId } },
    include: { note: { include: noteInclude(userId) } },
  });
  if (!member) throw notFound('Note not found.');
  return toNote(member.note, member);
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const offset = Number(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (!Number.isInteger(offset) || offset < 0) throw badRequest('Invalid cursor.', 'VALIDATION_ERROR');
  return offset;
}

const encodeCursor = (offset: number) => Buffer.from(String(offset), 'utf8').toString('base64url');

/** NOTE-9 / NOTE-10: the caller's notes, pinned first then most recently updated. */
/** NOTE-9: the orders offered by the grid. noteId last keeps pages stable. */
const ORDER_BY = {
  favorites: [{ pinned: 'desc' }, { note: { updatedAt: 'desc' } }, { noteId: 'asc' }],
  updated: [{ note: { updatedAt: 'desc' } }, { noteId: 'asc' }],
  title: [{ note: { sortTitle: { sort: 'asc', nulls: 'last' } } }, { note: { updatedAt: 'desc' } }, { noteId: 'asc' }],
} satisfies Record<ListQuery['sort'], Prisma.NoteMemberOrderByWithRelationInput[]>;

export async function listNotes(db: Db, userId: string, query: ListQuery) {
  const offset = decodeCursor(query.cursor);
  const role =
    query.scope === 'mine'
      ? ('owner' as const)
      : query.scope === 'shared'
        ? { in: ['editor', 'viewer'] as NoteRole[] }
        : undefined;
  const noteWhere: Prisma.NoteWhereInput = {
    ...(query.type ? { type: query.type } : {}),
    ...(query.q
      ? {
          OR: [
            { title: { contains: query.q, mode: 'insensitive' } },
            // Encrypted content is never searched (NOTE-17).
            { locked: false, content: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(query.category.length > 0
      ? { categories: { some: { categoryId: { in: query.category }, category: { userId } } } }
      : {}),
  };
  const rows = await db.noteMember.findMany({
    where: { userId, ...(role ? { role } : {}), note: noteWhere },
    orderBy: ORDER_BY[query.sort],
    skip: offset,
    take: query.limit + 1,
    include: { note: { include: noteInclude(userId) } },
  });
  return {
    items: rows.slice(0, query.limit).map((row) => toSummary(row.note, row)),
    nextCursor: rows.length > query.limit ? encodeCursor(offset + query.limit) : null,
  };
}

/** Replace the caller's own categories on a note (CAT-3, CAT-4). */
export async function setNoteCategories(
  db: Db,
  noteId: string,
  userId: string,
  categoryIds: string[],
): Promise<void> {
  const ids = [...new Set(categoryIds)];
  if (ids.length > 0) {
    const owned = await db.category.count({ where: { id: { in: ids }, userId } });
    if (owned !== ids.length) throw badRequest('Unknown category.', 'VALIDATION_ERROR');
  }
  await db.noteCategory.deleteMany({ where: { noteId, category: { userId } } });
  if (ids.length > 0) {
    await db.noteCategory.createMany({ data: ids.map((categoryId) => ({ noteId, categoryId })) });
  }
}

export async function createNote(prisma: PrismaClient, userId: string, input: CreateNoteInput): Promise<NoteDto> {
  assertContentSize(input.content);
  if (input.locked) assertEncrypted(input.content);
  const noteId = await prisma.$transaction(async (tx) => {
    const note = await tx.note.create({
      data: {
        title: input.title,
        type: input.type,
        content: input.content,
        locked: input.locked,
        updatedById: userId,
        members: { create: { userId, role: 'owner', pinned: input.pinned } },
      },
    });
    await setNoteCategories(tx, note.id, userId, input.categoryIds);
    return note.id;
  });
  return getNote(prisma, noteId, userId);
}

/**
 * Apply a content update if `input.version` is still current (NOTE-13).
 * Returns false on a version conflict. Access must be checked by the caller.
 */
export async function applyNoteUpdate(
  db: Db,
  noteId: string,
  actorUserId: string | null,
  input: UpdateNoteInput,
  options: { mayChangeLock: boolean },
): Promise<boolean> {
  const current = await db.note.findUnique({
    where: { id: noteId },
    select: { type: true, content: true, locked: true },
  });
  if (!current) throw notFound('Note not found.');
  const locked = input.locked ?? current.locked;
  if (input.locked !== undefined && input.locked !== current.locked) {
    if (!options.mayChangeLock) throw forbidden('Only the owner can lock or unlock this note.');
    if (input.content === undefined) {
      throw badRequest('Send the content when locking or unlocking a note.', 'VALIDATION_ERROR');
    }
  }
  let content = input.content;
  if (locked) {
    // NOTE-17: the server cannot read or convert encrypted content.
    if (input.type !== undefined && input.type !== current.type && content === undefined) {
      throw badRequest('A locked note changes type only together with its content.', 'VALIDATION_ERROR');
    }
    if (content !== undefined) assertEncrypted(content);
  } else if (input.type === 'list' && current.type === 'text' && content === undefined) {
    content = textToList(current.content);
  }
  assertContentSize(content);
  const result = await db.note.updateMany({
    where: { id: noteId, version: input.version },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(content !== undefined ? { content } : {}),
      ...(input.locked !== undefined ? { locked: input.locked } : {}),
      version: { increment: 1 },
      updatedById: actorUserId,
      updatedAt: new Date(),
    },
  });
  return result.count === 1;
}

/** NOTE-17: a locked note only ever stores an encrypted envelope. */
function assertEncrypted(content: string): void {
  if (!isEncryptedContent(content)) {
    throw badRequest('The content of a locked note must be encrypted by the app.', 'INVALID_ENCRYPTED_CONTENT');
  }
}

/**
 * Check or uncheck one task item. The server locates the item itself, so concurrent edits elsewhere
 * in the note do not conflict. Access must be checked by the caller.
 */
export async function applyToggleItem(
  db: Db,
  noteId: string,
  actorUserId: string | null,
  input: ToggleItemInput,
): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const note = await db.note.findUnique({ where: { id: noteId }, select: { content: true, version: true, locked: true } });
    if (!note) throw notFound('Note not found.');
    if (note.locked) {
      throw new AppError(409, 'NOTE_LOCKED', 'This note is encrypted: the app saves its checkboxes with the content.');
    }
    const next = toggleTaskItem(note.content, input);
    if (next === null) throw new AppError(409, 'ITEM_NOT_FOUND', 'This item no longer exists in the note.');
    if (next === note.content) return;
    const result = await db.note.updateMany({
      where: { id: noteId, version: note.version },
      data: { content: next, version: { increment: 1 }, updatedById: actorUserId, updatedAt: new Date() },
    });
    if (result.count === 1) return;
  }
  throw new AppError(409, 'NOTE_VERSION_CONFLICT', 'The note is being edited, try again.');
}

export function versionConflict(current: unknown): AppError {
  return new AppError(409, 'NOTE_VERSION_CONFLICT', 'The note was modified by someone else.', { current });
}
